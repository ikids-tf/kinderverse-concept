import { Icon } from '@/lib/icons';
import type { StudioGalleryProps } from './contracts';
import type { ComponentState } from './state';
import { CardFrame } from './parts';

/* 이미지/도안 (agent.studio). "AI 생성" 라벨 필수 — 실제 아동 사진 아님(§9.5). */

export function StudioGallery({
  props,
  state = 'ready',
}: {
  props: StudioGalleryProps;
  state?: ComponentState;
}) {
  if (state === 'loading' || state === 'error') return <CardFrame state={state} />;

  return (
    <CardFrame state={state} eyebrow="스튜디오 · AI 생성" title={props.title}>
      <div className="grid grid-cols-2 gap-t3 sm:grid-cols-3">
        {props.items.map((it, i) => (
          <figure key={i} className="overflow-hidden rounded-md border border-border">
            <div className="relative aspect-square bg-surface-2">
              {it.url ? (
                <img src={it.url} alt={it.caption} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-fg-muted">
                  <Icon name="studio" size={24} />
                </div>
              )}
              <span className="absolute left-1 top-1 rounded-pill bg-fg/80 px-t2 py-0.5 text-[10px] text-on-dark">
                AI 생성{it.kind === '도안' ? ' · 도안' : ''}
              </span>
            </div>
            <figcaption className="px-t2 py-t1 text-overline text-fg-muted">{it.caption}</figcaption>
          </figure>
        ))}
      </div>
    </CardFrame>
  );
}
