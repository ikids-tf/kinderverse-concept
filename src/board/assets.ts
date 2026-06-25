import { idbGet, idbSet } from './idb';

/* 이미지 자산 보관함 — 단일 요소 그림(소방차·펭귄·튤립…)을 캡션 태그로 IndexedDB에
   자동 저장한다. 같은 이름의 요청이 다시 오면 생성하지 않고 즉시 가져다 쓰고,
   프레임에 "보관함 재사용 — 새로 생성" 안내를 띄운다(취소하면 새로 생성).
   스냅샷(보드 영속화)과 별개의 키라 보드를 지워도 보관함은 남는다. */

export interface ImageAsset {
  /** 원본 캡션(표시용). 키는 정규화된 태그. */
  tag: string;
  kind: 'image' | '도안' | 'video';
  /** data URI. video는 큰 mp4 대신 '포스터(첫 프레임) 썸네일'을 담아 표시용으로 쓰고,
      실제 영상은 videoAssets(IDB)에 videoAssetId로 따로 보관한다. */
  url: string;
  createdAt: number;
  /** 생성 당시 상위 주제(예: "여러 물고기") — '물고기'처럼 묶음 검색을 가능하게. */
  group?: string;
  /** kind==='video'일 때 — videoAssets 스토어의 영상 id(배치 시 이걸로 로드). */
  videoAssetId?: string;
  /** 출처 — 'game'이면 인터랙티브 게임에서 생성(게임 이미지 탭으로 분리 표시). 없으면 일반 갤러리. */
  source?: string;
}

export type AssetKind = ImageAsset['kind'];

const KEY = 'image-assets:v1';
const MAX_PER_TAG = 3; // 태그당 최근 3장만 보관(용량 관리)

let cache: Record<string, ImageAsset[]> | null = null;

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

async function load(): Promise<Record<string, ImageAsset[]>> {
  if (!cache) cache = (await idbGet<Record<string, ImageAsset[]>>(KEY)) ?? {};
  return cache;
}

/** 보관함의 모든 자산을 최신순으로(태그·종류 무관). 갤러리 자동 표시용. */
export async function listAssets(kinds?: ImageAsset['kind'][]): Promise<ImageAsset[]> {
  const lib = await load();
  const out: ImageAsset[] = [];
  for (const arr of Object.values(lib)) {
    for (const it of arr) {
      if (!it.url) continue;
      if (kinds && !kinds.includes(it.kind)) continue;
      out.push(it);
    }
  }
  return out.sort((a, z) => z.createdAt - a.createdAt);
}

/** 이미 메모리 캐시에 로드돼 있으면 '동기로' 목록을 반환(없으면 null) — 피커를 로딩 없이 즉시 그릴 때. */
export function peekAssets(kinds?: ImageAsset['kind'][]): ImageAsset[] | null {
  if (!cache) return null;
  const out: ImageAsset[] = [];
  for (const arr of Object.values(cache)) {
    for (const it of arr) {
      if (!it.url) continue;
      if (kinds && !kinds.includes(it.kind)) continue;
      out.push(it);
    }
  }
  return out.sort((a, z) => z.createdAt - a.createdAt);
}

/** 캐시 미리 로드(오버레이 열릴 때/유휴 시) — 첫 목록 조회를 즉시로 만든다. */
export function warmupAssets(): void {
  void load();
}

/** 자산 한 개 삭제(갤러리 호버 삭제) — tag(캡션)+createdAt[+kind]로 식별. 비면 키 제거. */
export async function removeAsset(tag: string, createdAt: number, kind?: ImageAsset['kind']): Promise<void> {
  const lib = await load();
  const k = norm(tag);
  const arr = lib[k];
  if (!arr) return;
  const next = arr.filter((it) => !(it.createdAt === createdAt && (!kind || it.kind === kind)));
  if (next.length) lib[k] = next;
  else delete lib[k];
  await idbSet(KEY, lib);
}

/** 캡션과 같은 태그의 최신 자산(종류 일치)을 찾는다 — 없으면 undefined. */
export async function findAsset(caption: string, kind: ImageAsset['kind']): Promise<ImageAsset | undefined> {
  const lib = await load();
  const arr = lib[norm(caption)];
  if (!arr) return undefined;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].kind === kind && arr[i].url) return arr[i];
  return undefined;
}

/** 생성 성공한 자산을 태그로 저장(태그당 최근 N장 유지). mock/플레이스홀더는 저장하지 않는다.
    video는 url=포스터 썸네일 + videoAssetId(실제 영상은 videoAssets에 별도 보관). */
export async function saveAsset(
  caption: string,
  kind: ImageAsset['kind'],
  url: string,
  group?: string,
  videoAssetId?: string,
  source?: string,
): Promise<void> {
  if (!url || !caption.trim()) return;
  // 플레이스홀더(생성 실패 '개념' SVG 자리표시)는 저장하지 않는다 — 깨진 그림이 보관함에 고착돼
  // 다음 로드마다 재사용되는 것을 막는다. 생성 이미지는 래스터(PNG)라 image의 SVG=플레이스홀더.
  if (kind === 'image' && url.startsWith('data:image/svg')) return;
  const lib = await load();
  const k = norm(caption);
  const arr = lib[k] ?? (lib[k] = []);
  arr.push({
    tag: caption.trim(),
    kind,
    url,
    createdAt: Date.now(),
    ...(group?.trim() ? { group: group.trim() } : {}),
    ...(videoAssetId ? { videoAssetId } : {}),
    ...(source ? { source } : {}),
  });
  if (arr.length > MAX_PER_TAG) arr.splice(0, arr.length - MAX_PER_TAG);
  await idbSet(KEY, lib);
}

/** 질의 → 검색 토큰들. "브라키오와 문어, 사자랑 펭귄"처럼 복수 단어를 공백·구분자로
    나누고 끝의 연결 조사(와/과/랑/이랑/하고…)를 떼어 각 단어를 독립 토큰으로 만든다. */
function queryTokens(query: string): string[] {
  const raw = query
    .split(/[\s,+·/]+|그리고/)
    .map((w) => w.trim())
    .filter(Boolean);
  const tokens = new Set<string>();
  const q = norm(query);
  if (q.length >= 2) tokens.add(q); // 전체 질의(기존 동작)도 유지
  for (const w of raw) {
    const a = norm(w);
    if (a.length >= 2) tokens.add(a);
    const stripped = norm(w.replace(/(이랑|하고|와|과|랑|도|만|은|는|이|가|을|를)$/u, ''));
    if (stripped.length >= 2) tokens.add(stripped);
  }
  return [...tokens];
}

/** 상위어(카테고리) 검색 — "동물"을 입력하면 토끼·여우… 같은 멤버 태그를 모두 찾도록 확장한다.
    태그에는 개별 이름만 들어 있으므로(여우), 검색 시 카테고리→멤버로 펴서 매칭한다(LLM 없음·결정론).
    멤버는 '태그에 이 글자가 들어가면 그 카테고리'로 보는 부분일치 키워드(유아 콘텐츠 위주). */
const LAND_ANIMALS = ['토끼', '여우', '곰', '곰돌이', '북극곰', '판다', '사자', '호랑이', '표범', '치타', '재규어', '코끼리', '하마', '기린', '강아지', '개', '고양이', '다람쥐', '청설모', '원숭이', '고릴라', '침팬지', '오랑우탄', '너구리', '라쿤', '사슴', '노루', '순록', '양', '염소', '돼지', '멧돼지', '소', '젖소', '물소', '말', '당나귀', '얼룩말', '코알라', '캥거루', '낙타', '늑대', '두더지', '고슴도치', '햄스터', '쥐', '생쥐', '다람쥐', '수달', '비버', '족제비', '코뿔소', '나무늘보', '미어캣', '박쥐', '두꺼비', '개구리', '도롱뇽', '뱀', '도마뱀', '카멜레온', '악어', '이구아나'];
const BIRDS = ['새', '참새', '까치', '까마귀', '비둘기', '파랑새', '부엉이', '올빼미', '독수리', '매', '앵무새', '잉꼬', '제비', '닭', '수탉', '병아리', '오리', '거위', '백조', '학', '두루미', '플라밍고', '펭귄', '공작', '타조', '갈매기', '딱따구리', '뻐꾸기', '종달새', '카나리아', '꿩', '칠면조'];
const BUGS = ['나비', '잠자리', '무당벌레', '개미', '벌', '꿀벌', '말벌', '메뚜기', '방아깨비', '여치', '베짱이', '사슴벌레', '장수풍뎅이', '딱정벌레', '풍뎅이', '하늘소', '거미', '달팽이', '애벌레', '번데기', '귀뚜라미', '매미', '반딧불이', '사마귀', '파리', '모기', '지네'];
const DINOS = ['공룡', '티라노', '티라노사우루스', '브라키오', '브라키오사우루스', '트리케라', '트리케라톱스', '스테고', '스테고사우루스', '프테라', '프테라노돈', '벨로시랩터', '디플로도쿠스', '안킬로사우루스'];
const SEA = ['물고기', '물고기들', '문어', '낙지', '쭈꾸미', '오징어', '고래', '상어', '게', '꽃게', '대게', '새우', '가재', '거북', '거북이', '바다거북', '돌고래', '범고래', '불가사리', '해마', '조개', '가오리', '복어', '흰동가리', '해파리', '굴', '소라', '전복', '성게', '말미잘', '바닷가재', '물범', '바다사자', '해달', '잉어', '붕어', '메기', '가자미', '광어'];
const FRUITS = ['사과', '바나나', '딸기', '포도', '오렌지', '귤', '수박', '참외', '복숭아', '배', '키위', '체리', '레몬', '망고', '파인애플', '감', '자두', '멜론', '블루베리', '석류', '무화과'];
const VEGGIES = ['당근', '오이', '토마토', '방울토마토', '가지', '양파', '감자', '고구마', '호박', '브로콜리', '옥수수', '버섯', '파프리카', '배추', '무', '시금치', '상추', '대파', '마늘', '고추', '콩', '완두콩'];
const CATEGORY: Record<string, string[]> = {
  // '동물'은 상위어 — 땅짐승·새·곤충·바다동물·공룡을 모두 포함(파랑새도 '동물' 검색에 잡히게).
  동물: [...LAND_ANIMALS, ...BIRDS, ...BUGS, ...DINOS, ...SEA],
  짐승: LAND_ANIMALS,
  새: BIRDS,
  곤충: BUGS,
  벌레: BUGS,
  공룡: DINOS,
  바다동물: SEA,
  물고기: SEA,
  과일: FRUITS,
  과일류: FRUITS,
  채소: VEGGIES,
  야채: VEGGIES,
  음식: [...FRUITS, ...VEGGIES, '빵', '케이크', '피자', '햄버거', '아이스크림', '우유', '치즈', '계란', '밥', '국수', '김밥'],
  탈것: ['자동차', '차', '버스', '기차', '비행기', '배', '트럭', '소방차', '구급차', '경찰차', '오토바이', '자전거', '헬리콥터', '지하철', '택시', '포클레인', '기차', '로켓', '잠수함'],
  악기: ['피아노', '북', '드럼', '기타', '바이올린', '실로폰', '트라이앵글', '탬버린', '캐스터네츠', '리코더', '하모니카', '심벌즈', '나팔'],
  도형: ['동그라미', '세모', '네모', '별', '하트', '원', '삼각형', '사각형', '오각형', '육각형', '마름모', '타원'],
};
/** 태그를 검색용 '단어'들로 — 괄호·숫자 제거 후 공백 분리. 카테고리 멤버는 이 단어와 '정확 일치'로만
    매칭해, 짧은 멤버('무')가 '무당벌레'에 부분일치하지 않게 한다.
    ★조사 제거는 하지 않는다 — '고양이·원숭이·달팽이'의 끝글자 '이'는 조사가 아니라 단어의 일부라,
    제거하면 사전 멤버('고양이')와 안 맞아 누락된다(태그는 조사 없는 명사라 제거 자체가 불필요). */
function tagWords(tag: string): string[] {
  return tag
    .replace(/\([^)]*\)/g, ' ') // (생성)·(배경제거) 등 제거
    .replace(/\d+/g, ' ') // 숫자 제거('2 적힌 수박' → 적힌 수박)
    .split(/[\s,·!?]+/)
    .map((w) => norm(w))
    .filter((w) => w.length >= 1);
}

/** 입력 중 추천 검색 — 태그가 질의어를 포함하거나(주: 토끼), 질의가 카테고리(동물·과일…)면 그 멤버를
    포함하는 자산을 찾는다(태그당 최신 1장). ★정밀화: group(게임 테마)·역방향 부분일치는 매칭에서 제외해
    '토끼 꾸미기'로 묶인 부품(모자·코)이 "토끼"에 끌려오지 않게. 배경 자산은 '배경' 질의가 아니면 제외. */
/** 종류(갤러리 탭) 키워드 — 이 단어를 입력하면 그 종류 '전체'를 추천한다('이미지'→모든 이미지 등).
    갤러리 탭: 이미지/그림=사진 자산, 도안, 동영상, 자료/전체=모두. (게임·웹링크는 별도 추천 스트립.) */
const KIND_KEYWORDS: Record<string, ImageAsset['kind'][]> = {
  이미지: ['image', '도안'],
  그림: ['image', '도안'],
  사진: ['image', '도안'],
  도안: ['도안', 'image'],
  색칠: ['도안'],
  동영상: ['video'],
  영상: ['video'],
  비디오: ['video'],
  자료: ['image', '도안', 'video'],
  전체: ['image', '도안', 'video'],
};

export async function searchAssets(
  query: string,
  kind: ImageAsset['kind'] | ImageAsset['kind'][] = 'image',
  limit = Infinity, // 개수 제한 없음 — 추천 스트립이 줄바꿈+스크롤로 모두 보여준다
): Promise<ImageAsset[]> {
  const kinds = Array.isArray(kind) ? kind : [kind];
  const nq = norm(query.trim());
  const kindKw = KIND_KEYWORDS[nq]; // 질의 전체가 종류 키워드면 그 종류 '전체' 반환
  const wholeCat = CATEGORY[nq]; // 질의 전체가 카테고리(동물·새·과일…)면 멤버 매칭 — 1글자(새·소)도 허용
  const allow = kindKw ? kinds.filter((k) => kindKw.includes(k)) : kinds;
  const tokens = queryTokens(query).filter((t) => t.length >= 2); // 일반 자유어(2글자+)
  // 매칭 거리: 종류·카테고리 키워드도 없고 자유어도 없고 1글자 질의도 아니면 검색 안 함.
  if (!kindKw && !wholeCat && tokens.length === 0 && nq.length < 1) return [];
  const wantsBg = kindKw ? true : /배경/.test(query); // 종류 키워드(모든 이미지)는 배경 포함
  /** 카테고리 멤버가 태그 단어와 정확히 일치하는가(부분일치 금지 — '무'가 '무당벌레'에 안 걸리게). */
  const catHit = (members: string[], words: string[]) => members.some((m) => words.includes(norm(m)));
  const lib = await load();
  const out: ImageAsset[] = [];
  for (const arr of Object.values(lib)) {
    const seenKinds = new Set<string>();
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      if (!allow.includes(it.kind) || !it.url || seenKinds.has(it.kind)) continue;
      seenKinds.add(it.kind);
      const t = norm(it.tag);
      const words = tagWords(it.tag);
      // 배경 자산은 객체 검색에서 제외(토끼 → 토끼 객체). 종류 키워드는 포함.
      if (!wantsBg && (t.includes('배경') || norm(it.group ?? '').includes('배경'))) {
        if (seenKinds.size >= allow.length) break;
        continue;
      }
      // 토픽(2어 이상) 질의는 자료 묶음(group=plan/활동 제목)과도 매칭 — '물놀이 안전' → 그 활동의
      // 모든 이미지(태그가 '구조 장비'처럼 토픽어를 안 가진 것까지). 단어 단위가 아니라 group 포함으로,
      // 단 '모든 토큰이 group에 있을 때만'(단일어 '토끼'가 '토끼 꾸미기' group에 끌려오지 않게).
      const g = norm(it.group ?? '');
      const groupHit = tokens.length >= 2 && g.length >= 2 && tokens.every((tok) => g.includes(tok));
      const matched = kindKw
        ? true // 종류 키워드 → 그 종류 전부
        : wholeCat
          ? catHit(wholeCat, words) // 카테고리 질의 → 멤버가 태그 단어와 일치
          : groupHit || // 토픽 질의 → 활동/계획 묶음(group) 매칭
            tokens.some((tok) => {
              if (t.includes(tok)) return true; // 2글자+ 일반어 부분일치(노란색'토끼')
              const cat = CATEGORY[tok]; // 멀티워드 질의 안의 카테고리어
              return !!cat && catHit(cat, words);
            }) || (nq.length === 1 && words.includes(nq)); // 1글자 명사(곰·새·소)는 단어 정확 일치
      if (matched) out.push(it);
      if (seenKinds.size >= allow.length) break;
    }
  }
  return out.sort((a, z) => z.createdAt - a.createdAt).slice(0, limit);
}
