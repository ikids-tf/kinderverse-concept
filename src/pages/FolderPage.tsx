import { useEffect, useRef, useState } from 'react';
import { Upload, FolderPlus, X, Trash2, Folder, Check, Images, Film, Music, FileText } from 'lucide-react';
import { PageHero } from '@/components/PageHero';

/* ---------------- Folder Vault (자료보관함) ----------------
   File/material storage: upload files, create & remove folders, and
   multi-select files for bulk delete. Local state only (prototype).
   Ported 1:1 from the kinderVerse-2027 reference (inline-style + lucide). */

/* Milray Park light palette — hex values mirror src/styles/tokens.css 1:1. */
const C = {
  ink: '#141311',
  muted: '#8C887F',
  line: '#E7E0D4',
  coral: '#F2733E',
  fill2: 'rgba(40,33,24,.06)',
  shadow1: '0 8px 24px rgba(40,33,24,.06)',
};

const pageBody: React.CSSProperties = { padding: '0 28px 130px' };

type FileType = 'image' | 'video' | 'audio' | 'doc';
type FolderItem = { id: number; name: string; count: number };
type FileItem = { id: number; name: string; type: FileType; size: string };

export function FolderPage() {
  const a = C.coral;
  const seq = useRef(100);
  const fileInput = useRef<HTMLInputElement>(null);
  const [folders, setFolders] = useState<FolderItem[]>([
    { id: 1, name: '가을 활동', count: 12 },
    { id: 2, name: '놀이 사진', count: 38 },
    { id: 3, name: '도안 · 학습지', count: 24 },
    { id: 4, name: '음원 · 동요', count: 9 },
  ]);
  const [files, setFiles] = useState<FileItem[]>([
    { id: 11, name: '단풍놀이.jpg', type: 'image', size: '2.4 MB' },
    { id: 12, name: '가정통신문_10월.pdf', type: 'doc', size: '180 KB' },
    { id: 13, name: '가을바람 동요.mp3', type: 'audio', size: '3.1 MB' },
    { id: 14, name: '관찰일지.docx', type: 'doc', size: '92 KB' },
    { id: 15, name: '블록놀이.png', type: 'image', size: '1.8 MB' },
    { id: 16, name: '체조영상.mp4', type: 'video', size: '24 MB' },
    { id: 17, name: '색칠도안.pdf', type: 'doc', size: '320 KB' },
    { id: 18, name: '현장학습.jpg', type: 'image', size: '3.6 MB' },
  ]);
  const [sel, setSel] = useState<Set<number>>(() => new Set());

  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSel = () => setSel(new Set());
  const selectAll = () => setSel((s) => (s.size === files.length ? new Set() : new Set(files.map((f) => f.id))));
  const removeSelected = () => { setFiles((fs) => fs.filter((f) => !sel.has(f.id))); clearSel(); };
  const addFolder = () => setFolders((fs) => [...fs, { id: ++seq.current, name: '새 폴더', count: 0 }]);
  const removeFolder = (id: number) => setFolders((fs) => fs.filter((f) => f.id !== id));
  // prompt bar drives the vault: typing a prompt creates a folder with that name
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.tab === 'folder') setFolders((fs) => [...fs, { id: ++seq.current, name: String(d.text).slice(0, 24), count: 0 }]); };
    window.addEventListener('kv:prompt', h);
    return () => window.removeEventListener('kv:prompt', h);
  }, []);
  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files || [])];
    if (list.length) {
      const typeOf = (n: string): FileType => (/\.(png|jpe?g|gif|webp)$/i.test(n) ? 'image' : /\.(mp4|mov|webm)$/i.test(n) ? 'video' : /\.(mp3|wav|m4a)$/i.test(n) ? 'audio' : 'doc');
      setFiles((fs) => [...list.map((f) => ({ id: ++seq.current, name: f.name, type: typeOf(f.name), size: (f.size / 1048576).toFixed(1) + ' MB' })), ...fs]);
    }
    e.target.value = '';
  };

  const TypeIcon = ({ type }: { type: FileType }) => {
    const I = type === 'image' ? Images : type === 'video' ? Film : type === 'audio' ? Music : FileText;
    return <I size={26} color={a} opacity={0.75} />;
  };

  const head: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: C.ink, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
  const pill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 };
  const tanBtn: React.CSSProperties = { ...pill, border: `1px solid ${C.line}`, background: '#F4EDE3', color: C.ink };
  const ghostBtn: React.CSSProperties = { ...pill, border: 'none', background: 'transparent', color: C.muted };

  return (
    <div style={{ paddingBottom: 4 }}>
      <PageHero
        eyebrow="자료 보관함"
        title="자료보관함"
        description={`${folders.length}개 폴더 · ${files.length}개 파일 — 업로드하고 분류해 수업에 바로 활용하세요.`}
      />
      <div style={pageBody}>
      {/* action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
        <button style={{ ...pill, border: 'none', background: a, color: '#fff' }} onClick={() => fileInput.current?.click()}><Upload size={15} color="#fff" /> 업로드</button>
        <button style={tanBtn} onClick={addFolder}><FolderPlus size={16} color={a} /> 새 폴더</button>
        <input ref={fileInput} type="file" multiple style={{ display: 'none' }} onChange={onUpload} />
        <div style={{ flex: 1 }} />
        {sel.size > 0 && (
          <>
            <span style={{ fontSize: 13, fontWeight: 600, color: a }}>{sel.size}개 선택</span>
            <button style={ghostBtn} onClick={selectAll}>{sel.size === files.length ? '전체 해제' : '전체 선택'}</button>
            <button style={{ ...pill, border: 'none', background: '#C8472E', color: '#fff' }} onClick={removeSelected}><Trash2 size={15} color="#fff" /> 삭제</button>
            <button style={ghostBtn} onClick={clearSel}><X size={15} color={C.muted} /></button>
          </>
        )}
      </div>

      {/* folders */}
      <div style={head}><span>폴더</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 30 }}>
        {folders.map((f) => (
          <div key={f.id} className="kv-doc" style={{ position: 'relative', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, cursor: 'pointer', boxShadow: C.shadow1, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: `${a}14`, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Folder size={20} color={a} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{f.count}개 항목</div>
            </div>
            <button title="폴더 삭제" onClick={(e) => { e.stopPropagation(); removeFolder(f.id); }}
              style={{ width: 28, height: 28, borderRadius: 999, border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <X size={15} color={C.muted} />
            </button>
          </div>
        ))}
        <button onClick={addFolder} style={{ border: `1.5px dashed ${C.line}`, borderRadius: 14, padding: 14, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.muted, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, minHeight: 68 }}>
          <FolderPlus size={18} color={a} /> 새 폴더
        </button>
      </div>

      {/* files */}
      <div style={head}><span>파일</span><span style={{ fontSize: 12.5, color: C.muted, fontWeight: 400, fontFamily: 'var(--font-sans)' }}>{files.length}개</span></div>
      {files.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>파일이 없습니다. 상단의 업로드로 자료를 추가하세요.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
          {files.map((f) => {
            const on = sel.has(f.id);
            return (
              <div key={f.id} onClick={() => toggle(f.id)} style={{ position: 'relative', background: '#fff', border: `1.5px solid ${on ? a : C.line}`, borderRadius: 14, padding: 12, cursor: 'pointer', boxShadow: on ? `0 0 0 3px ${a}22, ${C.shadow1}` : C.shadow1, transition: 'border-color .15s, box-shadow .15s' }}>
                <span style={{ position: 'absolute', top: 10, left: 10, zIndex: 1, width: 18, height: 18, borderRadius: 6, border: `1.5px solid ${on ? a : C.line}`, background: on ? a : 'rgba(255,255,255,.9)', display: 'grid', placeItems: 'center' }}>
                  {on && <Check size={12} color="#fff" strokeWidth={3} />}
                </span>
                <div style={{ height: 84, borderRadius: 10, background: `${a}10`, display: 'grid', placeItems: 'center', marginBottom: 10 }}><TypeIcon type={f.type} /></div>
                <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                <div style={{ color: C.muted, fontSize: 11.5, marginTop: 3 }}>{f.size}</div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
