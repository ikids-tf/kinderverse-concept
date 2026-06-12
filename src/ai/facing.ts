import { callGateway } from './client';

/* 그림 속 주인공이 바라보는(향하는) 방향 분석 — 이동 애니메이션의 플립 기준.
   기본 가정은 '오른쪽을 본다'지만, 왼쪽을 보는 그림(예: 물고기)은 반대로 뒤집어야
   하므로 비전 모델에게 한 번 묻고 카드(data.facing)에 캐시한다. */

export type Facing = 'left' | 'right' | 'none';

const QUESTION =
  '이 그림의 주인공(가장 크거나 중심이 되는 동물·캐릭터·사물·탈것)이 어느 쪽을 바라보거나 향하고 있는가? ' +
  '머리·얼굴·시선·진행 방향을 기준으로 판단하라. ' +
  '왼쪽이면 left, 오른쪽이면 right, 정면/뒷모습/대칭이라 모호하면 none — 이 중 한 단어만 출력하라.';

/** 이미지(data URI) → 주인공의 방향. 분석 실패/키 없음/모호 → 'none'. */
export async function analyzeImageFacing(image: string): Promise<{ facing: Facing; mocked: boolean }> {
  const res = await callGateway({
    task: 'vision',
    provider: 'auto',
    messages: [],
    meta: { image, question: QUESTION },
  });
  const t = (res.text ?? '').toLowerCase();
  // 'right'가 'left'보다 흔한 오답 포함 표현이 없도록 단어 우선 매칭
  const facing: Facing = /\bleft\b|왼쪽/.test(t) ? 'left' : /\bright\b|오른쪽/.test(t) ? 'right' : 'none';
  return { facing, mocked: !!res.mocked };
}
