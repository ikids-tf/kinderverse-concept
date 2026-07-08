// =============================================================================
// 놀이기록 편집기 모듈 — 공개 API (자립형, 다른 React 서비스로 복사 가능)
//
//   import { PlayRecordEditor } from "playrecord";
//   <PlayRecordEditor value={rec} onChange={patch => setRec({...rec, ...patch})}
//                     onExportImage={(dataUrl, meta) => { ... }} selected zoom />
//
// value  : { variant, docs, docsVersion, page, payload, title }  (controlled)
// onChange(patch)          : value 병합 패치 (호스트가 상태 소유)
// onExportImage(url, meta) : PNG 저장 시 호출 (meta = { fileName, variant, page })
// =============================================================================
export { default as PlayRecordEditor } from "./PlayRecordEditor.jsx";
export { DesignFrame, DesignEl } from "./DesignFrame.jsx";
export {
  // 빌더 / 템플릿 레지스트리
  buildVariant, buildVariantPages,
  pickerTemplates, templateLabel, isTemplateId, defaultTemplateId,
  TEMPLATE_FAMILIES, TEMPLATE_THEMES,
  // 테마 감지 / 유틸
  themeFor, themeKeyOf, blankPage, makePhotoSlot, LAYOUT_VERSION,
} from "./layouts";
