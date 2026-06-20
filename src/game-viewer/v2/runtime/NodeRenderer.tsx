/**
 * NodeRenderer.tsx — 장면 노드 1개를 무대 좌표(정규화 0..1)에 배치해 렌더.
 * ------------------------------------------------------------------
 * 바깥 .node 가 중심정렬(translate(-50%,-50%)) + 위치/회전을 맡고, 안쪽 motion.div 들이
 * 등장/idle/반응을 담당한다(중심정렬과 변환이 충돌하지 않게 분리 — 레퍼런스의 글리치 제거).
 * 색/모양 토큰은 player.css가 주입된 CSS 변수로 소비. 애니는 Motion(스프링/키프레임).
 */
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import type { ContentBinding, SceneNode } from "../schema/interactiveDoc";
import { resolveVisual, type Visual } from "./content";
import { entrance, idle, reaction } from "./presets";
import { useStageSize } from "./stageSize";
import { registerNode } from "./nodeRegistry";
import { useGame } from "./useGame";
import { useCanInlineEdit } from "./editContext";
import { useAssetUrl } from "./assetStore";
import { RiveActor } from "./RiveActor";
import { ImageHoverActions } from "./ImageHoverActions";
import { transformStyle, radiusStyle, cropImgStyle, cropContentStyle, resolveCrop } from "./layout";
import type { MoodKey } from "../theme";
import type { Style } from "../schema/interactiveDoc";

type Transform = SceneNode["transform"];

/** 위치 잡힌 컨테이너(.node). registerId가 있으면 confetti 원점용으로 등록. */
export function Positioned(props: {
  t: Transform;
  className?: string;
  registerId?: string;
  children: ReactNode;
}) {
  const { t, className, registerId, children } = props;
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (registerId) registerNode(registerId, el);
    },
    [registerId],
  );
  return (
    <div ref={ref} className={`node${className ? " " + className : ""}`} style={transformStyle(t)}>
      {children}
    </div>
  );
}

/** 이모지/텍스트/이미지 비주얼을 노드 크기에 맞춰 렌더. round의 크롭(페이지별)을 콘텐츠에 적용. */
export function VisualBox({ visual, t, style, round = 0 }: { visual: Visual; t: Transform; style?: Style; round?: number }) {
  const { w: sw, h: sh } = useStageSize();
  const nodeW = t.w * sw;
  const nodeH = t.h * sh;
  // partial-cue: silhouette = 단색 그림자, crop = 확대해 일부만(.photo가 overflow:hidden로 클립).
  const silhouette = visual.variant === "silhouette";
  const cropped = visual.variant === "crop";
  // 생성 이미지가 준비되면 이모지 시드에서 스왑(assetKey 기준).
  const genUrl = useAssetUrl(visual.assetKey);
  const imageUrl = visual.imageUrl ?? genUrl;
  // crop.scale 은 콘텐츠(이미지·이모지·글자)를 프레임과 '따로' 확대 → 프레임(.photo overflow:hidden)이 잘라줌.
  // 페이지(round)별 크롭을 골라 적용 — 같은 슬롯이라도 페이지마다 따로 조절됨.
  const crop = resolveCrop(style, round);
  const contentCrop = cropContentStyle(crop);
  if (imageUrl) {
    const imgStyle = { ...cropImgStyle(crop), ...(silhouette ? { filter: "brightness(0)" } : {}) };
    return <img src={imageUrl} alt="" style={Object.keys(imgStyle).length ? imgStyle : undefined} />;
  }
  if (visual.emoji) {
    const base = Math.min(nodeW, nodeH) * 0.62;
    const size = Math.max(20, cropped ? base * 1.7 : base);
    const es: CSSProperties = { fontSize: size, ...contentCrop };
    if (silhouette) es.filter = "brightness(0)"; // 컬러 이모지를 검은 실루엣으로
    return <div className="emoji" style={es}>{visual.emoji}</div>;
  }
  const size = Math.max(16, Math.min(nodeH * 0.5, nodeW * 0.34));
  return <div className="emoji jua" style={{ fontSize: size, color: "var(--ink)", ...contentCrop }}>{visual.text}</div>;
}

/** 사진 카드 노드 — 등장/idle/반응(cheer) 애니 포함. cue·hidden·generic image에 사용. */
export function PhotoNode(props: {
  node: SceneNode;
  visual: Visual;
  reactSeq?: number;
  registerId?: string;
}) {
  const { node, visual, reactSeq, registerId } = props;
  const reduced = !!useReducedMotion();
  const controls = useAnimationControls();
  const mood = useGame((s) => (s.doc?.settings.mood ?? "lively") as MoodKey);
  const roundIdx = useGame((s) => s.roundIdx);
  const canEdit = useCanInlineEdit();
  const editInline = useGame((s) => s.editNodeInline);
  const anim = node.animation;
  const prev = useRef(0);
  // 실제 이미지가 떠 있으면(생성/시드 url) 교사용 호버 액션(편집·다운로드·풀스크린)을 얹는다.
  const genUrl = useAssetUrl(visual.assetKey);
  const imageUrl = visual.imageUrl ?? genUrl;

  useEffect(() => {
    if (reactSeq && reactSeq !== prev.current) {
      prev.current = reactSeq;
      const kf = reaction(anim?.reaction ?? "cheer", mood, reduced);
      if (kf) void controls.start(kf);
    }
  }, [reactSeq, controls, mood, reduced, anim?.reaction]);

  const ent = entrance(anim?.entrance, reduced);
  const idl = idle(anim?.idle, reduced);

  return (
    <Positioned t={node.transform} registerId={registerId}>
      <motion.div className="node-inner" animate={controls}>
        <motion.div
          className="node-inner"
          initial={ent?.initial}
          animate={ent?.animate}
          transition={ent?.transition}
        >
          <motion.div className="node-inner" animate={idl?.animate} transition={idl?.transition}>
            <div
              className={`photo${canEdit ? " kv-editable" : ""}`}
              style={radiusStyle(node.style)}
              onDoubleClick={canEdit ? (e) => { e.stopPropagation(); editInline(node.id); } : undefined}
              title={canEdit ? "더블클릭하면 내용을 고쳐요" : undefined}
            >
              <VisualBox visual={visual} t={node.transform} style={node.style} round={roundIdx} />
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
      {/* 교사용 호버 액션 — 애니 래퍼 밖(흔들리지 않게), 노드 호버 시 표시(마이보드와 동일). */}
      {imageUrl && (
        <ImageHoverActions
          src={imageUrl}
          caption={visual.assetKey && !visual.assetKey.startsWith("__") ? visual.assetKey : (visual.text || "그림")}
          assetKey={visual.assetKey}
          nodeId={node.id}
          roundIdx={roundIdx}
        />
      )}
    </Positioned>
  );
}

/** GameStage가 '비점유' 장면 노드(cue·텍스트·장식)를 그릴 때 쓰는 디스패처. */
export function NodeRenderer({
  node,
  binding,
  reactSeq,
}: {
  node: SceneNode;
  binding?: ContentBinding | null;
  reactSeq?: number;
}) {
  const canEdit = useCanInlineEdit();
  const editInline = useGame((s) => s.editNodeInline);

  if (node.type === "text") {
    return (
      <Positioned t={node.transform}>
        <div
          className={`node-inner jua${canEdit ? " kv-editable" : ""}`}
          style={{ color: "var(--ink)", fontWeight: 700 }}
          onDoubleClick={canEdit ? (e) => { e.stopPropagation(); editInline(node.id); } : undefined}
          title={canEdit ? "더블클릭하면 글자를 고쳐요" : undefined}
        >
          {node.text}
        </div>
      </Positioned>
    );
  }

  // 반응하는 캐릭터(Rive) — 선택이 표정/상태를 실제로 바꾼다(PRD §9). 에셋 없으면 플레이스홀더.
  if (node.type === "rive") {
    return (
      <Positioned t={node.transform} registerId={node.id}>
        <RiveActor node={node} />
      </Positioned>
    );
  }

  // 정적 sticker(이모지) 또는 라운드 바인딩(cue). 바인딩 우선.
  const content: ContentBinding | null =
    binding ??
    (node.type === "sticker" && node.emoji ? { type: "emoji", emoji: node.emoji } : null);

  if (!content) {
    // 빈 슬롯/이미지 — 플레이스홀더 카드.
    return (
      <Positioned t={node.transform} registerId={node.id}>
        <div className="node-inner">
          <div className="photo" />
        </div>
      </Positioned>
    );
  }

  return (
    <PhotoNode node={node} visual={resolveVisual(content)} reactSeq={reactSeq} registerId={node.id} />
  );
}
