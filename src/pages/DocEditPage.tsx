/**
 * 문서 편집 페이지 — /doc/:nodeId/edit.
 *
 * 보드의 '문서' 카드 우상단 연필(문서 편집)로 진입한다. 3분할:
 *  - 왼쪽(위→아래): ① 기본 정보(제목·대상·교육과정·키워드+추천) ② 템플릿(문서 테마)·
 *    원클릭 AI 도구 ③ 표 직접 고치기(접이식) — 놀이계획이 아니면 섹션 편집창.
 *  - 가운데: 렌더된 문서(DocSections) — 영역(섹션)을 클릭해 선택. 놀이 운영/프로젝트
 *    전개 표는 **주차(행)별로도 선택**된다.
 *  - 아래: 공용 프롬프트바(AppShell 도킹, 좌패널 폭만큼 인셋 → 문서 가로 중앙) —
 *    선택 영역명이 placeholder 로 뜨고, 왼쪽 설정(연령·교육과정·키워드)이 함께 반영된다.
 *
 * 프롬프트 라우팅: 이 페이지가 떠 있는 동안 uiStore.docEditNodeId 를 세팅하면 프롬프트바가
 * 입력을 'kv:doc-edit-prompt' CustomEvent 로 보내고(좌패널 도구 버튼도 같은 이벤트),
 * 여기서 받아 선택 영역에 적용한다(applyDocPrompt — 좌패널 설정값은 그 안에서 수집).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBoardStore } from '@/store/boardStore';
import { useUIStore } from '@/store/uiStore';
import { showToast } from '@/lib/toast';
import { Icon } from '@/lib/icons';
import { applyDocPrompt } from '@/board/docEdit';
import { DocSections } from '@/features/doc-edit/DocSections';
import { PlanBasicInfo } from '@/features/doc-edit/PlanBasicInfo';
import { DocToolsPanel } from '@/features/doc-edit/DocToolsPanel';
import { PlanFieldsEditor } from '@/features/doc-edit/PlanFieldsEditor';
import { SectionTextEditor } from '@/features/doc-edit/SectionTextEditor';
import { VariantFlyout } from '@/features/doc-edit/VariantFlyout';
import { labelsForSelection } from '@/features/doc-edit/sections';
import { commitDocData } from '@/features/doc-edit/planCommit';
import { resolveDocSkin, type DocSkinFamily, type DocSkinVariant } from '@/features/doc-edit/docSkins';
import { ensureDocDecoImages } from '@/features/doc-edit/decoImages';
import type { RegistryPayload, WeeklyPlanGridProps } from '@/ui-registry/contracts';
import '@/features/doc-edit/doc-themes.css';

/** 좌패널 폭(px) — aside 폭과 프롬프트바 인셋이 공유하는 단일 상수(둘 다 이 값을 style 로 소비). */
const ASIDE_W = 400;

/** 선택 라벨 → placeholder 문구용 짧은 표시(총 ~40자 이내 — 긴 placeholder 는 잘려 보인다). */
function selLabelText(labels: Array<{ label: string }>): string {
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  const trunc = (s: string, n: number) => (clean(s).length > n ? `${clean(s).slice(0, n)}…` : clean(s));
  if (labels.length === 0) return '';
  if (labels.length === 1) return `'${trunc(labels[0].label, 18)}'`;
  if (labels.length <= 3) return `'${labels.map((l) => trunc(l.label, 9)).join('·')}'`;
  return `'${trunc(labels[0].label, 12)}' 외 ${labels.length - 1}곳`;
}

export function DocEditPage() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const navigate = useNavigate();
  const node = useBoardStore((s) => (nodeId ? s.nodes[nodeId] : undefined));
  const setDocEdit = useUIStore((s) => s.setDocEdit);
  const setDocEditSel = useUIStore((s) => s.setDocEditSel);
  const setPromptBarLeftInset = useUIStore((s) => s.setPromptBarLeftInset);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openFamily, setOpenFamily] = useState<DocSkinFamily | null>(null);
  const selRef = useRef<string[]>([]);
  useEffect(() => {
    selRef.current = selectedIds;
  }, [selectedIds]);

  // 선택 → 라벨 파생(문서 텍스트 기준 — AI 수정으로 섹션이 밀려도 항상 현재 문서 기준).
  // 존재하지 않는 id(스테일 선택)는 여기서 프루닝해 applyDocPrompt 로 새지 않게 한다.
  const nodeText = node?.text ?? '';
  useEffect(() => {
    const labels = labelsForSelection(nodeText, selectedIds);
    if (labels.length !== selectedIds.length) {
      setSelectedIds(labels.map((l) => l.id));
      return; // 다음 렌더에서 라벨 갱신
    }
    setDocEditSel(labels.length, selLabelText(labels));
  }, [selectedIds, nodeText, setDocEditSel]);

  // 프롬프트바를 문서 영역 가로 중앙으로 — 좌패널 폭만큼 인셋(AIChatPage 선례).
  useEffect(() => {
    setPromptBarLeftInset(ASIDE_W);
    return () => setPromptBarLeftInset(0);
  }, [setPromptBarLeftInset]);

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
  const skin = resolveDocSkin(node.data);
  const decoImages = Array.isArray(node.data?.docDecoImages) ? (node.data.docDecoImages as string[]) : [];

  /** 변형 적용 — 스킨 커밋 + 이미지 꾸밈 변형이면 주제 스티커 준비(갤러리 재사용/생성+누끼). */
  const pickVariant = (family: DocSkinFamily, v: DocSkinVariant) => {
    commitDocData(node.id, { docTheme: family, docVariant: v.id });
    if (v.withImages && decoImages.length < 3) {
      showToast('🎨 주제 그림을 준비하고 있어요 — 갤러리에 없으면 새로 그려요(수십 초)…', 'progress', 5000);
      void ensureDocDecoImages(node.id, docTitle, 3)
        .then((imgs) => {
          if (imgs.length) showToast('🖼️ 주제 그림을 붙였어요', 'success');
          else showToast('주제 그림을 준비하지 못했어요 — 색 꾸밈만 적용했어요', 'error', 3600);
        })
        .catch(() => showToast('주제 그림을 준비하지 못했어요 — 색 꾸밈만 적용했어요', 'error', 3600));
    }
  };

  /** 선택 토글 — 섹션↔그 섹션의 행은 상호 배타(부모 선택 시 자식 해제, 역도 성립). */
  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const hash = id.indexOf('#r');
      let next = prev;
      if (hash !== -1) next = next.filter((x) => x !== id.slice(0, hash)); // 행 선택 → 부모 섹션 해제
      else next = next.filter((x) => !x.startsWith(`${id}#r`)); // 섹션 선택 → 자식 행 해제
      return [...next, id];
    });
  };

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
          {selectedIds.length > 0
            ? `영역 ${selectedIds.length}개 선택 — 아래 프롬프트로 수정`
            : '문서 영역·주차를 눌러 선택하거나, 왼쪽에서 설정·꾸미기'}
        </span>
      </header>

      {/* 본문 — 좌 설정·꾸미기 패널 / 중 문서. 프롬프트바는 AppShell 이 하단에 도킹(ASIDE_W 인셋).
          relative = 변형 플라이아웃(aside 형제 absolute)의 기준점. */}
      <div className="relative flex min-h-0 flex-1">
        <aside className="shrink-0 overflow-y-auto border-r border-border bg-surface-2 p-t4 pb-40" style={{ width: ASIDE_W }}>
          <div className="flex flex-col gap-t3">
            {hasPlanPayload && (
              <PlanBasicInfo nodeId={node.id} payload={payload!.props as WeeklyPlanGridProps} isProject={isProject} />
            )}
            <DocToolsPanel
              nodeId={node.id}
              hasPlan={hasPlanPayload}
              isProject={isProject}
              openFamily={openFamily}
              onOpenVariants={(f) => setOpenFamily((cur) => (cur === f ? null : f))}
            />
            {hasPlanPayload ? (
              <details className="rounded-md border border-border bg-surface p-t3">
                <summary className="cursor-pointer select-none font-display text-sm font-semibold text-fg">
                  표를 직접 고칠래요
                </summary>
                <div className="mt-t3">
                  <PlanFieldsEditor nodeId={node.id} payload={payload!.props as WeeklyPlanGridProps} isProject={isProject} />
                </div>
              </details>
            ) : (
              <details className="rounded-md border border-border bg-surface p-t3" open>
                <summary className="cursor-pointer select-none font-display text-sm font-semibold text-fg">
                  영역별로 직접 고치기
                </summary>
                <div className="mt-t3">
                  <SectionTextEditor nodeId={node.id} md={node.text ?? ''} />
                </div>
              </details>
            )}
            {isPlan && !hasPlanPayload && (
              <p className="rounded-sm border border-border bg-surface p-t3 text-xs text-fg-muted">
                이 놀이계획은 구조 정보가 없어 표 편집 대신 영역 편집으로 보여드려요.
              </p>
            )}
          </div>
        </aside>

        {/* 변형 플라이아웃 — aside 형제 absolute(left=ASIDE_W). aside 는 클리핑 컨테이너라 안에 못 둔다. */}
        {openFamily && (
          <VariantFlyout
            family={openFamily}
            activeVariantId={skin?.variant.id}
            left={ASIDE_W + 8}
            onPick={(v) => pickVariant(openFamily, v)}
            onClose={() => setOpenFamily(null)}
          />
        )}

        <main className="min-w-0 flex-1 overflow-y-auto px-t6 py-t6 pb-40">
          <DocSections md={node.text ?? ''} selectedIds={selectedIds} onToggle={toggle} skin={skin} decoImages={decoImages} />
        </main>
      </div>
    </div>
  );
}
