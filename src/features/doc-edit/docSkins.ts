/**
 * 문서 편집 — 문서 스킨(테마 변형) 데이터. 패밀리 4종 × 변형 10종 = 40종.
 *
 * '문서 옷 입히기'에서 패밀리를 클릭하면 그 계열 변형 10종이 플라이아웃으로 열리고,
 * 변형을 고르면 node.data.docTheme(패밀리)+docVariant(변형 id)로 저장된다.
 * 렌더는 CSS 변수 방식: resolveDocSkin()이 --d-* 인라인 스타일과 data-doc-skin/
 * data-doc-h1 속성을 만들어 주고, doc-themes.css 의 [data-doc-skin] 규칙이 소비한다
 * (React 16+는 style 객체의 '--' 키를 setProperty 로 전달 — game-viewer theme.ts 선례).
 *
 * 색 원칙(디자이너 저작): 종이는 L96+ 극연한 틴트(A4 인쇄 안전), head 는 액센트의
 * 저명도 동계열(AA 대비), h1bg·thbg·callout·rowTint 는 같은 hue 의 채도 사다리.
 * withImages 변형 = 주제 스티커 이미지(갤러리 재사용/생성+누끼)가 문서에 함께 얹힘.
 */
import type { CSSProperties } from 'react';

export type DocSkinFamily = 'basic' | 'pastel' | 'nature' | 'formal';
export type DocSkinH1 = 'band' | 'underline' | 'center' | 'banner';

export interface DocSkinVars {
  paper: string;
  /** h1 밴드/배너 배경 — hex 또는 linear-gradient(...) 문자열. */
  h1bg: string;
  accent: string;
  head: string;
  thbg: string;
  line: string;
  callout: string;
  /** 표 짝수행 얼룩. 'transparent' = 없음. */
  rowTint: string;
  /** hr 오너먼트 이모지(빈 문자열 = 없음). */
  orn: string;
}

export interface DocSkinVariant {
  id: string;
  name: string;
  desc: string;
  h1: DocSkinH1;
  /** true = 주제 스티커 이미지 꾸밈 포함(적용 시 ensureDocDecoImages 가 이미지를 준비). */
  withImages?: boolean;
  vars: DocSkinVars;
}

export const DOC_SKIN_FAMILIES: Record<DocSkinFamily, DocSkinVariant[]> = {
  basic: [
    {
      id: 'basic-cream-classic',
      name: '크림 기본',
      desc: '지금 보시는 기본 크림 룩 그대로 쓰고 싶을 때 좋아요.',
      h1: 'band',
      vars: {
        paper: '#fbf7ef',
        h1bg: '#f5ead9',
        accent: '#f2733e',
        head: '#3d3428',
        thbg: '#f5ead9',
        line: '#e8e0d2',
        callout: '#f9f3e8',
        rowTint: 'transparent',
        orn: '❀',
      },
    },
    {
      id: 'basic-latte',
      name: '라떼',
      desc: '부드러운 커피빛으로 차분하게 정돈된 문서가 돼요.',
      h1: 'underline',
      vars: {
        paper: '#faf5ee',
        h1bg: '#efe2d0',
        accent: '#b07d52',
        head: '#4a3826',
        thbg: '#f2e8da',
        line: '#e5d8c6',
        callout: '#f7efe3',
        rowTint: '#f6f0e5',
        orn: '☕',
      },
    },
    {
      id: 'basic-coral-pop',
      name: '코랄 팝',
      desc: '코랄 배너로 발표 자료처럼 산뜻하게 보여요.',
      h1: 'banner',
      vars: {
        paper: '#fffaf6',
        h1bg: 'linear-gradient(90deg, #ffe3d3, #ffd2b3)',
        accent: '#f2733e',
        head: '#7a3a1d',
        thbg: '#ffe9dc',
        line: '#f4d9c8',
        callout: '#fff1e8',
        rowTint: '#fdf0e6',
        orn: '⭐',
      },
    },
    {
      id: 'basic-kraft',
      name: '크라프트',
      desc: '종이상자 같은 질감으로 손공예 활동과 잘 어울려요.',
      h1: 'band',
      vars: {
        paper: '#f8f2e5',
        h1bg: '#ecdcc0',
        accent: '#a97e46',
        head: '#4a3a20',
        thbg: '#efe2c9',
        line: '#e3d4b6',
        callout: '#f4ecd9',
        rowTint: '#f3ecdb',
        orn: '🧸',
      },
    },
    {
      id: 'basic-apricot',
      name: '살구빛',
      desc: '살구빛으로 다정하고 포근한 인상을 줘요.',
      h1: 'center',
      vars: {
        paper: '#fdf6ef',
        h1bg: '#fbe6d3',
        accent: '#e08a4e',
        head: '#6b4423',
        thbg: '#fbe9d8',
        line: '#f0dcc6',
        callout: '#fdf1e5',
        rowTint: '#fbf0e2',
        orn: '🍑',
      },
    },
    {
      id: 'basic-honey',
      name: '꿀단지',
      desc: '노란 꿀빛으로 밝고 명랑한 분위기를 내요.',
      h1: 'band',
      vars: {
        paper: '#fdf8ec',
        h1bg: '#f7ecc7',
        accent: '#cf9a2c',
        head: '#5c451a',
        thbg: '#f8eecf',
        line: '#ecdfb8',
        callout: '#fbf4dd',
        rowTint: '#faf3da',
        orn: '🍯',
      },
    },
    {
      id: 'basic-oatmeal',
      name: '오트밀',
      desc: '장식 없이 담백해서 글이 또렷하게 읽혀요.',
      h1: 'underline',
      vars: {
        paper: '#faf8f4',
        h1bg: '#eeeae1',
        accent: '#9a8b6d',
        head: '#45403a',
        thbg: '#f0ece2',
        line: '#e5e0d4',
        callout: '#f6f3ec',
        rowTint: 'transparent',
        orn: '',
      },
    },
    {
      id: 'basic-sticker-picnic',
      name: '스티커 소풍',
      desc: '주제 그림 스티커가 제목 옆과 모서리에 콕콕 붙어요.',
      h1: 'banner',
      withImages: true,
      vars: {
        paper: '#fffaf3',
        h1bg: 'linear-gradient(90deg, #ffedd6, #fde1c3, #ffe9d9)',
        accent: '#f2733e',
        head: '#6a4a25',
        thbg: '#fdecd7',
        line: '#f2ddc2',
        callout: '#fff4e4',
        rowTint: '#fdf2e0',
        orn: '🎨',
      },
    },
    {
      id: 'basic-bear-stamp',
      name: '곰돌이 도장',
      desc: '코코아빛 종이에 주제 그림이 곰돌이 스탬프처럼 앉아요.',
      h1: 'band',
      withImages: true,
      vars: {
        paper: '#faf5f0',
        h1bg: '#eddccd',
        accent: '#96634a',
        head: '#4b3026',
        thbg: '#f1e3d7',
        line: '#e5d3c4',
        callout: '#f7ede4',
        rowTint: '#f6ecdf',
        orn: '🐻',
      },
    },
    {
      id: 'basic-memory-album',
      name: '추억 앨범',
      desc: '세피아빛 앨범처럼 주제 이미지가 함께 담겨요.',
      h1: 'center',
      withImages: true,
      vars: {
        paper: '#fcf7ee',
        h1bg: '#f3e6cf',
        accent: '#c78a54',
        head: '#55402a',
        thbg: '#f4e9d4',
        line: '#e9dcc2',
        callout: '#f9f1df',
        rowTint: '#f7efdd',
        orn: '📷',
      },
    },
  ],
  pastel: [
    {
      id: 'pastel-spring-classic',
      name: '봄빛 기본',
      desc: '지금 쓰는 봄빛 파스텔 룩 그대로 쓰고 싶을 때 좋아요.',
      h1: 'band',
      vars: {
        paper: '#fffafc',
        h1bg: '#fdeef3',
        accent: '#ef92b4',
        head: '#8a3b58',
        thbg: '#fdeef3',
        line: '#f3cddb',
        callout: '#fdf4f7',
        rowTint: 'transparent',
        orn: '❀',
      },
    },
    {
      id: 'pastel-cherry-blossom',
      name: '벚꽃',
      desc: '벚꽃잎처럼 연분홍이 살랑살랑 흩날리는 느낌이에요.',
      h1: 'center',
      vars: {
        paper: '#fff8fa',
        h1bg: '#fce4ec',
        accent: '#e57ba0',
        head: '#7c3352',
        thbg: '#fbe3ec',
        line: '#f2cbd9',
        callout: '#fdf0f4',
        rowTint: '#fcedf2',
        orn: '🌸',
      },
    },
    {
      id: 'pastel-lavender',
      name: '라벤더',
      desc: '보랏빛 라벤더로 차분하고 은은하게 가라앉혀요.',
      h1: 'band',
      vars: {
        paper: '#fbf9ff',
        h1bg: '#ece6f9',
        accent: '#a58ad6',
        head: '#4f3d78',
        thbg: '#eee8fa',
        line: '#dcd2ef',
        callout: '#f5f1fc',
        rowTint: '#f3effa',
        orn: '💜',
      },
    },
    {
      id: 'pastel-mint-cream',
      name: '민트크림',
      desc: '민트빛으로 시원하고 깨끗한 인상을 줘요.',
      h1: 'underline',
      vars: {
        paper: '#f7fdfb',
        h1bg: '#ddf3ec',
        accent: '#58b9a0',
        head: '#1f5c4d',
        thbg: '#e2f4ee',
        line: '#c8e7dd',
        callout: '#eef9f5',
        rowTint: '#ecf7f2',
        orn: '🍃',
      },
    },
    {
      id: 'pastel-lemon',
      name: '레몬',
      desc: '레몬빛 노랑으로 아침처럼 상큼하게 시작해요.',
      h1: 'underline',
      vars: {
        paper: '#fffdf2',
        h1bg: '#fbf3c9',
        accent: '#d9b32c',
        head: '#6a5514',
        thbg: '#fbf4cf',
        line: '#efe4ae',
        callout: '#fdf8dd',
        rowTint: '#fbf7d9',
        orn: '🍋',
      },
    },
    {
      id: 'pastel-sky',
      name: '하늘',
      desc: '맑은 하늘빛으로 산뜻하게 트여 보여요.',
      h1: 'center',
      vars: {
        paper: '#f7fbff',
        h1bg: '#ddedfb',
        accent: '#6aa8dd',
        head: '#244a6e',
        thbg: '#e2f0fb',
        line: '#c9e0f2',
        callout: '#eef6fd',
        rowTint: '#ebf4fc',
        orn: '☁️',
      },
    },
    {
      id: 'pastel-rainbow',
      name: '무지개',
      desc: '무지개 배너가 제목을 알록달록 물들여요.',
      h1: 'banner',
      vars: {
        paper: '#fffcfa',
        h1bg: 'linear-gradient(90deg, #ffd9d9, #ffeccc, #fdf6c9, #d9f2dd, #d7e9fb, #e9ddf6)',
        accent: '#ef8aa0',
        head: '#5a4668',
        thbg: '#fdeef1',
        line: '#f0dce4',
        callout: '#fdf4f6',
        rowTint: '#faf1f5',
        orn: '⭐',
      },
    },
    {
      id: 'pastel-cotton-candy',
      name: '솜사탕 꾸밈',
      desc: '분홍·하늘 솜사탕 배너에 주제 스티커가 사르르 얹혀요.',
      h1: 'banner',
      withImages: true,
      vars: {
        paper: '#fffbfd',
        h1bg: 'linear-gradient(90deg, #ffe0ef, #e3ecff)',
        accent: '#dd8ec4',
        head: '#6e3b60',
        thbg: '#fbe6f1',
        line: '#f0d3e3',
        callout: '#fdf1f7',
        rowTint: '#fbeef5',
        orn: '🍭',
      },
    },
    {
      id: 'pastel-chick-outing',
      name: '병아리 소풍',
      desc: '병아리 스티커가 노란 문서를 아장아장 따라다녀요.',
      h1: 'band',
      withImages: true,
      vars: {
        paper: '#fffdf4',
        h1bg: '#fdf0c4',
        accent: '#e9b420',
        head: '#6d5310',
        thbg: '#fdf2cd',
        line: '#f1e3ab',
        callout: '#fef8dc',
        rowTint: '#fcf5d6',
        orn: '🐣',
      },
    },
    {
      id: 'pastel-flower-sticker',
      name: '꽃밭 스티커',
      desc: '꽃 스티커가 문서 곳곳에 꽃밭처럼 피어나요.',
      h1: 'center',
      withImages: true,
      vars: {
        paper: '#fffaf8',
        h1bg: '#fde8e6',
        accent: '#e57f79',
        head: '#7b3a33',
        thbg: '#fdeae6',
        line: '#f3d3ce',
        callout: '#fef2ef',
        rowTint: '#f3f7ea',
        orn: '🌷',
      },
    },
  ],
  nature: [
    {
      id: 'nature-forest-classic',
      name: '숲속 기본',
      desc: '지금 쓰는 숲속 자연 룩 그대로 쓰고 싶을 때 좋아요.',
      h1: 'band',
      vars: {
        paper: '#fbfdf7',
        h1bg: '#eef3e6',
        accent: '#5c8a4e',
        head: '#33502b',
        thbg: '#eef3e6',
        line: '#cfdcc2',
        callout: '#f4f8ee',
        rowTint: 'transparent',
        orn: '🌿',
      },
    },
    {
      id: 'nature-sprout',
      name: '새싹',
      desc: '새싹처럼 연둣빛이 파릇파릇 돋아나는 봄 문서예요.',
      h1: 'underline',
      vars: {
        paper: '#f9fdf4',
        h1bg: '#e4f2d5',
        accent: '#7fb05a',
        head: '#3c5a26',
        thbg: '#e8f3db',
        line: '#d3e5bf',
        callout: '#f1f8e8',
        rowTint: '#eff6e4',
        orn: '🌱',
      },
    },
    {
      id: 'nature-olive',
      name: '올리브',
      desc: '올리브빛으로 어른스럽고 차분하게 정리돼요.',
      h1: 'band',
      vars: {
        paper: '#fbfbf3',
        h1bg: '#eaead2',
        accent: '#8a8f4b',
        head: '#4a4d24',
        thbg: '#ededd8',
        line: '#dcdcc0',
        callout: '#f4f4e4',
        rowTint: '#f2f2e0',
        orn: '🫒',
      },
    },
    {
      id: 'nature-sea',
      name: '바다',
      desc: '바닷빛 청록으로 시원하게 넘실거려요. 물놀이 주제에 좋아요.',
      h1: 'center',
      vars: {
        paper: '#f5fcfb',
        h1bg: '#d9f0ec',
        accent: '#3f9d92',
        head: '#1c534c',
        thbg: '#def1ee',
        line: '#c3e2dc',
        callout: '#ebf7f5',
        rowTint: '#e8f5f2',
        orn: '🐚',
      },
    },
    {
      id: 'nature-wildflower',
      name: '들꽃',
      desc: '초록 들판에 들꽃 분홍이 점점이 피어나요.',
      h1: 'underline',
      vars: {
        paper: '#fbfdf6',
        h1bg: '#eef4e2',
        accent: '#d1719a',
        head: '#3f5430',
        thbg: '#eff4e4',
        line: '#d8e3c8',
        callout: '#f5f9ec',
        rowTint: '#f2f7e8',
        orn: '🌼',
      },
    },
    {
      id: 'nature-autumn-leaf',
      name: '단풍',
      desc: '가을 단풍빛 배너로 따뜻하게 물들어요.',
      h1: 'banner',
      vars: {
        paper: '#fdf9f2',
        h1bg: 'linear-gradient(90deg, #fbe4c4, #f5cfa6)',
        accent: '#c96f38',
        head: '#6b3c1c',
        thbg: '#f9e7cf',
        line: '#ecd6b8',
        callout: '#fcf1e0',
        rowTint: '#f9f0de',
        orn: '🍁',
      },
    },
    {
      id: 'nature-dewdrop',
      name: '이슬비',
      desc: '이슬비 내린 아침 숲처럼 촉촉하고 고요해요.',
      h1: 'center',
      vars: {
        paper: '#f8fbf9',
        h1bg: '#e3ede7',
        accent: '#6d9b85',
        head: '#35544a',
        thbg: '#e7efe9',
        line: '#d2e0d7',
        callout: '#eff5f1',
        rowTint: 'transparent',
        orn: '💧',
      },
    },
    {
      id: 'nature-forest-friends',
      name: '숲속 친구',
      desc: '다람쥐·고슴도치 같은 숲 친구 그림이 함께 붙어요.',
      h1: 'band',
      withImages: true,
      vars: {
        paper: '#fafcf3',
        h1bg: '#e9f1da',
        accent: '#6f9a4a',
        head: '#38512a',
        thbg: '#ecf2df',
        line: '#d6e2c2',
        callout: '#f3f8e9',
        rowTint: '#f0f5e3',
        orn: '🐿️',
      },
    },
    {
      id: 'nature-garden-sticker',
      name: '텃밭 꾸밈',
      desc: '채소 스티커가 텃밭처럼 조롱조롱 열려요.',
      h1: 'center',
      withImages: true,
      vars: {
        paper: '#fcfdf4',
        h1bg: '#f0f4d8',
        accent: '#8fa53c',
        head: '#4a531d',
        thbg: '#f1f5de',
        line: '#e0e6c4',
        callout: '#f7f9e7',
        rowTint: '#f5f7e2',
        orn: '🥕',
      },
    },
    {
      id: 'nature-picnic-mat',
      name: '숲 소풍',
      desc: '돗자리 펴듯 초록 배너에 소풍 그림이 얹혀요.',
      h1: 'banner',
      withImages: true,
      vars: {
        paper: '#fcfdf8',
        h1bg: 'linear-gradient(90deg, #ddefd3, #f7edcd)',
        accent: '#6b9a55',
        head: '#3b5531',
        thbg: '#e9f2df',
        line: '#d5e2c6',
        callout: '#f3f8ec',
        rowTint: '#f1f6e9',
        orn: '🧺',
      },
    },
  ],
  formal: [
    {
      id: 'formal-seal-classic',
      name: '결재 기본',
      desc: '지금 쓰는 단정한 결재 룩 그대로 쓰고 싶을 때 좋아요.',
      h1: 'underline',
      vars: {
        paper: '#ffffff',
        h1bg: 'transparent',
        accent: '#2c3e66',
        head: '#1f2c49',
        thbg: '#eef1f7',
        line: '#b9c2d6',
        callout: '#f5f7fb',
        rowTint: 'transparent',
        orn: '',
      },
    },
    {
      id: 'formal-indigo',
      name: '쪽빛',
      desc: '쪽빛 남색과 은은한 얼룩으로 신뢰감 있게 정돈돼요.',
      h1: 'center',
      vars: {
        paper: '#fbfcfe',
        h1bg: '#e8edf6',
        accent: '#3f5b96',
        head: '#22335c',
        thbg: '#eaeef6',
        line: '#ccd5e5',
        callout: '#f3f6fb',
        rowTint: '#f4f6fa',
        orn: '',
      },
    },
    {
      id: 'formal-gray-suit',
      name: '그레이 정장',
      desc: '무채색 정장처럼 절제되고 담백한 공문 느낌이에요.',
      h1: 'underline',
      vars: {
        paper: '#fdfdfd',
        h1bg: 'transparent',
        accent: '#55606e',
        head: '#2b333d',
        thbg: '#eef0f3',
        line: '#c9ced6',
        callout: '#f5f6f8',
        rowTint: '#f6f7f9',
        orn: '',
      },
    },
    {
      id: 'formal-burgundy',
      name: '버건디',
      desc: '버건디 포인트로 품위 있는 행사·안내 문서가 돼요.',
      h1: 'band',
      vars: {
        paper: '#fffcfc',
        h1bg: '#f6e7e9',
        accent: '#8e3b4a',
        head: '#5a2430',
        thbg: '#f5e9eb',
        line: '#e3ccd0',
        callout: '#faf1f2',
        rowTint: '#f8f0f1',
        orn: '',
      },
    },
    {
      id: 'formal-deep-green',
      name: '딥그린',
      desc: '짙은 초록으로 단정하고 안정감 있게 보여요.',
      h1: 'band',
      vars: {
        paper: '#fcfdfc',
        h1bg: '#e7efe9',
        accent: '#3e6b52',
        head: '#24402f',
        thbg: '#e9f0ea',
        line: '#ccdcd1',
        callout: '#f2f7f3',
        rowTint: '#f3f7f4',
        orn: '',
      },
    },
    {
      id: 'formal-gold-line',
      name: '골드 라인',
      desc: '금빛 밑줄로 상장처럼 격조 있게 마무리돼요.',
      h1: 'underline',
      vars: {
        paper: '#fffefa',
        h1bg: 'transparent',
        accent: '#b18a3c',
        head: '#3a3324',
        thbg: '#f6f1e3',
        line: '#d9c9a4',
        callout: '#faf6ea',
        rowTint: 'transparent',
        orn: '',
      },
    },
    {
      id: 'formal-sky',
      name: '연하늘',
      desc: '연하늘빛으로 부드러운 격식을 갖춘 안내문에 좋아요.',
      h1: 'center',
      vars: {
        paper: '#fafcfe',
        h1bg: '#e3eef8',
        accent: '#4a7fb5',
        head: '#27476a',
        thbg: '#e8f1f9',
        line: '#c8dcec',
        callout: '#f2f8fc',
        rowTint: '#f3f8fc',
        orn: '',
      },
    },
    {
      id: 'formal-briefing-deco',
      name: '브리핑 꾸밈',
      desc: '은은한 남색 배너 옆에 주제 그림이 단정히 붙어요.',
      h1: 'banner',
      withImages: true,
      vars: {
        paper: '#ffffff',
        h1bg: 'linear-gradient(90deg, #e4eaf5, #f0f4fa)',
        accent: '#2c3e66',
        head: '#1f2c49',
        thbg: '#eef1f7',
        line: '#bfc8da',
        callout: '#f5f7fb',
        rowTint: '#f7f9fc',
        orn: '',
      },
    },
    {
      id: 'formal-award',
      name: '표창장',
      desc: '상장처럼 금장 밴드에 주제 그림이 훈장처럼 붙어요.',
      h1: 'band',
      withImages: true,
      vars: {
        paper: '#fffdf7',
        h1bg: '#f3ead2',
        accent: '#b08d3e',
        head: '#2e3a58',
        thbg: '#f2ecda',
        line: '#ddd0ac',
        callout: '#f9f4e6',
        rowTint: '#f8f4e6',
        orn: '⭐',
      },
    },
    {
      id: 'formal-stamp-deco',
      name: '도장 꾸밈',
      desc: '결재 도장 같은 주제 그림이 제목 곁에 콕 찍혀요.',
      h1: 'center',
      withImages: true,
      vars: {
        paper: '#fffdfc',
        h1bg: '#f9ecea',
        accent: '#b04a3f',
        head: '#4a2f2a',
        thbg: '#f7ecea',
        line: '#e6cfcb',
        callout: '#fbf2f0',
        rowTint: 'transparent',
        orn: '',
      },
    },
  ],};

export const FAMILY_META: Array<{ id: DocSkinFamily; name: string; desc: string }> = [
  { id: 'basic', name: '크림 기본', desc: '언제나 무난해요' },
  { id: 'pastel', name: '봄빛 파스텔', desc: '학부모 공유용으로' },
  { id: 'nature', name: '숲속 자연', desc: '숲놀이·자연탐구에' },
  { id: 'formal', name: '단정한 결재', desc: '결재·제출 서식으로' },
];

/** 변형 찾기 — 없으면 그 패밀리의 1번(클래식) 변형. 구 문서(docVariant 없음) 호환. */
export function findVariant(family: string | undefined, variantId: string | undefined): DocSkinVariant | null {
  const fam = DOC_SKIN_FAMILIES[(family ?? '') as DocSkinFamily];
  if (!fam) return null;
  return fam.find((v) => v.id === variantId) ?? fam[0];
}

export interface ResolvedDocSkin {
  /** data-doc-skin 값(변형 id — [data-doc-skin^='nature'] 같은 패밀리 구조 규칙에도 쓰임). */
  id: string;
  /** data-doc-h1 값. */
  h1: DocSkinH1;
  /** --d-* CSS 변수 인라인 스타일(콘텐츠 요소·종이 둘 다 이 스타일을 받는다). */
  style: CSSProperties;
  variant: DocSkinVariant;
}

/**
 * node.data → 렌더용 스킨. docTheme 미지정/'basic'+변형 미지정 = null(기본 룩 — 속성 생략).
 * ⚠ --d-orn 은 content: var() 소비라 반드시 '따옴표 포함 문자열'로 — 생 이모지는
 *   IACVT(무효 값)로 content 가 normal 이 되어 오너먼트가 통째로 사라진다.
 */
export function resolveDocSkin(data: Record<string, unknown> | undefined): ResolvedDocSkin | null {
  const family = typeof data?.docTheme === 'string' ? data.docTheme : undefined;
  const variantId = typeof data?.docVariant === 'string' ? data.docVariant : undefined;
  if (!family || (family === 'basic' && !variantId)) return null; // 기본 룩(스킨 없음)
  const variant = findVariant(family, variantId);
  if (!variant) return null;
  const v = variant.vars;
  const style = {
    '--d-paper': v.paper,
    '--d-h1-bg': v.h1bg,
    '--d-accent': v.accent,
    '--d-ink': v.head,
    '--d-th-bg': v.thbg,
    '--d-line': v.line,
    '--d-callout': v.callout,
    '--d-row-tint': v.rowTint,
    '--d-orn': `'${v.orn}'`,
  } as CSSProperties;
  return { id: variant.id, h1: variant.h1, style, variant };
}
