import { useState } from 'react';
import { Icon } from '@/lib/icons';
import {
  useClassStore,
  type Attendance,
  type Child,
} from '@/store/classStore';

/* 우리반 (PRD §4.4). 반 선택 · 아동 명부 · 아동 상세(출결·하원·투약·특이사항·동의).
   아동 정보는 테넌트 내부에서만 표시; 에이전트로 나갈 때 buildTenantContext가 마스킹. */

const ATT_LABEL: Record<Attendance, string> = { present: '출석', absent: '결석', pending: '미정' };
const ATT_DOT: Record<Attendance, string> = {
  present: 'bg-success',
  absent: 'bg-danger',
  pending: 'bg-fg-disabled',
};

function ChildDetail({ child }: { child: Child }) {
  const updateChild = useClassStore((s) => s.updateChild);
  const setAttendance = useClassStore((s) => s.setAttendance);
  const setPickup = useClassStore((s) => s.setPickup);
  const addMedication = useClassStore((s) => s.addMedication);
  const removeMedication = useClassStore((s) => s.removeMedication);
  const removeChild = useClassStore((s) => s.removeChild);

  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [medTime, setMedTime] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  function addMed() {
    if (!medName.trim()) return;
    addMedication(child.id, { name: medName.trim(), dose: medDose.trim(), time: medTime.trim() });
    setMedName('');
    setMedDose('');
    setMedTime('');
  }

  return (
    <div className="flex flex-col gap-t5">
      <div className="flex items-center gap-t3">
        <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-surface-3 font-display text-h4 text-fg">
          {child.name[0]}
        </span>
        <div>
          <h2 className="font-display text-h3 font-semibold text-fg">{child.name}</h2>
          <span className="text-overline text-fg-muted">
            {child.consent ? '사진 동의 ✓' : '사진 미동의 — 파이프라인 제외'}
          </span>
        </div>
      </div>

      {/* 출결 */}
      <section>
        <div className="text-overline mb-t2 text-fg-muted">출결</div>
        <div className="flex gap-t1">
          {(['present', 'absent', 'pending'] as Attendance[]).map((a) => (
            <button
              key={a}
              onClick={() => setAttendance(child.id, a)}
              className={`rounded-pill px-t4 py-t2 text-sm font-medium transition-colors duration-150 ease-soft ${
                child.attendance === a
                  ? 'bg-fg text-on-dark'
                  : 'border border-border bg-surface text-fg-2 hover:bg-surface-2'
              }`}
            >
              {ATT_LABEL[a]}
            </button>
          ))}
        </div>
      </section>

      {/* 하원시간 */}
      <section>
        <div className="text-overline mb-t2 text-fg-muted">하원시간</div>
        <input
          type="time"
          value={child.pickupTime ?? ''}
          onChange={(e) => setPickup(child.id, e.target.value)}
          className="rounded-md border border-field-border bg-surface px-t3 py-t2 text-body text-fg focus:outline-none focus:ring-2 focus:ring-focus"
        />
      </section>

      {/* 투약 */}
      <section>
        <div className="text-overline mb-t2 text-fg-muted">투약</div>
        <div className="flex flex-col gap-t2">
          {child.medications.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-t2 rounded-md border border-border bg-surface px-t3 py-t2 text-sm"
            >
              <Icon name="check" size={14} />
              <span className="font-medium text-fg">{m.name}</span>
              <span className="text-fg-2">
                {m.dose} {m.time && `· ${m.time}`} {m.note && `· ${m.note}`}
              </span>
              <button
                onClick={() => removeMedication(child.id, m.id)}
                className="ml-auto text-fg-muted hover:text-danger"
                aria-label="투약 삭제"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
          {child.medications.length === 0 && (
            <p className="text-sm text-fg-muted">등록된 투약 정보가 없어요.</p>
          )}
        </div>
        <div className="mt-t2 flex flex-wrap gap-t2">
          <input
            value={medName}
            onChange={(e) => setMedName(e.target.value)}
            placeholder="약 이름"
            className="w-28 rounded-md border border-field-border bg-surface px-t3 py-t2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
          />
          <input
            value={medDose}
            onChange={(e) => setMedDose(e.target.value)}
            placeholder="용량"
            className="w-20 rounded-md border border-field-border bg-surface px-t3 py-t2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
          />
          <input
            value={medTime}
            onChange={(e) => setMedTime(e.target.value)}
            placeholder="시간"
            className="w-20 rounded-md border border-field-border bg-surface px-t3 py-t2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
          />
          <button
            onClick={addMed}
            className="rounded-pill bg-accent px-t4 py-t2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
          >
            추가
          </button>
        </div>
      </section>

      {/* 특이사항 */}
      <section>
        <div className="text-overline mb-t2 text-fg-muted">특이사항</div>
        <textarea
          value={child.notes}
          onChange={(e) => updateChild(child.id, { notes: e.target.value })}
          placeholder="알레르기·발달 특이사항 등"
          className="min-h-[80px] w-full resize-y rounded-md border border-field-border bg-surface px-t3 py-t2 text-body text-fg focus:outline-none focus:ring-2 focus:ring-focus"
        />
      </section>

      {/* 동의 */}
      <section className="flex items-center justify-between rounded-md border border-border bg-surface px-t4 py-t3">
        <div>
          <div className="text-sm font-medium text-fg">사진 사용 동의 (consent_flag)</div>
          <div className="text-overline text-fg-muted">미동의 사진은 분류·생성 파이프라인에서 제외됩니다.</div>
        </div>
        <button
          onClick={() => updateChild(child.id, { consent: !child.consent })}
          className={`relative h-6 w-11 rounded-pill transition-colors duration-150 ${
            child.consent ? 'bg-accent' : 'bg-surface-3'
          }`}
          aria-pressed={child.consent}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-all duration-150 ${
              child.consent ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </section>

      {/* 영구 삭제 = L3 휴먼게이트 */}
      <section className="border-t border-border pt-t4">
        {confirmDel ? (
          <div className="flex flex-wrap items-center gap-t2 rounded-md bg-danger-soft px-t4 py-t3">
            <Icon name="lock" size={16} color="var(--danger)" />
            <span className="text-sm text-fg-1">아동 정보를 영구 삭제합니다(되돌릴 수 없음).</span>
            <div className="ml-auto flex gap-t2">
              <button onClick={() => removeChild(child.id)} className="rounded-pill bg-danger px-t3 py-1 text-sm font-semibold text-on-accent">삭제</button>
              <button onClick={() => setConfirmDel(false)} className="rounded-pill border border-border px-t3 py-1 text-sm text-fg-2">취소</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            className="inline-flex items-center gap-t1 text-sm text-fg-muted hover:text-danger"
          >
            <Icon name="lock" size={13} /> 원아 영구 삭제 (L3)
          </button>
        )}
      </section>
    </div>
  );
}

export function OurClassPage() {
  const classes = useClassStore((s) => s.classes);
  const selectedClassId = useClassStore((s) => s.selectedClassId);
  const selectedChildId = useClassStore((s) => s.selectedChildId);
  const children = useClassStore((s) => s.children);
  const selectClass = useClassStore((s) => s.selectClass);
  const selectChild = useClassStore((s) => s.selectChild);
  const addChild = useClassStore((s) => s.addChild);
  const childrenOf = useClassStore((s) => s.childrenOf);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const roster = childrenOf(selectedClassId);
  const selected = selectedChildId ? children[selectedChildId] : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-t6 pt-t7 pb-40">
      <header className="mb-t6">
        <div className="text-overline mb-t2 text-fg-muted">아동 등록·관리</div>
        <h1 className="font-display text-display font-semibold tracking-[-0.01em] text-fg">우리반</h1>
      </header>

      {/* 반 선택 */}
      <div className="mb-t5 flex flex-wrap gap-t2">
        {classes.map((c) => (
          <button
            key={c.id}
            onClick={() => selectClass(c.id)}
            className={`rounded-pill px-t4 py-t2 text-sm font-medium transition-colors duration-150 ease-soft ${
              c.id === selectedClassId
                ? 'bg-fg text-on-dark'
                : 'border border-border bg-surface text-fg-2 hover:bg-surface-2'
            }`}
          >
            {c.name} · {c.ageBand === '0-2' ? '0~2세' : '3~5세'}
          </button>
        ))}
      </div>

      <div className="grid gap-t6 md:grid-cols-[280px_1fr]">
        {/* 명부 */}
        <div>
          <div className="mb-t2 flex items-center justify-between">
            <span className="text-overline text-fg-muted">원아 {roster.length}명</span>
            <button
              onClick={() => setAdding((v) => !v)}
              className="inline-flex items-center gap-t1 rounded-pill border border-border px-t3 py-1 text-sm text-fg-2 hover:bg-surface-2"
            >
              <Icon name="plus" size={14} /> 추가
            </button>
          </div>

          {adding && (
            <div className="mb-t2 flex gap-t1">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="이름"
                className="flex-1 rounded-md border border-field-border bg-surface px-t3 py-t2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
              />
              <button
                onClick={() => {
                  if (newName.trim()) addChild(selectedClassId, newName);
                  setNewName('');
                  setAdding(false);
                }}
                className="rounded-pill bg-accent px-t3 py-t2 text-sm font-semibold text-on-accent"
              >
                등록
              </button>
            </div>
          )}

          <ul className="flex flex-col gap-t1">
            {roster.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => selectChild(c.id)}
                  className={`flex w-full items-center gap-t2 rounded-md px-t3 py-t2 text-left transition-colors duration-150 ease-soft ${
                    c.id === selectedChildId ? 'bg-surface-3' : 'hover:bg-surface-2'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${ATT_DOT[c.attendance]}`} />
                  <span className="text-sm font-medium text-fg">{c.name}</span>
                  {!c.consent && <span className="text-overline text-fg-muted">미동의</span>}
                  {c.notes && <Icon name="message" size={13} className="ml-auto text-fg-muted" />}
                </button>
              </li>
            ))}
            {roster.length === 0 && <li className="text-sm text-fg-muted">원아가 없어요.</li>}
          </ul>
        </div>

        {/* 상세 */}
        <div className="rounded-2xl border border-border bg-bg-deep/40 p-t6">
          {selected ? (
            <ChildDetail child={selected} />
          ) : (
            <p className="text-body text-fg-muted">왼쪽에서 원아를 선택하세요.</p>
          )}
        </div>
      </div>
    </div>
  );
}
