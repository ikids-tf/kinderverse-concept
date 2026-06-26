/* Vercel 서버리스 — GET /api/ai/video/poll?op=... (영상 생성 폴링). */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pollVideo } from '../../../server/gateway/video.js';
import { gatewayConfigFromEnv } from '../../../server/gateway/env.js';

export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const op = (typeof req.query.op === 'string' ? req.query.op : '').trim();
  if (!op) {
    res.status(200).json({ ok: false, error: 'missing op' });
    return;
  }
  try {
    const r = await pollVideo(op, gatewayConfigFromEnv().geminiKey);
    res.status(200).json({ ok: !r.error, ...r });
  } catch (e) {
    res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
