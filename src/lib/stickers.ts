/* Curated on-brand sticker set (Design Director — decorate pillar, P1 hybrid).
   P1 = instant emoji stickers (zero cost, consistent); AI die-cut PNG stickers
   come in P2–P3. NodeView renders each as a small white "sticker" badge.
   Themes map a kindergarten topic → relevant stickers; neutral fallback. */

/** Topic keyword → sticker pool. First-match wins; multiple themes accumulate. */
const THEMES: Array<{ match: RegExp; stickers: string[] }> = [
  { match: /봄|꽃|개나리|벚꽃|나비|새싹|식물|화단/, stickers: ['🌸', '🌷', '🌼', '🦋', '🐝', '🌱'] },
  { match: /여름|바다|물놀이|수박|모래|해변|조개/, stickers: ['☀️', '🌊', '🍉', '🐚', '🏖️', '🐠'] },
  { match: /가을|낙엽|단풍|도토리|추수|허수아비|솔방울/, stickers: ['🍂', '🍁', '🌰', '🍄', '🦔', '🌾'] },
  { match: /겨울|눈|썰매|얼음|크리스마스|눈사람|장갑/, stickers: ['❄️', '⛄', '☃️', '🧤', '🎿', '🌟'] },
  { match: /공룡|화석/, stickers: ['🦕', '🦖', '🌋', '🦴', '🌿'] },
  { match: /물고기|고래|해양|문어|상어/, stickers: ['🐟', '🐳', '🐠', '🐙', '🦀', '🌊'] },
  { match: /동물|숲|곰|토끼|사자|강아지|고양이|여우/, stickers: ['🐰', '🐻', '🦁', '🐶', '🐱', '🦊'] },
  { match: /우주|별|행성|로켓|달|밤하늘/, stickers: ['⭐', '🌟', '🚀', '🌙', '🪐', '✨'] },
  { match: /음악|악기|노래|리듬|연주/, stickers: ['🎵', '🎶', '🥁', '🎹', '🎤'] },
  { match: /미술|그림|색칠|만들기|점토|꾸미/, stickers: ['🎨', '✏️', '🖍️', '✂️', '🖌️'] },
  { match: /가족|엄마|아빠|사랑|마음|친구/, stickers: ['💛', '🧡', '🌈', '🏠', '😊'] },
  { match: /교통|자동차|기차|버스|비행기/, stickers: ['🚗', '🚕', '🚂', '🚌', '✈️'] },
  { match: /음식|요리|과일|채소|간식|먹/, stickers: ['🍎', '🍓', '🥕', '🍪', '🧁'] },
  { match: /비|구름|날씨|무지개|바람/, stickers: ['🌈', '☁️', '☔', '⛅', '💧'] },
];

const NEUTRAL = ['⭐', '💛', '✨', '🌈', '😊', '🌟'];

/** Up to `count` theme-matched sticker emojis for a topic (deduped, neutral fallback). */
export function pickStickersForTopic(topic: string, count = 4): string[] {
  const pool: string[] = [];
  for (const t of THEMES) if (t.match.test(topic)) pool.push(...t.stickers);
  const uniq = [...new Set(pool.length ? pool : NEUTRAL)];
  return uniq.slice(0, count);
}
