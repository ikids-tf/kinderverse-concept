// "편집디자인" 버튼이 넘길 스타터 payload — kinderverse엔 아직 구조화 데이터가 없으므로
// 각 기능의 샘플 템플릿으로 편집기를 연다(교사가 캔버스에서 편집·저장). 나중에 실제 생성 데이터로 교체 가능.

import { buildWorksheetEditorPayload } from './fromWorksheet';

export interface Starter {
  key: string;
  label: string;
  variant: string;
  payload: unknown;
}

// 활동지 편집디자인 템플릿 스타터 payload — 실제 생성과 동일한 빌더(buildWorksheetEditorPayload)로
// '여름 바다' 주제 샘플을 만든다(정적 에셋 매칭 → 이미지 즉시 표시). 교사가 캔버스에서 주제·글자·이미지 편집.
const ws = (variant: string) => buildWorksheetEditorPayload(variant, { theme: '여름 바다' }) ?? {};

export const STARTERS: Starter[] = [
  {
    key: 'play_story',
    label: '놀이기록',
    variant: 'summer-card',
    payload: {
      header: { title: '놀이기록' },
      meta: { theme: '여름 물놀이' },
      month: '',
      activities: [
        { title: '활동 1' }, { title: '활동 2' }, { title: '활동 3' },
        { title: '활동 4' }, { title: '활동 5' }, { title: '활동 6' },
        { title: '활동 7' }, { title: '활동 8' }, { title: '활동 9' },
      ],
      photos: [],
      learning: { text: '' },
      teacherSupport: { text: '' },
    },
  },
  {
    key: 'topic_web',
    label: '놀이중심 주제망',
    variant: 'topicweb',
    payload: {
      header: { title: '놀이주제망' },
      meta: { theme: '' },
      className: '', age_band: '', period: '',
      topic_web: {
        main_topic: '주제를 입력하세요',
        subtopics: [
          { subtopic: '소주제 1', play_ideas: ['놀이 1', '놀이 2'] },
          { subtopic: '소주제 2', play_ideas: ['놀이 1', '놀이 2'] },
          { subtopic: '소주제 3', play_ideas: ['놀이 1'] },
          { subtopic: '소주제 4', play_ideas: ['놀이 1'] },
        ],
      },
      children_expected_questions: ['아이들의 예상 질문 1', '예상 질문 2'],
    },
  },
  {
    key: 'monthly_plan',
    label: '놀이계획 월안',
    variant: 'monthlyplan-summer',
    payload: {
      header: { title: '여름 바다로 풍덩!' },
      basic_info: { theme: '여름 바다', sub_theme: '바다와 친구들', period: '7/1 ~ 7/31', class_name: '무지개반', age_band: '3-5', month: '2026 · 7월' },
      weekly_flow: [
        { week: 1, sub_theme: '', play_ideas: [] },
        { week: 2, sub_theme: '', play_ideas: [] },
        { week: 3, sub_theme: '', play_ideas: [] },
        { week: 4, sub_theme: '', play_ideas: [] },
        { week: 5, sub_theme: '', play_ideas: [] },
      ],
      teacher_expectations: [],
      curriculum_links: [],
      outdoor_and_physical_play: [],
      safety_education: '', character_education: '', events: [], home_connection: '',
    },
  },
  {
    key: 'monthly_plan_color',
    label: '놀이계획 월안 · 색깔탐험',
    variant: 'monthlyplan-color',
    payload: {
      basic_info: { theme: '색깔 탐험', period: '6/1 ~ 6/30', class_name: '보리 (5세)', age_band: '3-5', month: 'JUNE' },
      weekly_flow: [
        { week: 1, sub_theme: '', play_ideas: [] },
        { week: 2, sub_theme: '', play_ideas: [] },
        { week: 3, sub_theme: '', play_ideas: [] },
        { week: 4, sub_theme: '', play_ideas: [] },
        { week: 5, sub_theme: '', play_ideas: [] },
      ],
      teacher_expectations: [], curriculum_links: [], outdoor_and_physical_play: [],
      safety_education: '', character_education: '', events: [], home_connection: '',
    },
  },
  {
    key: 'weekly_plan',
    label: '놀이계획 주안',
    variant: 'weeklyplan',
    payload: {
      basic_info: { theme: '', sub_theme: '', period: '', class_name: '', age_band: '' },
      rationale: '',
      teacher_expectations: ['기대 1', '기대 2'],
      curriculum_links: ['신체운동·건강', '자연탐구'],
      daily_flow: [
        { day: '월', date: '', play_ideas: ['놀이 1'] },
        { day: '화', date: '', play_ideas: ['놀이 1'] },
        { day: '수', date: '', play_ideas: ['놀이 1'] },
        { day: '목', date: '', play_ideas: ['놀이 1'] },
        { day: '금', date: '', play_ideas: ['놀이 1'] },
      ],
      outdoor_and_physical_play: ['바깥놀이 1'],
      safety_education: '',
      character_education: '',
      events: [''],
      home_connection: '',
    },
  },
  {
    key: 'weekly_plan_journal',
    label: '놀이계획 주안 · 일지형',
    variant: 'weeklyplan-journal',
    payload: {
      basic_info: { theme: '설날', sub_theme: '새해와 한복', period: '1/12 ~ 1/16', class_name: '키즈반 (만 3세)', age_band: '3-5' },
      rationale: { summary: '전통 명절인 설날을 주제로 세배·윷놀이·한복 등 우리 문화를 몸으로 경험하고, 존경과 협동의 마음을 기른다.' },
      teacher_expectations: [
        { goal: '전통 명절인 설날에 대한 이해를 돕는다.' },
        { goal: '다양한 신체 활동을 통해 동작을 조율하는 능력을 기른다.' },
        { goal: '세배 인사를 통해 존경의 마음을 배우고 사회적 관계를 돈독히 한다.' },
        { goal: '전통의 아름다움을 감상하고 표현해 본다.' },
      ],
      curriculum_links: [
        { area: '의사소통', category: '듣기와 말하기', content: '경험, 느낌, 생각을 말한다.' },
        { area: '사회관계', category: '나와 친구의 관계 이해하기', content: '친구와 놀이를 통해 협동심을 기른다.' },
        { area: '예술경험', category: '창의적으로 표현하기', content: '다양한 방법으로 미술활동을 시도한다.' },
      ],
      daily_flow: [
        { day: '월', date: '1/12', play_ideas: ['세배 카드 만들기', '세배 연습하기'] },
        { day: '화', date: '1/13', play_ideas: ['윷놀이 게임 만들기', '윷놀이 규칙 배우기'] },
        { day: '수', date: '1/14', play_ideas: ['그림책 읽기', '느낌 표현하기'] },
        { day: '목', date: '1/15', play_ideas: ['한복 의상 소개하기', '한복 패션쇼'] },
        { day: '금', date: '1/16', play_ideas: ['전통 세배 동작 익히기', '새해의 의미 알아보기'] },
      ],
      outdoor_and_physical_play: [
        { activity_name: '자연 관찰하기' }, { activity_name: '자연 관찰하기' }, { activity_name: '자연 관찰하기' },
        { activity_name: '자연 관찰하기' }, { activity_name: '자연 관찰하기' },
      ],
      safety_education: { play_safety: '교통안전 규칙 알아보기', tool_safety: '놀이기구 안전하게 사용하기' },
      character_education: { core_value: '웃어른께 예의 바르게 인사하기' },
      events: [''],
      home_connection: '가족과 함께 세배 연습하기, 윷놀이 게임하기',
    },
  },
  {
    key: 'daily_plan_journal',
    label: '일일 놀이계획 일지형',
    variant: 'daily-journal',
    payload: {
      daily_schedule: true,
      basic_info: { theme: '뛰뛰! 빵빵 자동차', class_name: '키즈반 (만 3세)', period: '2026년 2월 16일 (월)', weather: '맑음 / 미세먼지 좋음', age_band: '3-5' },
    },
  },
  {
    key: 'daily_plan_idea',
    label: '일일 놀이계획 아이디어형',
    variant: 'daily-idea',
    payload: {
      daily_schedule: true,
      basic_info: { theme: '시원한 물 길과 파도 모험 떠나기', sub_theme: '시원한 물 길과 파도 모험 떠나기', class_name: '2026 무지개 (만 5세)', date: '7/14' },
    },
  },
  {
    key: 'newsletter_fieldtrip',
    label: '가정통신문 · 체험학습',
    variant: 'newsletter-fieldtrip',
    payload: {
      newsletter: {
        kind: 'fieldtrip',
        month: '4월',
        className: '무지개반',
        pubDate: '2026.02.15',
        orgName: 'OO어린이집',
      },
    },
  },
  {
    key: 'newsletter_cooking',
    label: '가정통신문 · 요리체험',
    variant: 'newsletter-cooking',
    payload: {
      newsletter: {
        title: '팥빙수 만들기 안내',
        orgName: '꿈나무어린이집',
        date: '2026년 8월 00일',
        place: '각 반 교실',
        materials: '앞치마, 머리수건',
      },
    },
  },
  {
    key: 'newsletter_event',
    label: '가정통신문 · 행사안내',
    variant: 'newsletter-event',
    payload: {
      newsletter: {
        kind: 'event',
        title: '5월 가정통신문',
        date: '2026. 05. 00',
      },
    },
  },
  // ── 활동지 편집디자인 5종(편집 템플릿이 있는 유형) ──
  { key: 'ws_half_drawing', label: '활동지 · 반쪽 그림', variant: 'half-drawing', payload: ws('half-drawing') },
  { key: 'ws_counting', label: '활동지 · 수 세기', variant: 'counting', payload: ws('counting') },
  { key: 'ws_shadow_match', label: '활동지 · 그림자 짝짓기', variant: 'shadow-match', payload: ws('shadow-match') },
  { key: 'ws_hangul_writing', label: '활동지 · 한글 쓰기', variant: 'hangul-writing', payload: ws('hangul-writing') },
  { key: 'ws_maze', label: '활동지 · 미로 찾기', variant: 'maze', payload: ws('maze') },
  { key: 'ws_headband', label: '활동지 · 역할놀이 머리띠', variant: 'headband', payload: ws('headband') },
  { key: 'ws_name_tag', label: '활동지 · 이름표', variant: 'name-tag', payload: ws('name-tag') },
];
