/**
 * 문서 편집 페이지 — /doc/:nodeId/edit.
 *
 * 보드의 '문서' 카드 우상단 연필(문서 편집)로 진입한다. 3분할:
 *  - 왼쪽: 놀이계획이면 구조 편집창(PlanFieldsEditor), 그 외는 섹션 편집창(SectionTextEditor).
 *  - 가운데: 렌더된 문서(DocSections) — 영역(섹션)을 클릭해 선택.
 *  - 아래: 공용 프롬프트바(AppShell 이 도킹) — 선택 영역만 프롬프트로 AI 수정.
 *
 * 프롬프트 라우팅: 이 페이지가 떠 있는 동안 uiStore.docEditNodeId 를 세팅하면 프롬프트바가
 * 입력을 'kv:doc-edit-prompt' CustomEvent 로 보내고, 여기서 받아 선택 영역에 적용한다.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBoardStore } from '@/store/boardStore';
import { useUIStore } from '@/store/uiStore';
import { showToast } from '@/lib/toast';
import { Icon } from '@/lib/icons';
import { applyDocPrompt } from '@/board/docEdit';
import { DocSections } from '@/features/doc-edit/DocSections';
import { PlanFieldsEditor } from '@/features/doc-edit/PlanFieldsEditor';
import { SectionTextEditor } from '@/features/doc-edit/SectionTextEditor';
import type { RegistryPayload, WeeklyPlanGridProps } from '@/ui-registry/contracts';

export function DocEditPage() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const navigate = useNavigate();
  const node = useBoardStore((s) => (nodeId ? s.nodes[nodeId] : undefined));
  const setDocEdit = useUIStore((s) => s.setDocEdit);
  const setDocEditSelCount = useUIStore((s) => s.setDocEditSelCount);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selRef = useRef<string[]>([]);
  useEffect(() => {
    selRef.current = selectedIds;
  }, [selectedIds]);
  useEffect(() => {
    setDocEditSelCount(selectedIds.length);
  }, [selectedIds, setDocEditSelCount]);

  // 이 페이지가 떠 있는 동안만 프롬프트바를 문서 편집으로 라우팅(언마운트 시 반드시 해제).
  useEffect(() => {
    if (!nodeId) return;
    setDocEdit(nodeId);
    const onPrompt = (e: Event) => {
      const prompt = ((e as CustomEvent).detail?.prompt ?? '').trim();
      if (!prompt) return;
      const board = useBoardStore.getState();
      board.beginGen();
      board.setGenerating('✏️ 문서를 고치는 중…');
      applyDocPrompt(nodeId, prompt, selRef.current, (m) => board.setGenerating(m ?? '✏️ 문서를 고치는 중…'))
        .then((r) => showToast(r.message, r.ok ? 'success' : 'error'))
        .catch(() => showToast('수정 중 문제가 생겼어요', 'error'))
        .finally(() => board.endGen());
    };
    window.addEventListener('kv:doc-edit-prompt', onPrompt as EventListener);
    return () => {
      window.removeEventListener('kv:doc-edit-prompt', onPrompt as EventListener);
      setDocEdit(null);
    };
  }, [nodeId, setDocEdit]);

  // 문서를 못 찾음(딥링크·다른 보드) — 폴백.
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-t4 p-t8 text-center">
        <p className="font-display text-lg font-semibold text-fg">문서를 찾을 수 없어요</p>
        <p className="text-sm text-fg-muted">보드에서 문서 카드의 편집 버튼으로 다시 열어 주세요.</p>
        <button
          onClick={() => navigate('/board')}
          className="inline-flex items-center gap-t1 rounded-pill bg-accent px-t4 py-t2 text-sm font-semibold text-on-accent shadow-sm hover:bg-accent-hover"
        >
          <Icon name="home" size={16} /> 보드로
        </button>
      </div>
    );
  }

  const payload = node.data?.payload as RegistryPayload | undefined;
  const hasPlanPayload = payload?.type === 'WeeklyPlanGrid';
  const isPlan = node.data?.role === 'plan' || hasPlanPayload;
  const isProject = isPlan && /프로젝트/.test(node.text ?? '');
  const docTitle = (node.text ?? '').match(/^#\s+(.+)$/m)?.[1]?.trim() || (isPlan ? '놀이계획' : '문서');

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* 상단 크롬 */}
      <header className="flex shrink-0 items-center justify-between gap-t3 border-b border-border bg-surface px-t5 py-t3">
        <div className="flex min-w-0 items-center gap-t3">
          <button
            onClick={() => navigate('/board')}
            title="보드로 돌아가기"
            className="flex h-9 items-center gap-t1 rounded-pill border border-border bg-surface px-t3 text-sm font-semibold text-fg-2 transition-colors duration-150 ease-soft hover:border-accent hover:bg-accent hover:text-on-accent"
          >
            <Icon name="chevronLeft" size={16} /> 보드로
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-semibold text-fg">{docTitle}</h1>
            <p className="text-overline uppercase tracking-wide text-fg-muted">{isProject ? '프로젝트 수업 계획' : isPlan ? '주간 놀이계획' : '문서'} 편집</p>
          </div>
        </div>
        <span className="hidden shrink-0 text-xs text-fg-muted sm:block">
          {selectedIds.length > 0 ? `영역 ${selectedIds.length}개 선택 — 아래 프롬프트로 수정` : '문서 영역을 눌러 선택하거나, 왼쪽에서 편집'}
        </span>
      </header>

      {/* 본문 — 좌 편집창 / 중 문서. 프롬프트바는 AppShell 이 하단에 도킹. */}
      <div className="flex min-h-0 flex-1">
        <aside className="w-[340px] shrink-0 overflow-y-auto border-r border-border bg-surface-2 p-t5 pb-40">
          <h2 className="mb-t4 font-display text-sm font-semibold text-fg">{isPlan ? '놀이계획 편집' : '문서 편집'}</h2>
          {hasPlanPayload ? (
            <PlanFieldsEditor nodeId={node.id} payload={payload!.props as WeeklyPlanGridProps} isProject={isProject} />
          ) : (
            <SectionTextEditor nodeId={node.id} md={node.text ?? ''} />
          )}
          {isPlan && !hasPlanPayload && (
            <p className="mt-t4 rounded-md border border-border bg-surface p-t3 text-xs text-fg-muted">
              이 놀이계획은 구조 정보가 없어 표 편집 대신 영역 편집으로 보여드려요.
            </p>
          )}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto px-t6 py-t6 pb-40">
          <DocSections md={node.text ?? ''} selectedIds={selectedIds} onToggle={(id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))} />
        </main>
      </div>
    </div>
  );
}
