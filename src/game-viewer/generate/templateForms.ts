/**
 * templateForms.ts — 템플릿별 폼 정의(데이터 주도) + 연령 난이도 기본값.
 * ------------------------------------------------------------------
 * entry/TemplateGallery·TemplateForm 이 이 정의를 읽어 카드와 폼을 자동 렌더한다.
 * 새 템플릿은 여기에 TemplateFormDef 하나만 추가하면 갤러리·폼이 확장된다.
 *
 * 필드 값은 string | number | boolean. UI는 전부 "큰 탭/칩(segmented)"으로 렌더한다
 * (유아 교사 친화 — 자유 입력 없이 탭만으로 완성). 자유 프롬프트는 별도(옵션).
 */
import type { AgeRange, Emotion, TemplateId } from "../schema/gameSpec";
import { CONTENT_SETS, RELATION_SETS, type CategoryId, type RelationId } from "./contentSets";

/* ───────────────────────── 필드 모델 ───────────────────────── */

export type FieldValue = string | number | boolean;
export type FieldType = "segmented" | "toggle";

export interface FieldOption<V extends FieldValue = FieldValue> {
  value: V;
  label: string;
  /** 칩에 보일 대표 OpenMoji ref (선택) */
  icon?: string;
}

export interface FormField<V extends FieldValue = FieldValue> {
  /** GameSpec 빌더가 읽는 키 (FormSelection.values[id]) */
  id: string;
  /** 질문 라벨 (예: "무엇을 셀까요?") */
  label: string;
  type: FieldType;
  options: FieldOption<V>[];
  defaultValue: V;
  help?: string;
  /**
   * 이 필드의 기본값이 연령(ageRange)에 따라 자동 조정될 키.
   * UI는 ageRange 변경 시 AGE_DEFAULTS[age][autoFrom]로 defaultValue를 덮어쓴다.
   */
  autoFrom?: keyof AgeDefault;
}

export interface TemplateFormDef {
  templateId: TemplateId;
  /** 갤러리 카드 */
  title: string;
  description: string;
  icon: string;
  /** 출시 단계 (UI에서 M2는 "준비중" 뱃지 가능) */
  milestone: "M1" | "M2";
  fields: FormField[];
  /** 폼 하단 "(옵션) 자유 프롬프트" 노출 여부. M1은 placeholder/비활성 */
  supportsOptionalPrompt: boolean;
}

/* ───────────────────────── 연령 난이도 기본값 (단일 출처) ───────────────────────── */

export interface AgeDefault {
  maxCount: number;
  optionCount: number;
  rounds: number;
  pairCount: number;
  emotions: Emotion[];
}

export const AGE_DEFAULTS: Record<AgeRange, AgeDefault> = {
  "3-5": { maxCount: 5, optionCount: 3, rounds: 3, pairCount: 3, emotions: ["happy", "sad", "angry"] },
  "5-7": { maxCount: 10, optionCount: 4, rounds: 5, pairCount: 4, emotions: ["happy", "sad", "angry", "scared", "surprised"] },
};

/* ───────────────────────── 공통 필드 헬퍼 ───────────────────────── */

const ageField: FormField<AgeRange> = {
  id: "ageRange",
  label: "몇 살 친구들인가요?",
  type: "segmented",
  options: [
    { value: "3-5", label: "3~5세" },
    { value: "5-7", label: "5~7세" },
  ],
  defaultValue: "3-5",
  help: "연령에 맞춰 난이도가 자동으로 맞춰져요.",
};

const categoryField: FormField<CategoryId> = {
  id: "category",
  label: "무엇으로 놀까요?",
  type: "segmented",
  options: (Object.keys(CONTENT_SETS) as CategoryId[]).map((id) => ({
    value: id,
    label: CONTENT_SETS[id].label,
    icon: CONTENT_SETS[id].icon,
  })),
  defaultValue: "animal",
};

const roundsField: FormField<number> = {
  id: "rounds",
  label: "몇 판 할까요?",
  type: "segmented",
  options: [
    { value: 3, label: "3판" },
    { value: 5, label: "5판" },
    { value: 7, label: "7판" },
  ],
  defaultValue: 3,
  autoFrom: "rounds",
};

/* ───────────────────────── 템플릿 폼 정의 ───────────────────────── */

export const TEMPLATE_FORMS: Record<TemplateId, TemplateFormDef> = {
  counting: {
    templateId: "counting",
    title: "숫자 세기 놀이",
    description: "재미있는 그림이 몇 개인지 세어 맞춰요",
    icon: "1F522", // 1234
    milestone: "M1",
    supportsOptionalPrompt: true,
    fields: [
      ageField,
      categoryField,
      {
        id: "maxCount",
        label: "몇 개까지 셀까요?",
        type: "segmented",
        options: [
          { value: 3, label: "3까지" },
          { value: 5, label: "5까지" },
          { value: 10, label: "10까지" },
        ],
        defaultValue: 5,
        autoFrom: "maxCount",
        help: "최대 개수예요. 판마다 1~최대 개수 사이로 나와요.",
      },
      roundsField,
    ],
  },

  silhouette: {
    templateId: "silhouette",
    title: "그림자 맞추기",
    description: "검은 그림자를 보고 무엇인지 맞춰요",
    icon: "1F50D", // magnifier
    milestone: "M1",
    supportsOptionalPrompt: true,
    fields: [
      ageField,
      {
        ...categoryField,
        // 실루엣은 형태가 또렷한 카테고리만 (job 제외)
        options: (Object.keys(CONTENT_SETS) as CategoryId[])
          .filter((id) => CONTENT_SETS[id].goodForSilhouette)
          .map((id) => ({ value: id, label: CONTENT_SETS[id].label, icon: CONTENT_SETS[id].icon })),
      },
      {
        id: "optionCount",
        label: "보기를 몇 개 보여줄까요?",
        type: "segmented",
        options: [
          { value: 3, label: "3개" },
          { value: 4, label: "4개" },
        ],
        defaultValue: 3,
        autoFrom: "optionCount",
      },
      roundsField,
    ],
  },

  emotion: {
    // M2 — Rive 캐릭터 필요. 폼은 미리 정의.
    templateId: "emotion",
    title: "표정 보고 마음 알기",
    description: "친구의 표정을 보고 기분을 맞추고 함께 위로해요",
    icon: "1F642", // slight smile
    milestone: "M2",
    supportsOptionalPrompt: true,
    fields: [
      ageField,
      {
        id: "emotionSet",
        label: "어떤 감정으로 놀까요?",
        type: "segmented",
        options: [
          { value: "core", label: "기본 (기쁨·슬픔·화남)" },
          { value: "all", label: "전체 (5가지)" },
        ],
        defaultValue: "core",
      },
      {
        id: "empathy",
        label: "위로해 주기 단계도 넣을까요?",
        type: "toggle",
        options: [
          { value: true, label: "넣기" },
          { value: false, label: "빼기" },
        ],
        defaultValue: true,
        help: "감정을 맞춘 뒤 '안아주기' 같은 공감 반응을 해요.",
      },
      roundsField,
    ],
  },

  matching: {
    // M2 — Konva 선잇기.
    templateId: "matching",
    title: "줄로 잇기",
    description: "어울리는 것끼리 줄로 이어요",
    icon: "1F517", // link
    milestone: "M2",
    supportsOptionalPrompt: true,
    fields: [
      ageField,
      {
        id: "relation",
        label: "무엇끼리 이어 볼까요?",
        type: "segmented",
        options: (Object.keys(RELATION_SETS) as RelationId[]).map((id) => ({
          value: id,
          label: RELATION_SETS[id].label,
        })),
        defaultValue: "animal-food",
      },
      {
        id: "pairCount",
        label: "몇 쌍을 이을까요?",
        type: "segmented",
        options: [
          { value: 3, label: "3쌍" },
          { value: 4, label: "4쌍" },
        ],
        defaultValue: 3,
        autoFrom: "pairCount",
      },
      roundsField,
    ],
  },
};
