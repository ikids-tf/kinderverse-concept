/**
 * 인터렉티브 슬라이드 — 수업 모드. 보드에서 만든 인터렉티브 노드(nodeId)를 슬라이드 한 장으로
 * 전체 재생한다. 블록 기반이 아니라 노드 하나가 슬라이드 전체.
 *  · nodeId 있음 → InteractiveStage를 play 모드로 렌더(탭하면 동작 실행).
 *  · nodeId 없음 + 편집 중 → 저장된 노드 목록에서 고르는 picker(고르면 kv:inode-slide-pick 발신,
 *    SlidesViewerApp이 현재 슬라이드의 nodeId로 반영).
 * 슬라이드 진행(다음 장)은 기존 교사 수동 컨트롤 그대로 — 노드 안 동작과 분리.
 */
import { useMemo, type FC } from 'react';
import type { LayoutProps } from './layouts';
import { InteractiveStage } from '../../interactive-viewer/runtime/InteractiveStage';
import { loadInteractiveNode, listInteractiveNodes } from '../../interactive-viewer/store/interactiveStore';

function pick(nodeId: string | undefined) {
  window.dispatchEvent(new CustomEvent('kv:inode-slide-pick', { detail: { nodeId: nodeId ?? '' } }));
}

export const InteractiveSlideLayout: FC<LayoutProps> = ({ slide, editable }) => {
  const nodeId = slide.nodeId;
  const node = useMemo(() => (nodeId ? loadInteractiveNode(nodeId) : null), [nodeId]);

  // 노드가 정해졌고 로드되면 — 전체 재생.
  if (node) {
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        <InteractiveStage doc={node} mode="play" />
        {editable && (
          <button
            type="button"
            onClick={() => pick('')}
            title="다른 인터렉티브로 바꾸기"
            style={{
              position: 'absolute',
              right: 12,
              top: 12,
              zIndex: 5,
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--fg-2)',
              padding: '6px 12px',
              font: '600 var(--fs-xs, 12px) var(--font-sans)',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,.12)',
            }}
          >
            🔁 노드 바꾸기
          </button>
        )}
      </div>
    );
  }

  // 노드 미선택 — 편집 중이면 picker, 발표 중이면 안내.
  const nodes = editable ? listInteractiveNodes() : [];
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ font: '700 var(--fs-lg, 20px) var(--font-sans)', color: 'var(--fg)' }}>
        {nodeId ? '인터렉티브를 찾을 수 없어요' : '어떤 인터렉티브를 보여줄까요?'}
      </div>
      {!editable ? (
        <div style={{ color: 'var(--fg-2)' }}>보드에서 인터렉티브 노드를 먼저 만들어요.</div>
      ) : nodes.length === 0 ? (
        <div style={{ color: 'var(--fg-2)' }}>보드에서 인터렉티브 노드를 먼저 만든 뒤 여기서 고를 수 있어요.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: '80%' }}>
          {nodes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => pick(n.id)}
              style={{
                borderRadius: 14,
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--fg)',
                padding: '12px 18px',
                font: '600 var(--fs-sm, 14px) var(--font-sans)',
                cursor: 'pointer',
              }}
            >
              🎬 {n.title}
              <span style={{ marginLeft: 8, color: 'var(--fg-muted)', fontWeight: 500 }}>요소 {n.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
