/* Vercel 서버리스 — POST /api/ai/video/start (Veo 영상 생성 시작, 비동기). */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { startVideo } from '../../../server/gateway/video.js';
import { gatewayConfigFromEnv } from '../../../server/gateway/env.js';

export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  try {
    const cfg = gatewayConfigFromEnv();
    const body = (req.body ?? {}) as {
      prompt?: string;
      imageDataUri?: string;
      aspectRatio?: string;
      durationSeconds?: number;
      negativePrompt?: string;
    };
    const r = await startVideo({
      geminiKey: cfg.geminiKey,
      model: cfg.videoModel,
      prompt: body.prompt ?? '',
      imageDataUri: body.imageDataUri,
      aspectRatio: body.aspectRatio,
      durationSeconds: body.durationSeconds,
      negativePrompt: body.negativePrompt,
    });
    res.status(200).json({ ok: !r.error, ...r });
  } catch (e) {
    res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
