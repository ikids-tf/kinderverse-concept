/* Link unfurl — server-side (no CORS in the middleware) so we can follow
   redirects and read a page's preview image. Gemini Google Search grounding
   hands back vertexaisearch redirect URLs that hide the real page; fetching them
   here follows the redirect to the real site, then we parse og:image / og:title.
   Works for YouTube too (its og:image IS the video thumbnail). Best-effort:
   returns just the resolved URL when there's no usable preview.
   Dev middleware mounts this at GET /api/unfurl?url=…; a prod serverless
   function can reuse it as-is. */

export interface UnfurlResult {
  /** Final URL after following redirects. */
  url: string;
  /** og:image / twitter:image (absolute). */
  thumb?: string;
  /** og:title or <title>. */
  title?: string;
  /** Can a cross-origin page (our board) frame this URL? Read from the page's
     X-Frame-Options / CSP frame-ancestors. undefined = unknown (treat as no). */
  embeddable?: boolean;
}

/** Can WE (a cross-origin page) put this response in an <iframe>? Conservative:
   true only when neither X-Frame-Options nor CSP frame-ancestors restricts us.
   DENY/SAMEORIGIN/ALLOW-FROM → no. frame-ancestors that isn't a bare '*' → no. */
function frameEmbeddable(res: Response): boolean {
  const xfo = (res.headers.get('x-frame-options') || '').toLowerCase();
  if (xfo.includes('deny') || xfo.includes('sameorigin') || xfo.includes('allow-from')) return false;
  const csp = (res.headers.get('content-security-policy') || '').toLowerCase();
  const m = csp.match(/frame-ancestors([^;]*)/);
  if (m) {
    const tokens = m[1].trim().split(/\s+/).filter(Boolean);
    if (!tokens.includes('*')) return false; // 'none'/'self'/특정 출처 → 우리는 못 박음
  }
  return true;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Extract a YouTube video id from any of its URL shapes (watch/youtu.be/shorts/embed). */
function youtubeId(u: string): string | undefined {
  const m =
    u.match(/[?&]v=([\w-]{11})/) ||
    u.match(/youtu\.be\/([\w-]{11})/) ||
    u.match(/\/shorts\/([\w-]{11})/) ||
    u.match(/\/embed\/([\w-]{11})/);
  return m?.[1];
}

/** Read a <meta property|name="key" content="…"> value, in either attribute order. */
function metaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return undefined;
}

export async function unfurlLink(rawUrl: string): Promise<UnfurlResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(rawUrl, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ko-KR,ko;q=0.9',
        // EU 동의 페이지 우회 — 없으면 YouTube가 og 태그 없는 consent HTML을 준다.
        cookie: 'CONSENT=YES+1',
      },
    });
    const finalUrl = res.url || rawUrl;

    // YouTube: og 파싱이 동의 벽으로 불안정하니, 키 없는 oEmbed로 실제 제목·썸네일을
    // 받아온다(영상 추천 카드와 동일한 i.ytimg.com 썸네일). 실패 시 id로 썸네일만.
    const ytId = youtubeId(finalUrl);
    if (ytId) {
      let thumb = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
      let title: string | undefined;
      try {
        const o = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ytId}`)}&format=json`,
          { signal: ctrl.signal, headers: { 'user-agent': UA } },
        );
        if (o.ok) {
          const oj = (await o.json()) as { title?: string; thumbnail_url?: string };
          if (oj.title) title = oj.title.slice(0, 80);
          if (oj.thumbnail_url) thumb = oj.thumbnail_url;
        }
      } catch {
        /* oEmbed 실패 — id 기반 썸네일 유지 */
      }
      // YouTube watch 페이지는 X-Frame-Options SAMEORIGIN — 웹뷰어로 못 박음(전용 뷰어 사용).
      return { url: finalUrl, thumb, title, embeddable: false };
    }

    const ct = res.headers.get('content-type') ?? '';
    if (!res.ok || !ct.includes('text/html')) return { url: finalUrl, embeddable: res.ok && frameEmbeddable(res) };
    // og tags live in <head>; cap the read so a huge page can't stall us.
    const html = (await res.text()).slice(0, 250_000);
    let thumb = metaContent(html, 'og:image') || metaContent(html, 'twitter:image') || metaContent(html, 'image');
    if (thumb) {
      try {
        thumb = new URL(thumb, finalUrl).href;
      } catch {
        thumb = undefined;
      }
    }
    const titleRaw = metaContent(html, 'og:title') ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const title = titleRaw ? decodeEntities(titleRaw).trim().slice(0, 80) : undefined;
    return { url: finalUrl, thumb, title, embeddable: frameEmbeddable(res) };
  } catch {
    return { url: rawUrl };
  } finally {
    clearTimeout(timer);
  }
}
