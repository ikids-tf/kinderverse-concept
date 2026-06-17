/**
 * InteractiveDoc — 게임 뷰어의 단일 계약(Single Contract).
 * ------------------------------------------------------------------
 * 교사는 이 문서를 직접 편집하지 않는다. Resolver만이 "의도(드롭/프롬프트/노브/발화)"를
 * 이 문서로 변환한다. 런타임은 이 문서를 인터랙티브 게임으로 렌더한다.
 *
 * 구조: 장면(stage: 객체 노드) + 인터랙션 1개(interaction, 라운드 소유) + 효과 N개(effects, 조합).
 *   - interaction = 게임의 핵심 규칙 + 타입드 라운드 (정확히 1개).
 *   - effects     = 공개/반응/목표 같은 조합 가능한 연출·피드백 (0..N개).
 *
 * 좌표는 stage 기준 정규화(0..1) — 반응형. 회전은 도(deg).
 * 색·둥근모서리·스프링은 theme.ts 토큰/프리셋이 책임지고, 여기엔 '역할'과 '참조'만 둔다.
 *
 * ⚠️ realtime-arcade(C그룹, 실시간 물리/충돌)는 이 선언적 모델에 의도적으로 없다.
 *    별도 격리 런타임 + 후순위. 컷아웃·스타일락과 비연동.
 */
import { z } from "zod";

export const SCHEMA_VERSION = "0.1.0" as const;

/* ───────────────────────── 원시 타입 ───────────────────────── */

export const NodeId = z.string().min(1);

export const Transform = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
  rotation: z.number().default(0),
  z: z.number().int().default(0),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
});

/** 모션 프리셋 라이브러리의 이름들 (디자이너가 미리 튜닝). */
export const PresetName = z.enum([
  "pop", "drop", "float-in",       // entrance
  "breathe", "wiggle", "bob",      // idle
  "bounce", "spin", "shake", "cheer", // reaction
  "pulse", "glow",                 // emphasis
  "poof", "zoom-out",              // exit
]);

export const Animation = z
  .object({
    entrance: PresetName.optional(),
    idle: PresetName.optional(),
    reaction: PresetName.optional(),
    exit: PresetName.optional(),
  })
  .partial();

/** 노드의 의미적 역할 — Resolver/검증기가 사용. 행동은 노드 id로 참조한다. */
export const NodeRole = z.enum([
  "slot", "cue", "cover", "hidden", "target", "option",
  "ingredient", "result", "actor", "decoration",
]);

export const CutoutState = z.enum(["none", "pending", "ready"]);
export const AssetVariant = z.enum([
  "full", "cutout", "silhouette", "leaf-crop", "crop",
]);

/** 보드와 공유되는 에셋 참조(Supabase Storage 동일 객체) + 비동기 컷아웃 상태. */
export const AssetRef = z.object({
  assetId: z.string().min(1),
  variant: AssetVariant.default("full"),
  cutout: CutoutState.default("none"),
  styleLock: z.boolean().default(false),
});

export const Style = z
  .object({
    cornerRadius: z.number().min(0).default(24),
    shadow: z.boolean().default(true),
    tint: z.string().optional(), // theme 팔레트 토큰
    fontRole: z.enum(["display", "body"]).optional(),
  })
  .partial();

/* ─────────────── 콘텐츠 바인딩 (라운드마다 슬롯을 채움) ─────────────── */

export const ContentBinding = z.discriminatedUnion("type", [
  z.object({ type: z.literal("asset"), asset: AssetRef }),
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("emoji"), emoji: z.string() }),
]);

/* ───────────────────────── 장면 노드 ───────────────────────── */

const NodeBase = z.object({
  id: NodeId,
  transform: Transform,
  style: Style.optional(),
  animation: Animation.optional(),
  role: NodeRole.optional(),
});

export const ImageNode = NodeBase.extend({
  type: z.literal("image"),
  asset: AssetRef.optional(), // 슬롯은 라운드에서 채워짐
});
export const TextNode = NodeBase.extend({
  type: z.literal("text"),
  text: z.string().default(""),
});
export const ShapeNode = NodeBase.extend({
  type: z.literal("shape"),
  shape: z.enum(["rect", "circle", "blob", "star"]),
});
export const StickerNode = NodeBase.extend({
  type: z.literal("sticker"),
  emoji: z.string().optional(),
  asset: AssetRef.optional(),
});
export const SlotNode = NodeBase.extend({
  type: z.literal("slot"), // 교체 가능한 플레이스홀더 (라운드/드롭으로 채움)
});
export const ZoneNode = NodeBase.extend({
  type: z.literal("zone"), // 보이지 않는 핫스팟/드롭 영역
});
export const RiveNode = NodeBase.extend({
  type: z.literal("rive"), // 반응형 캐릭터
  src: z.string().min(1), // .riv
  stateMachine: z.string().optional(),
});
export const GroupNode = NodeBase.extend({
  type: z.literal("group"),
  children: z.array(NodeId),
});

export const SceneNode = z.discriminatedUnion("type", [
  ImageNode, TextNode, ShapeNode, StickerNode,
  SlotNode, ZoneNode, RiveNode, GroupNode,
]);

/* ──────────────── 인터랙션 (정확히 1개, 타입드 라운드 소유) ──────────────── */

const Option = z.object({
  content: ContentBinding,
  correct: z.boolean().default(false),
});

/** 누구일까 맞추기 — M0 첫 부품. */
export const TapTheRightOne = z.object({
  kind: z.literal("tap-the-right-one"),
  cueSlotId: NodeId,
  optionSlotIds: z.array(NodeId).min(2),
  rounds: z
    .array(
      z.object({
        cue: ContentBinding,
        options: z.array(Option).min(2),
      })
    )
    .min(1),
});

/** 짝 맞추기 — M0 첫 부품. */
const Pair = z.object({ left: ContentBinding, right: ContentBinding });
export const MatchPair = z.object({
  kind: z.literal("match-pair"),
  leftSlotIds: z.array(NodeId).min(1),
  rightSlotIds: z.array(NodeId).min(1),
  rounds: z.array(z.object({ pairs: z.array(Pair).min(1) })).min(1),
});

/** OX 퀴즈. */
export const BinaryChoice = z.object({
  kind: z.literal("binary-choice"),
  promptSlotId: NodeId,
  rounds: z
    .array(z.object({ prompt: ContentBinding, answer: z.boolean() }))
    .min(1),
});

/** 유사 개념 연결 (match-pair의 관계형 친척). */
export const Connect = z.object({
  kind: z.literal("connect"),
  leftSlotIds: z.array(NodeId).min(1),
  rightSlotIds: z.array(NodeId).min(1),
  rounds: z
    .array(
      z.object({
        links: z.array(z.object({ left: ContentBinding, right: ContentBinding })).min(1),
      })
    )
    .min(1),
});

/** 카드 뒤집기 기억력. faces는 각각 두 번 등장(조립기가 페어링). */
export const FlipMemory = z.object({
  kind: z.literal("flip-memory"),
  cardSlotIds: z.array(NodeId).min(2),
  rounds: z.array(z.object({ faces: z.array(ContentBinding).min(2) })).min(1),
});

/** 결합/변신 (A+B→C, 수량 포함 가능). */
export const Combine = z.object({
  kind: z.literal("combine"),
  ingredientSlotIds: z.array(NodeId).min(2),
  resultSlotId: NodeId,
  rounds: z
    .array(
      z.object({
        ingredients: z
          .array(
            z.object({
              content: ContentBinding,
              count: z.number().int().min(1).default(1),
            })
          )
          .min(2),
        result: ContentBinding,
      })
    )
    .min(1),
});

export const Interaction = z.discriminatedUnion("kind", [
  TapTheRightOne, MatchPair, BinaryChoice, Connect, FlipMemory, Combine,
]);

/* ──────────────── 효과 (조합 가능, 라운드 미소유) ──────────────── */

/** 가린 오브젝트를 정답/탭 시 공개 — 텃밭 뽑기의 핵심. */
export const RevealEffect = z.object({
  kind: z.literal("reveal"),
  coverNodeId: NodeId,
  hiddenNodeId: NodeId,
  cueNodeId: NodeId.optional(),
  trigger: z.enum(["correct", "tap"]).default("correct"),
  motion: z.enum(["pull-up", "slide", "fade"]).default("pull-up"),
  dust: z.boolean().default(false),
});

/** 선택이 캐릭터 상태(표정/행동)를 실제로 바꿈 — Rive 상태머신. 우리 무기. */
export const ResponsiveStateEffect = z.object({
  kind: z.literal("responsive-state"),
  actorNodeId: NodeId, // 반드시 rive 노드를 참조
  stateMachine: z.string().min(1),
  inputs: z.record(
    z.string(),
    z.object({
      name: z.string(),
      value: z.union([z.boolean(), z.number(), z.literal("trigger")]),
    })
  ), // outcome/choiceId → rive input
  goalState: z.string().optional(),
});

/** 목표 상태 도달 시 클리어. */
export const GoalStateEffect = z.object({
  kind: z.literal("goal-state"),
  requires: z
    .enum(["all-correct", "reach-state", "collect-all"])
    .default("all-correct"),
  targetState: z.string().optional(),
});

export const Effect = z.discriminatedUnion("kind", [
  RevealEffect, ResponsiveStateEffect, GoalStateEffect,
]);

/* ──────────────── 설정(해소된 노브) · 보상 ──────────────── */

export const Settings = z.object({
  difficulty: z.enum(["baby", "toddler", "senior"]).default("toddler"),
  length: z.number().int().min(1).max(20).default(5), // 라운드 수
  mood: z.enum(["calm", "lively", "punchy"]).default("lively"),
  optionCount: z.number().int().min(2).max(6).default(3),
  distractorSimilarity: z.enum(["low", "mid", "high"]).default("mid"),
  hintReveal: z.enum(["many", "some", "few"]).default("some"),
  timer: z.union([z.literal("none"), z.number().int().positive()]).default("none"),
  // 중첩 기본값은 '완전한 리터럴'로 둔다 (zod default는 재파싱하지 않으므로).
  tts: z
    .object({
      enabled: z.boolean().default(true),
      locale: z.string().default("ko-KR"),
      voice: z.enum(["bright", "calm"]).default("bright"),
    })
    .default({ enabled: true, locale: "ko-KR", voice: "bright" }),
});

export const Rewards = z.object({
  confetti: z.enum(["off", "light", "full"]).default("light"),
  star: z.boolean().default(true),
  praiseVoice: z.boolean().default(true),
  palette: z.literal("warm-pastel").default("warm-pastel"),
});

/* ──────────────── 무대 · 메타 ──────────────── */

export const Stage = z.object({
  background: z
    .union([ContentBinding, z.object({ colorRole: z.string() })])
    .optional(),
  nodes: z.array(SceneNode).min(1),
});

export const Meta = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  ageBand: z.enum(["baby", "toddler", "senior"]).default("toddler"),
  locale: z.string().default("ko-KR"),
  archetype: z.string().min(1), // "tap-the-right-one", "reveal-and-collect" 등
  createdFrom: z.enum(["prompt", "drop", "template", "remix"]).default("prompt"),
});

/* ──────────────── 계약 본체 ──────────────── */

export const InteractiveDoc = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
    meta: Meta,
    settings: Settings, // 필수: '{}' 로 주면 내부 기본값이 채워짐
    stage: Stage,
    interaction: Interaction,
    effects: z.array(Effect).default([]),
    rewards: Rewards, // 필수: '{}' 로 주면 내부 기본값이 채워짐
  })
  .superRefine((doc, ctx) => {
    // 1) 노드 id 유일성 + 수집
    const ids = new Set<string>();
    for (const n of doc.stage.nodes) {
      if (ids.has(n.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `중복 노드 id: ${n.id}`,
          path: ["stage", "nodes"],
        });
      }
      ids.add(n.id);
    }
    const need = (id: string, where: string) => {
      if (!ids.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${where} 가 존재하지 않는 노드 id 참조: ${id}`,
        });
      }
    };

    // 2) 인터랙션이 참조하는 슬롯 존재 + 라운드 정합성
    const it = doc.interaction;
    if (it.kind === "tap-the-right-one") {
      need(it.cueSlotId, "interaction.cueSlotId");
      it.optionSlotIds.forEach((id) => need(id, "interaction.optionSlotIds"));
      it.rounds.forEach((r, i) => {
        if (!r.options.some((o) => o.correct)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `round ${i}: 정답 옵션이 없음`,
            path: ["interaction", "rounds", i],
          });
        }
      });
    } else if (it.kind === "match-pair" || it.kind === "connect") {
      it.leftSlotIds.forEach((id) => need(id, "interaction.leftSlotIds"));
      it.rightSlotIds.forEach((id) => need(id, "interaction.rightSlotIds"));
    } else if (it.kind === "binary-choice") {
      need(it.promptSlotId, "interaction.promptSlotId");
    } else if (it.kind === "flip-memory") {
      it.cardSlotIds.forEach((id) => need(id, "interaction.cardSlotIds"));
    } else if (it.kind === "combine") {
      it.ingredientSlotIds.forEach((id) => need(id, "interaction.ingredientSlotIds"));
      need(it.resultSlotId, "interaction.resultSlotId");
    }

    // 3) 효과가 참조하는 노드 존재 + responsive-state는 rive 노드여야 함
    const riveIds = new Set(
      doc.stage.nodes.filter((n) => n.type === "rive").map((n) => n.id)
    );
    for (const e of doc.effects) {
      if (e.kind === "reveal") {
        need(e.coverNodeId, "reveal.coverNodeId");
        need(e.hiddenNodeId, "reveal.hiddenNodeId");
        if (e.cueNodeId) need(e.cueNodeId, "reveal.cueNodeId");
      }
      if (e.kind === "responsive-state") {
        need(e.actorNodeId, "responsive-state.actorNodeId");
        if (!riveIds.has(e.actorNodeId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `responsive-state.actorNodeId 는 'rive' 노드여야 함: ${e.actorNodeId}`,
          });
        }
      }
    }
  });

/* ──────────────── 추론 타입 ──────────────── */

export type InteractiveDoc = z.infer<typeof InteractiveDoc>;
export type InteractiveDocInput = z.input<typeof InteractiveDoc>;
export type SceneNode = z.infer<typeof SceneNode>;
export type Interaction = z.infer<typeof Interaction>;
export type Effect = z.infer<typeof Effect>;
export type Settings = z.infer<typeof Settings>;
export type ContentBinding = z.infer<typeof ContentBinding>;
export type AssetRef = z.infer<typeof AssetRef>;
export type PresetName = z.infer<typeof PresetName>;
