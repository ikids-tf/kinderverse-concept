/* CLOVA Voice (NCP) TTS 플러그인 — 게임 나레이션 음성 합성 (PRD §7.1, CLAUDE §1: 음성은 플러그인).
   CLOVA_VOICE_CLIENT_ID + CLOVA_VOICE_CLIENT_SECRET 가 설정되면 NAVER Cloud Platform
   CLOVA Voice(Premium)로 실제 합성, 아니면 { real:false }를 돌려 클라이언트가 브라우저
   speechSynthesis 로 폴백한다. 서버 전용 — 키는 브라우저에 절대 노출되지 않는다.
   오디오는 base64 data URI(mp3)로 인라인 반환해 별도 Storage 없이 동작한다(같은 문장
   재합성은 클라이언트가 캐시로 0). 전송 텍스트는 게임 지시문(일반 문장)으로 아동 매체가 아니다. */

export type TtsTone = 'bright' | 'calm';

interface SynthOpts {
  clientId?: string;
  clientSecret?: string;
  text: string;
  /** 유아용 톤 — bright(밝게) / calm(차분). 화자 선택에 매핑. */
  tone?: TtsTone;
  locale?: string;
  /** 화자(speaker) 오버라이드 — 톤별. NCP CLOVA Voice 화자 id(.env 로 교체). */
  speakerBright?: string;
  speakerCalm?: string;
  /** 합성 엔드포인트 오버라이드(기본 Premium). */
  endpoint?: string;
}

/* CLOVA Voice Premium 합성 엔드포인트(NCP API Gateway). */
const PREMIUM_ENDPOINT = 'https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts';

/* 기본 화자 — 'nara'(여성)는 항상 존재하는 안전한 기본값. 아이 화자(예: 'ndain')나
   다른 톤은 .env(CLOVA_VOICE_SPEAKER_BRIGHT / _CALM)로 교체한다. */
const DEFAULT_SPEAKER_BRIGHT = 'nara';
const DEFAULT_SPEAKER_CALM = 'nara';

/** CLOVA Voice 로 text 를 합성해 { audio: dataURI(mp3), real } 반환. 키 없음/실패 시
    { real:false, detail }(비민감 진단) → 클라이언트가 브라우저 TTS 로 폴백. */
export async function synthSpeech(
  opts: SynthOpts,
): Promise<{ audio?: string; real: boolean; detail?: string }> {
  const text = (opts.text ?? '').trim();
  if (!text) return { real: false, detail: 'empty text' };
  if (!opts.clientId || !opts.clientSecret) {
    return { real: false, detail: 'no CLOVA_VOICE_CLIENT_ID/SECRET' };
  }
  const bright = (opts.tone ?? 'bright') === 'bright';
  const speaker = bright
    ? opts.speakerBright || DEFAULT_SPEAKER_BRIGHT
    : opts.speakerCalm || DEFAULT_SPEAKER_CALM;
  const params = new URLSearchParams({ speaker, text, format: 'mp3' });
  try {
    const res = await fetch(opts.endpoint || PREMIUM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-NCP-APIGW-API-KEY-ID': opts.clientId,
        'X-NCP-APIGW-API-KEY': opts.clientSecret,
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { real: false, detail: `CLOVA HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return { real: false, detail: 'CLOVA: empty audio' };
    return { audio: `data:audio/mp3;base64,${buf.toString('base64')}`, real: true };
  } catch (e) {
    return { real: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
