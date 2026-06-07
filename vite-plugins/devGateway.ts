import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGatewayRequest, type GatewayConfig } from '../server/gateway/handler';
import { streamChatResponse, type ChatStreamBody } from '../server/gateway/chat';

/* Dev-only thin gateway: mounts POST /api/ai/run in the Vite dev server so the
   browser never sees provider keys. The same handler moves to a serverless /
   Supabase edge function in prod with an identical client contract.

   Keys are read from .env (ANTHROPIC_API_KEY / GEMINI_API_KEY). With neither set,
   the handler serves the offline mock so the app stays fully runnable. */

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(payload);
}

export function devGateway(): Plugin {
  let config: GatewayConfig = {};

  return {
    name: 'kv-dev-gateway',
    configResolved(resolved) {
      // loadEnv with '' prefix → all vars, including non-VITE_ server secrets.
      const env = loadEnv(resolved.mode, process.cwd(), '');
      config = {
        anthropicKey: env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
        geminiKey: env.GEMINI_API_KEY || process.env.GEMINI_API_KEY,
        imageModel: env.KV_GEMINI_IMAGE_MODEL || process.env.KV_GEMINI_IMAGE_MODEL,
        models: {
          ...(env.KV_ANTHROPIC_MODEL_LOW ? { 'anthropic.low': env.KV_ANTHROPIC_MODEL_LOW } : {}),
          ...(env.KV_ANTHROPIC_MODEL_MID ? { 'anthropic.mid': env.KV_ANTHROPIC_MODEL_MID } : {}),
          ...(env.KV_ANTHROPIC_MODEL_HIGH ? { 'anthropic.high': env.KV_ANTHROPIC_MODEL_HIGH } : {}),
          ...(env.KV_GEMINI_MODEL_LOW ? { 'gemini.low': env.KV_GEMINI_MODEL_LOW } : {}),
          ...(env.KV_GEMINI_MODEL_MID ? { 'gemini.mid': env.KV_GEMINI_MODEL_MID } : {}),
          ...(env.KV_GEMINI_MODEL_HIGH ? { 'gemini.high': env.KV_GEMINI_MODEL_HIGH } : {}),
        },
      };
    },
    configureServer(server) {
      server.middlewares.use('/api/ai/run', (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method not allowed' });
          return;
        }
        readJsonBody(req)
          .then((body) => handleGatewayRequest(body as never, config))
          .then((result) => sendJson(res, 200, result))
          .catch((e) =>
            sendJson(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) }),
          );
      });

      // Streaming conversational answer (SSE) — reference KinderVerse parity.
      server.middlewares.use('/api/ai/chat', (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method not allowed' });
          return;
        }
        readJsonBody(req)
          .then((body) => streamChatResponse(res, body as ChatStreamBody, config))
          .catch((e) => {
            if (!res.headersSent) {
              sendJson(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) });
            } else {
              res.end();
            }
          });
      });
    },
  };
}
