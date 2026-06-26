/* Vercel 서버리스 — GET /api/youtube/search?q=...&n=3 (무키 결과 파싱). */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchYoutube } from '../../server/gateway/youtube.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = (typeof req.query.q === 'string' ? req.query.q : '').trim();
  const n = Number(req.query.n ?? 3) || 3;
  if (!q) {
    res.status(200).json({ ok: false, error: 'missing q' });
    return;
  }
  try {
    const results = await searchYoutube(q, n);
    res.status(200).json({ ok: true, results });
  } catch (e) {
    res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
