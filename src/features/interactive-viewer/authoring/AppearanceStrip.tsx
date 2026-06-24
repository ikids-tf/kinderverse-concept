/**
 * 캐릭터 '다중 모습' 편집 스트립 — 편집모드에서 swap(교체) 동작을 가진 요소(여러 모습)를 선택하면,
 * 맨몸(기본) + 각 swap.to 모습을 가로 썸네일로 펼친다. 썸네일 클릭 → 그 모습을 이미지 편집(배경제거·교체).
 * (옷입히기처럼 캐릭터가 여러 착장을 가질 때, swap 안에 숨어 편집 못 하던 모습들을 끌어내 편집 가능하게.)
 * 앱 크롬 → Milray 토큰.
 */
import { Icon } from '@/lib/icons';

export interface Appearance {
  /** 썸네일 키. */
  key: string;
  /** 표시·편집할 이미지 src. */
  src: string;
  /** 되돌려 쓸 대상 — null=요소의 기본 src, 아니면 그 swap behavior 의 params.to. */
  behId: string | null;
}

export function AppearanceStrip({
  appearances,
  onPick,
  onClose,
}: {
  appearances: Appearance[];
  onPick: (a: Appearance) => void;
  onClose: () => void;
}) {
  return (
    <div className="kv-fsbar-enter pointer-events-auto absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-border bg-surface/95 px-3 py-2 shadow-lg backdrop-blur">
      <span className="px-1 text-xs font-bold text-fg-2">이 캐릭터의 모습 — 눌러서 편집</span>
      {appearances.map((a, i) => (
        <button
          key={a.key}
          onClick={() => onPick(a)}
          title="이 모습 편집 (배경 제거·교체)"
          className="group flex flex-col items-center gap-0.5"
        >
          <span className="relative block h-16 w-16 overflow-hidden rounded-xl border border-border bg-surface-2 transition-colors group-hover:border-accent">
            <img src={a.src} alt="" draggable={false} className="h-full w-full object-contain" />
            <span className="absolute right-0.5 top-0.5 hidden rounded-full bg-surface/90 p-0.5 text-accent shadow-sm group-hover:flex">
              <Icon name="edit" size={11} />
            </span>
          </span>
          <span className="text-[10px] font-semibold text-fg-2">{i === 0 ? '기본' : `모습 ${i + 1}`}</span>
        </button>
      ))}
      <button
        onClick={onClose}
        className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-pill text-fg-2 transition-colors hover:bg-accent-soft hover:text-fg"
        aria-label="닫기"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
