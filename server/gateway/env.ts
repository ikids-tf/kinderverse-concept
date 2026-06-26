/* 프로덕션(서버리스) 게이트웨이용 설정 — process.env에서 키/모델을 읽는다.
   dev는 vite-plugins/devGateway가 loadEnv로 같은 모양의 config를 만든다(동일 계약). */
import type { GatewayConfig } from './handler.js';

export function gatewayConfigFromEnv(): GatewayConfig {
  const e = process.env;
  return {
    anthropicKey: e.ANTHROPIC_API_KEY,
    geminiKey: e.GEMINI_API_KEY,
    imageModel: e.KV_GEMINI_IMAGE_MODEL,
    videoModel: e.KV_GEMINI_VIDEO_MODEL,
    clovaId: e.CLOVA_VOICE_CLIENT_ID,
    clovaSecret: e.CLOVA_VOICE_CLIENT_SECRET,
    clovaSpeakerBright: e.CLOVA_VOICE_SPEAKER_BRIGHT,
    clovaSpeakerCalm: e.CLOVA_VOICE_SPEAKER_CALM,
    models: {
      ...(e.KV_ANTHROPIC_MODEL_LOW ? { 'anthropic.low': e.KV_ANTHROPIC_MODEL_LOW } : {}),
      ...(e.KV_ANTHROPIC_MODEL_MID ? { 'anthropic.mid': e.KV_ANTHROPIC_MODEL_MID } : {}),
      ...(e.KV_ANTHROPIC_MODEL_HIGH ? { 'anthropic.high': e.KV_ANTHROPIC_MODEL_HIGH } : {}),
      ...(e.KV_GEMINI_MODEL_LOW ? { 'gemini.low': e.KV_GEMINI_MODEL_LOW } : {}),
      ...(e.KV_GEMINI_MODEL_MID ? { 'gemini.mid': e.KV_GEMINI_MODEL_MID } : {}),
      ...(e.KV_GEMINI_MODEL_HIGH ? { 'gemini.high': e.KV_GEMINI_MODEL_HIGH } : {}),
    },
  };
}
