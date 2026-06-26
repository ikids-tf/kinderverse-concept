/* Vercel 서버리스 — POST /api/ai/chat (SSE 스트리밍 대화 답변). */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ServerResponse } from 'node:http';
import { streamChatResponse, type ChatStreamBody } from '../../server/gateway/chat.js';
import { gatewayConfigFromEnv } from '../../server/gateway/env.js';

export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  try {
    await streamChatResponse(res as unknown as ServerResponse, req.body as ChatStreamBody, gatewayConfigFromEnv());
  } catch (e) {
    if (!res.headersSent) res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    else res.end();
  }
}
