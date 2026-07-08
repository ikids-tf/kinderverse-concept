// playrecord 모듈(JS/자립형)의 타입 shim — 앱은 TS strict 라서 JS 모듈 import 시 타입 선언이 필요.
// 모듈 자체는 tsc 대상에서 제외(tsconfig.app.json exclude)했고, 여기선 공개 API를 any 로 노출한다.
declare module '@/playrecord' {
  export const PlayRecordEditor: any;
  export const DesignFrame: any;
  export const DesignEl: any;
  export const buildVariant: any;
  export const buildVariantPages: any;
  export const pickerTemplates: any;
  export const templateLabel: any;
  export const isTemplateId: any;
  export const defaultTemplateId: any;
  export const themeFor: any;
  export const themeKeyOf: any;
  export const blankPage: any;
  export const makePhotoSlot: any;
  export const LAYOUT_VERSION: any;
  export const TEMPLATE_FAMILIES: any;
  export const TEMPLATE_THEMES: any;
}
