/* Shared gateway wire types — used by both the client caller (src/ai/client.ts)
   and the server handler (server/gateway/handler.ts). Kept dependency-free and
   framework-free (PRD §7: 얇은 게이트웨이, 직접 API 호출). */

export type Tier = 'low' | 'mid' | 'high';
export type TierOrAuto = Tier | 'auto';
export type Provider = 'anthropic' | 'gemini';
export type ProviderOrAuto = Provider | 'auto';

export interface GatewayMessage {
  role: 'user' | 'assistant';
  content: string;
}

/* gateway.run({ task, provider:"auto", tier:"auto", cache, fallback }) — PRD §7.3 */
export interface GatewayRequest {
  /** Logical task name, e.g. "router". Drives default tier/provider. */
  task: string;
  tier?: TierOrAuto;
  provider?: ProviderOrAuto;
  system?: string;
  messages: GatewayMessage[];
  /** Ask the provider for JSON when supported. */
  responseFormat?: 'json' | 'text';
  /** Cascade order when the primary tier fails (PRD §7.2.3). */
  fallback?: Tier[];
  /** Prompt-cache hints (PRD §7.2.1) — reserved; honored where supported. */
  cache?: string[];
  /** Pass-through context (e.g. RouterInput) for the mock + telemetry. */
  meta?: unknown;
  maxTokens?: number;
}

export interface GatewayResponse {
  ok: boolean;
  /** Raw model text (for router: a JSON string to be parsed/validated). */
  text?: string;
  /** Image data URI (for task "image"). */
  image?: string;
  provider?: Provider;
  model?: string;
  tier?: Tier;
  /** True when served by the offline mock / placeholder (no API key configured). */
  mocked?: boolean;
  error?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}
