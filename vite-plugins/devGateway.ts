import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGatewayRequest, type GatewayConfig } from '../server/gateway/handler';
import { streamChatResponse, type ChatStreamBody } from '../server/gateway/chat';
import { searchYoutube } from '../server/gateway/youtube';
import { unfurlLink } from '../server/gateway/unfurl';
import { startVideo, pollVideo } from '../server/gateway/video';
import { dbListLessons, dbSaveLesson, dbRemoveLesson } from '../server/gateway/lessons';

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
        videoModel: env.KV_GEMINI_VIDEO_MODEL || process.env.KV_GEMINI_VIDEO_MODEL,
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

      // 지난 수업 저장(서버 미러, 파일 DB) — GET 목록 · POST 저장 · DELETE ?id= 삭제.
      server.middlewares.use('/api/lessons', (req, res) => {
        const done = (p: Promise<unknown>) =>
          p
            .then((body) => sendJson(res, 200, body))
            .catch((e) =>
              sendJson(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) }),
            );
        if (req.method === 'GET') {
          done(dbListLessons().then((lessons) => ({ ok: true, lessons })));
        } else if (req.method === 'POST') {
          done(
            readJsonBody(req)
              .then((b) => dbSaveLesson(b as never))
              .then(() => ({ ok: true })),
          );
        } else if (req.method === 'DELETE') {
          const u = new URL(req.url ?? '', 'http://localhost');
          done(dbRemoveLesson(u.searchParams.get('id') ?? '').then(() => ({ ok: true })));
        } else {
          sendJson(res, 405, { ok: false, error: 'method not allowed' });
        }
      });

      // 유튜브 검색(무키 — 결과 페이지 파싱) — 보드의 유튜브 뷰어 카드용.
      server.middlewares.use('/api/youtube/search', (req, res) => {
        const u = new URL(req.url ?? '', 'http://localhost');
        const q = (u.searchParams.get('q') ?? '').trim();
        const n = Number(u.searchParams.get('n') ?? 3) || 3;
        if (!q) {
          sendJson(res, 200, { ok: false, error: 'missing q' });
          return;
        }
        searchYoutube(q, n)
          .then((results) => sendJson(res, 200, { ok: true, results }))
          .catch((e) =>
            sendJson(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) }),
          );
      });

      // 링크 미리보기(언퍼를) — 리다이렉트를 따라가 og:image·제목을 파싱. 웹 검색
      // 결과 링크의 실제 썸네일을 가져오는 데 쓴다(브라우저는 CORS로 막혀 서버에서만 가능).
      server.middlewares.use('/api/unfurl', (req, res) => {
        const u = new URL(req.url ?? '', 'http://localhost');
        const target = (u.searchParams.get('url') ?? '').trim();
        if (!target) {
          sendJson(res, 200, { ok: false, error: 'missing url' });
          return;
        }
        unfurlLink(target)
          .then((r) => sendJson(res, 200, { ok: true, ...r }))
          .catch((e) => sendJson(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) }));
      });

      // 영상 생성 시작(Veo, 비동기) — 키는 서버에만. 텍스트/이미지→비디오 공용.
      server.middlewares.use('/api/ai/video/start', (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method not allowed' });
          return;
        }
        readJsonBody(req)
          .then((b) => {
            const body = (b ?? {}) as {
              prompt?: string;
              imageDataUri?: string;
              aspectRatio?: string;
              durationSeconds?: number;
              negativePrompt?: string;
            };
            return startVideo({
              geminiKey: config.geminiKey,
              model: config.videoModel,
              prompt: body.prompt ?? '',
              imageDataUri: body.imageDataUri,
              aspectRatio: body.aspectRatio,
              durationSeconds: body.durationSeconds,
              negativePrompt: body.negativePrompt,
            });
          })
          .then((r) => sendJson(res, 200, { ok: !r.error, ...r }))
          .catch((e) => sendJson(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) }));
      });

      // 영상 생성 폴링 — done:true면 서버가 mp4를 받아 data URI로 변환해 돌려준다.
      server.middlewares.use('/api/ai/video/poll', (req, res) => {
        const u = new URL(req.url ?? '', 'http://localhost');
        const op = (u.searchParams.get('op') ?? '').trim();
        if (!op) {
          sendJson(res, 200, { ok: false, error: 'missing op' });
          return;
        }
        pollVideo(op, config.geminiKey)
          .then((r) => sendJson(res, 200, { ok: !r.error, ...r }))
          .catch((e) => sendJson(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) }));
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
