// kinderverse 마인드맵(생각그물) 프레임 → verse 편집기 topic_web payload 변환 + 편집기 열기.
// 마인드맵 구조: frame(data.mindmap) + center(role 'mm-center', text=대주제) + branch들(role 'mm-branch', data.activity={label,method,materials,area}).
// verse topic_web 구조: { topic_web: { main_topic, subtopics[].{ subtopic, play_ideas[] } } }.
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { spawnEditorCard } from './spawnEditorCard';

interface MindActivity {
  label?: string;
  method?: string;
  materials?: string;
  area?: string;
}

export function mindmapFrameToPayload(frameId: string) {
  const nodes = useBoardStore.getState().nodes;
  const all = Object.values(nodes) as BoardNode[];
  const center = all.find((n) => n.data?.role === 'mm-center' && n.data?.frameId === frameId);
  const branches = all.filter((n) => n.data?.role === 'mm-branch' && n.data?.frameId === frameId);
  const frameTitle = (nodes[frameId]?.data?.title as string | undefined) ?? '';
  const main_topic = (center?.text || frameTitle || '놀이주제망').trim();

  const subtopics = branches.map((b) => {
    const a = (b.data?.activity as MindActivity | undefined) ?? {};
    const label = (a.label || (b.text || '').split('\n')[0] || '활동').trim();
    const ideas = [
      a.method,
      a.materials ? `준비물: ${a.materials}` : '',
      a.area ? `연계: ${a.area}` : '',
    ].filter(Boolean) as string[];
    return { subtopic: label, play_ideas: ideas.length ? ideas : [label] };
  });

  return {
    header: { title: main_topic },
    meta: { theme: main_topic },
    topic_web: { main_topic, subtopics },
    children_expected_questions: [] as string[],
  };
}

/** 마인드맵 프레임을 verse 편집기(주제망 = topicweb)로 연다. */
export function openMindmapInEditor(frameId: string): void {
  spawnEditorCard('topicweb', mindmapFrameToPayload(frameId));
}

interface TopicWebNodePayload {
  type?: string;
  props?: {
    main_topic?: string;
    theme?: string;
    subtopics?: Array<{ subtopic?: string; play_ideas?: string[] }>;
    children_expected_questions?: string[];
  };
}

/** TopicWeb 카드(payload type 'TopicWeb') → verse topicweb payload 로 변환. */
export function topicWebNodeToPayload(node: BoardNode) {
  const p = (node.data?.payload as TopicWebNodePayload | undefined)?.props ?? {};
  const main_topic = (p.main_topic || (node.data?.title as string | undefined) || '놀이주제망').trim();
  const subtopics = (p.subtopics ?? [])
    .map((s) => ({
      subtopic: (s.subtopic ?? '').trim(),
      play_ideas: (s.play_ideas ?? []).map((x) => String(x).trim()).filter(Boolean),
    }))
    .filter((s) => s.subtopic);
  return {
    header: { title: main_topic },
    meta: { theme: (p.theme || main_topic).trim() },
    topic_web: { main_topic, subtopics },
    children_expected_questions: (p.children_expected_questions ?? []).map((x) => String(x).trim()).filter(Boolean),
  };
}

/** TopicWeb 카드를 verse 편집기(주제망 = topicweb)로 연다. */
export function openTopicWebInEditor(nodeId: string): void {
  const node = useBoardStore.getState().nodes[nodeId];
  if (!node) return;
  spawnEditorCard('topicweb', topicWebNodeToPayload(node));
}

// ───────────────────────── 마크다운 마인드맵 문서(kv-doc-md) → topic_web ─────────────────────────
// openDocOnBoard 로 생긴 마크다운 문서 카드(payload 없음, role 'plan')가 '마인드맵'이면
// H1=대주제, H2 섹션=소주제(불릿=놀이 아이디어), '궁금·질문' 섹션=탐구 질문으로 파싱한다.

const MINDMAP_DOC_RE = /마인드맵|생각그물|주제망/;

/** 문서 카드가 '마크다운 마인드맵'인가 — doc + 구조화 payload 없음 + 마인드맵 키워드. */
export function isMindmapDoc(node: BoardNode): boolean {
  if (!node?.data?.doc) return false;
  if ((node.data?.payload as { type?: string } | undefined)?.type) return false; // 정식 카드(계획/기록 등) 제외
  const text = (node.text || '').slice(0, 200);
  const head = text.split('\n').find((l) => l.trim().startsWith('#')) || text;
  return MINDMAP_DOC_RE.test(head) || MINDMAP_DOC_RE.test(text.split('\n')[0] || '');
}

const stripLeadIcon = (s: string) => s.replace(/^#{1,6}\s*/, '').replace(/^[^\p{L}\p{N}"']+/u, '').trim();
const cleanInline = (s: string) =>
  s.replace(/\*\*|__|`|~~/g, '').replace(/^[-*+]\s+/, '').replace(/^\|/, '').trim();

/** 마크다운 마인드맵 본문 → topic_web payload. */
export function parseMindmapDoc(text: string) {
  const lines = (text || '').split('\n');
  let main = '놀이 주제망';
  const subtopics: Array<{ subtopic: string; play_ideas: string[] }> = [];
  const questions: string[] = [];

  let cur: { name: string; ideas: string[]; isQ: boolean; skip: boolean } | null = null;
  const flush = () => {
    if (!cur || cur.skip) return;
    const ideas = cur.ideas.map(cleanInline).filter(Boolean);
    if (cur.isQ) questions.push(...ideas);
    else if (cur.name) subtopics.push({ subtopic: cur.name, play_ideas: ideas });
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    if (h1) {
      main = stripLeadIcon(h1[1]).replace(/\s*(마인드맵|생각그물|주제망)\s*$/, '').trim() || main;
      continue;
    }
    if (h2) {
      flush();
      const label = stripLeadIcon(h2[1]).split(/[—–]/)[0].trim(); // "— 영역" 앞부분이 소주제명
      const skip = /전체\s*구조|한눈에|structure/.test(label);
      const isQ = /궁금|질문|물음/.test(label);
      cur = { name: label, ideas: [], isQ, skip };
      continue;
    }
    if (!cur || cur.skip) continue;
    const t = line.trim();
    if (/^[-*+]\s+/.test(t)) cur.ideas.push(t); // 불릿
    else if (/^\|.*\|/.test(t) && !/^\|\s*[-:]+/.test(t)) {
      // 표 행 → "셀1: 나머지 셀" 로 이어붙여 한 아이디어
      const cells = t.split('|').map((c) => cleanInline(c)).filter(Boolean);
      if (cells.length && !/^(분류|구분|영역|예시|항목)$/.test(cells[0])) cur.ideas.push(cells.join(': '));
    }
  }
  flush();

  return {
    header: { title: main },
    meta: { theme: main },
    topic_web: { main_topic: main, subtopics: subtopics.slice(0, 8) },
    children_expected_questions: questions.slice(0, 6),
  };
}

/** 마크다운 마인드맵 문서를 verse 편집기(주제망 = topicweb)로 연다. */
export function openMindmapDocInEditor(nodeId: string): void {
  const node = useBoardStore.getState().nodes[nodeId];
  if (!node) return;
  spawnEditorCard('topicweb', parseMindmapDoc(node.text || ''));
}
