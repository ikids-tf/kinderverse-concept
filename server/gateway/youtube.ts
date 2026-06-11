/* YouTube search — keyless. Fetches the public results page server-side (no CORS
   in the middleware) and extracts videoRenderer entries from ytInitialData.
   Thumbnails come from i.ytimg.com (public, no key). Dev middleware mounts this
   at GET /api/youtube/search; a prod serverless function can reuse it as-is. */

export interface YtResult {
  id: string;
  title: string;
  channel?: string;
  duration?: string;
}

/** ytInitialData 트리에서 videoRenderer를 재귀 수집(스키마 변동에 가장 강한 방식). */
function collect(o: unknown, out: YtResult[]): void {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) {
    for (const v of o) collect(v, out);
    return;
  }
  const rec = o as Record<string, unknown>;
  const r = rec.videoRenderer as
    | {
        videoId?: string;
        title?: { runs?: { text?: string }[]; simpleText?: string };
        ownerText?: { runs?: { text?: string }[] };
        lengthText?: { simpleText?: string };
      }
    | undefined;
  if (r?.videoId) {
    out.push({
      id: r.videoId,
      title: r.title?.runs?.[0]?.text ?? r.title?.simpleText ?? '',
      channel: r.ownerText?.runs?.[0]?.text,
      duration: r.lengthText?.simpleText,
    });
  }
  for (const v of Object.values(rec)) collect(v, out);
}

export async function searchYoutube(query: string, limit = 3): Promise<YtResult[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=ko`;
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'accept-language': 'ko-KR,ko;q=0.9',
      // EU 동의 페이지 우회 — 동의 없이는 결과 대신 consent HTML이 온다.
      cookie: 'CONSENT=YES+1',
    },
  });
  if (!res.ok) throw new Error(`youtube results ${res.status}`);
  const html = await res.text();
  const m = html.match(/var ytInitialData = (\{.+?\});<\/script>/s);
  if (!m) throw new Error('ytInitialData not found');
  const data = JSON.parse(m[1]) as unknown;
  const all: YtResult[] = [];
  collect(data, all);
  // 같은 영상이 섹션마다 중복 등장 → id 기준 첫 항목만.
  const seen = new Set<string>();
  const unique = all.filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
  return unique.slice(0, Math.max(1, limit));
}
