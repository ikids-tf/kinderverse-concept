/* 지난 수업 저장소(서버 미러) — 개념 단계에서는 프로젝트의 .kv-data/lessons.json
   파일에 기록한다(브라우저 localStorage의 서버측 사본). 프로덕션 전환 시 이
   list/save/remove 계약을 그대로 Supabase 테이블(lessons)로 옮긴다(PRD §7.3). */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface LessonRecordRow {
  id: string;
  /** epoch ms — 수업 시각. */
  at: number;
  title: string;
  items: Array<{ id: string; type: string; caption: string }>;
}

const FILE = path.resolve(process.cwd(), '.kv-data', 'lessons.json');
const MAX = 200;

async function readAll(): Promise<LessonRecordRow[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8')) as LessonRecordRow[];
  } catch {
    return []; // 파일 없음/깨짐 — 빈 목록에서 시작
  }
}

async function writeAll(rows: LessonRecordRow[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows.slice(0, MAX), null, 2), 'utf8');
}

export async function dbListLessons(): Promise<LessonRecordRow[]> {
  return readAll();
}

/** 저장(같은 id면 갱신) — 최신순 정렬 유지. */
export async function dbSaveLesson(row: LessonRecordRow): Promise<void> {
  if (
    !row ||
    typeof row.id !== 'string' ||
    !row.id ||
    typeof row.at !== 'number' ||
    typeof row.title !== 'string' ||
    !Array.isArray(row.items)
  ) {
    throw new Error('invalid lesson record');
  }
  const rows = await readAll();
  const next = [
    { id: row.id, at: row.at, title: row.title.slice(0, 120), items: row.items.slice(0, 100) },
    ...rows.filter((r) => r.id !== row.id),
  ].sort((a, b) => b.at - a.at);
  await writeAll(next);
}

export async function dbRemoveLesson(id: string): Promise<void> {
  if (!id) return;
  await writeAll((await readAll()).filter((r) => r.id !== id));
}
