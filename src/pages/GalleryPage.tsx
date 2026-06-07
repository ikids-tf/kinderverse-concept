import { Page, StubBody } from '@/components/Page';

export function GalleryPage() {
  return (
    <Page
      eyebrow="자산 라이브러리"
      title="갤러리"
      description="분류·기억 엔진이 정리한 사진과 자산. 동의된 사진만 파이프라인에 포함됩니다."
    >
      <StubBody note="갤러리 그리드는 분류·기억 엔진 연동(M2~) 시 채워집니다." />
    </Page>
  );
}
