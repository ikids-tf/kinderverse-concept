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
    key: 'letter',
    label: '가정통신문',
    variant: 'letter',
    payload: {
      letter: true,
      kind: 'letter',
      header: { title: '여름철 물놀이 안전 안내' },
      meta: { theme: '여름 물놀이' },
      audience: '학부모님께',
      body: [
        '무더위가 시작되는 초여름, 아이들이 건강하고 즐겁게 지내고 있어 감사드립니다.',
        '다가오는 여름철 물놀이 활동을 아래와 같이 안내드리오니 가정에서 준비에 협조해 주시기 바랍니다.',
        '· 일시: __월 __일(_)요일 오전 10시',
        '· 장소: ○○유치원 물놀이장',
        '· 준비물: 수영복, 수건, 여벌 옷, 아쿠아슈즈',
        '· 회신 기한: __월 __일까지',
        '아이들의 안전을 위해 미리 준비물을 챙겨 보내 주시고, 건강 상태를 알림장에 적어 주시면 세심히 살피겠습니다.',
        '늘 관심과 사랑으로 함께해 주셔서 감사합니다.',
        '2026년 __월 __일',
        '○○유치원장',
      ].join('\n'),
      photos: [],
    },
  },
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
