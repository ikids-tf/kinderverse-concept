// "편집디자인" 버튼이 넘길 스타터 payload — kinderverse엔 아직 구조화 데이터가 없으므로
// 각 기능의 샘플 템플릿으로 편집기를 연다(교사가 캔버스에서 편집·저장). 나중에 실제 생성 데이터로 교체 가능.

export interface Starter {
  key: string;
  label: string;
  variant: string;
  payload: unknown;
}

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
];
