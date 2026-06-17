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
import { useAssetUrl } from "./assetStore";
import { transformStyle } from "./layout";
import type { MoodKey } from "../theme";

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

/** 이모지/텍스트/이미지 비주얼을 노드 크기에 맞춰 렌더. */
export function VisualBox({ visual, t }: { visual: Visual; t: Transform }) {
  const { w: sw, h: sh } = useStageSize();
  const nodeW = t.w * sw;
  const nodeH = t.h * sh;
  // partial-cue: silhouette = 단색 그림자, crop = 확대해 일부만(.photo가 overflow:hidden로 클립).
  const silhouette = visual.variant === "silhouette";
  const cropped = visual.variant === "crop";
  // 생성 이미지가 준비되면 이모지 시드에서 스왑(assetKey 기준).
  const genUrl = useAssetUrl(visual.assetKey);
  const imageUrl = visual.imageUrl ?? genUrl;
  if (imageUrl) {
    return <img src={imageUrl} alt="" style={silhouette ? { filter: "brightness(0)" } : undefined} />;
  }
  if (visual.emoji) {
    const base = Math.min(nodeW, nodeH) * 0.62;
    const size = Math.max(20, cropped ? base * 1.7 : base);
    const style: CSSProperties = { fontSize: size };
    if (silhouette) style.filter = "brightness(0)"; // 컬러 이모지를 검은 실루엣으로
    return <div className="emoji" style={style}>{visual.emoji}</div>;
  }
  const size = Math.max(16, Math.min(nodeH * 0.5, nodeW * 0.34));
  return <div className="emoji jua" style={{ fontSize: size, color: "var(--ink)" }}>{visual.text}</div>;
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
  const anim = node.animation;
  const prev = useRef(0);

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
            <div className="photo">
              <VisualBox visual={visual} t={node.transform} />
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
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
  if (node.type === "text") {
    return (
      <Positioned t={node.transform}>
        <div className="node-inner jua" style={{ color: "var(--ink)", fontWeight: 700 }}>
          {node.text}
        </div>
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
