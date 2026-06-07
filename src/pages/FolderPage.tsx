import { useState } from 'react';
import { Icon } from '@/lib/icons';
import { useFolderStore } from '@/store/folderStore';
import { RegistryRenderer } from '@/ui-registry/registry';

/* 폴더 (PRD §4.6). 레인 저장 = 번들 1건(계획안+활동지+이미지+연결자료).
   제목 하나로 전체 재오픈, plan↔worksheet 연결 표시(SKILL §9.4). */

export function FolderPage() {
  const bundles = useFolderStore((s) => s.bundles);
  const removeBundle = useFolderStore((s) => s.removeBundle);
  const [open, setOpen] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-5xl px-t6 pt-t7 pb-40">
      <header className="mb-t6">
        <div className="text-overline mb-t2 text-fg-muted">산출물 저장·정리</div>
        <h1 className="font-display text-display font-semibold tracking-[-0.01em] text-fg">폴더</h1>
      </header>

      {bundles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-t6 py-t10 text-center">
          <p className="text-body text-fg-muted">
            저장된 번들이 없어요. My Board에서 워크플로 레인을 완성하고 <b>레인 저장</b>을 누르면 여기에 묶여 저장됩니다.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-t4">
          {bundles.map((b) => {
            const isOpen = open === b.id;
            return (
              <div key={b.id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                <div className="flex items-center gap-t3 px-t5 py-t4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-accent-soft text-accent">
                    <Icon name="folder" size={18} />
                  </span>
                  <div>
                    <div className="font-display text-h4 font-semibold text-fg">{b.title}</div>
                    <div className="text-overline text-fg-muted">
                      {b.template} · {b.items.length}개 산출물
                      {b.hasWorksheetLink && ' · 활동지↔계획 연결됨'}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-t2">
                    <button
                      onClick={() => setOpen(isOpen ? null : b.id)}
                      className="rounded-pill border border-border px-t3 py-1 text-sm text-fg-2 hover:bg-surface-2"
                    >
                      {isOpen ? '접기' : '열기'}
                    </button>
                    {confirmDel === b.id ? (
                      <span className="flex items-center gap-t1 text-overline">
                        <span className="text-fg-2">영구 삭제(L3)?</span>
                        <button
                          onClick={() => { removeBundle(b.id); setConfirmDel(null); }}
                          className="rounded-pill bg-danger px-t2 py-0.5 text-on-accent"
                        >
                          삭제
                        </button>
                        <button onClick={() => setConfirmDel(null)} className="rounded-pill border border-border px-t2 py-0.5 text-fg-2">
                          취소
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDel(b.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-pill text-fg-muted hover:text-danger"
                        aria-label="번들 삭제"
                      >
                        <Icon name="x" size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-border bg-bg-deep/40 p-t5">
                    <div className="flex flex-col gap-t5">
                      {b.items.map((it, i) => (
                        <div key={i}>
                          <div className="text-overline mb-t2 text-fg-muted">{it.title}</div>
                          {it.payload ? (
                            <RegistryRenderer payload={it.payload} />
                          ) : (
                            <div className="rounded-md border border-border bg-surface px-t4 py-t3 text-sm text-fg-muted">
                              {it.kind} 산출물
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
