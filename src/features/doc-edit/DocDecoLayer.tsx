/**
 * 문서 꾸밈 이미지 레이어 — withImages 스킨 변형에서 주제 스티커 이미지(누끼 PNG)를
 * 종이 위에 '붙인 스티커'처럼 얹는다. 부모는 반드시 positioned(relative)여야 하고,
 * pointer-events-none 필수 — 아래 섹션들이 전부 클릭 선택 버튼이다(DocSections).
 * 슬롯: 제목 우측 → 우하단 모서리 걸침 → 좌측 중단 여백(최대 3장, 텍스트 겹침 최소 배치).
 */

interface Slot {
  style: React.CSSProperties;
  size: number;
  rot: number;
}

const SLOTS: Slot[] = [
  { style: { top: 6, right: 14 }, size: 76, rot: -7 }, // 제목 우측(h1 밴드 옆)
  { style: { bottom: -12, right: -10 }, size: 66, rot: 9 }, // 우하단 모서리 걸침
  { style: { top: '42%', left: -14 }, size: 58, rot: -10 }, // 좌측 중단 여백 걸침
];

export function DocDecoLayer({ images, compact }: { images: string[]; compact?: boolean }) {
  if (!images.length) return null;
  const scale = compact ? 0.72 : 1; // 보드 카드(좁음)에선 작게
  return (
    <>
      {images.slice(0, SLOTS.length).map((src, i) => {
        const s = SLOTS[i];
        return (
          <img
            key={i}
            src={src}
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none absolute z-10 select-none"
            style={{
              ...s.style,
              width: Math.round(s.size * scale),
              height: Math.round(s.size * scale),
              objectFit: 'contain',
              transform: `rotate(${s.rot}deg)`,
              filter: 'drop-shadow(0 2px 4px rgba(61, 52, 40, 0.18))',
            }}
          />
        );
      })}
    </>
  );
}
