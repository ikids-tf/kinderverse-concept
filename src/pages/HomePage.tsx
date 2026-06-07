import { Page, StubBody } from '@/components/Page';

export function HomePage() {
  return (
    <Page
      eyebrow="KINDERVERSE"
      title="안녕하세요, 선생님"
      description="공간 단위 교사 워크스페이스. 자연어로 말하거나 보드에서 대상을 선택해 명령하세요. 하단 프롬프트바는 어느 페이지에서나 함께합니다."
    >
      <StubBody note="홈 대시보드는 다음 마일스톤에서 채워집니다. (오늘의 일정 · 최근 폴더 · 우리반 요약)" />
    </Page>
  );
}
