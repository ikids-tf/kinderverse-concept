/* Vercel 서버리스 — GET /api/unfurl?url=... (링크 og:image·제목 파싱, CORS 우회). */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { unfurlLink } from '../server/gateway/unfurl.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const target = (typeof req.query.url === 'string' ? req.query.url : '').trim();
  if (!target) {
    res.status(200).json({ ok: false, error: 'missing url' });
    return;
  }
  try {
    const r = await unfurlLink(target);
    res.status(200).json({ ok: true, ...r });
  } catch (e) {
    res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
