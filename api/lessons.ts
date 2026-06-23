/* Vercel 서버리스 — /api/lessons. 서버 파일 DB(.kv-data)는 Vercel의 임시 파일시스템에선
   영속되지 않으므로, 수업기록의 '정본'은 클라이언트 localStorage(kv:lessons:v1 — Supabase로
   동기화됨)다. 여기선 클라이언트가 깨지지 않도록 안전한 응답만 돌려준다(서버 미러 비활성). */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, lessons: [] });
    return;
  }
  // POST(저장)·DELETE(삭제)는 로컬(동기화)이 처리 — 서버는 성공만 응답.
  res.status(200).json({ ok: true });
}
