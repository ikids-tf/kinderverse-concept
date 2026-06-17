/* 이미지 파일 → 보드 업로드 공용 로직. 외부 드래그&드롭(BoardCanvas)과 상단 업로드
   버튼(BoardSwitcher)이 함께 쓴다. 먼저 objectURL로 즉시 카드를 띄우고, 백그라운드에서
   (1) 영구 보존용 data URL로 교체 (2) 갤러리(보관함)에 저장한다. 표시용 썸네일은
   NodeView의 ensureThumb가 자동 생성한다(= 풀사이즈 src + 썸네일 둘로 처리). */
import { useBoardStore, newId } from '@/store/boardStore';
import { saveAsset } from './assets';
import { showToast } from '@/lib/toast';

/** 업로드 카드의 표시 크기 상한(월드 px) — 긴 변 기준 비율 유지. */
const MAX_DISP = 320;

function fitDims(w: number, h: number, max: number): { w: number; h: number } {
  if (!w || !h) return { w: max, h: max };
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(40, Math.round(w * s)), h: Math.max(40, Math.round(h * s)) };
}

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

/** 현재 보이는 캔버스 중앙의 월드 좌표(버튼 업로드 시 배치 기준점). */
export function viewportCenterWorld(): { x: number; y: number } {
  const canvas = typeof document !== 'undefined' ? (document.querySelector('[data-kv-canvas]') as HTMLElement | null) : null;
  const cr = canvas?.getBoundingClientRect();
  const w = cr?.width ?? window.innerWidth;
  const h = cr?.height ?? window.innerHeight;
  const { zoom, panX, panY } = useBoardStore.getState().viewport;
  return { x: (w / 2 - panX) / zoom, y: (h / 2 - panY) / zoom };
}

/** 이미지 파일 한 장을 월드 좌표 (wx,wy) 중심에 카드로 추가(즉시) + 백그라운드 영구화·저장. */
export async function addImageFileAtWorld(file: File, wx: number, wy: number): Promise<void> {
  if (!file.type.startsWith('image/')) return;
  const objUrl = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await loadImageEl(objUrl);
  } catch {
    URL.revokeObjectURL(objUrl);
    showToast('이미지를 읽지 못했어요', 'error');
    return;
  }
  const dims = fitDims(img.naturalWidth || img.width, img.naturalHeight || img.height, MAX_DISP);
  const id = newId('image');
  const name = (file.name || '').replace(/\.[^.]+$/, '') || '업로드 이미지';
  const b = useBoardStore.getState();
  b.addNodeRaw({
    id,
    type: 'image',
    x: Math.round(wx - dims.w / 2),
    y: Math.round(wy - dims.h / 2),
    w: dims.w,
    h: dims.h,
    src: objUrl, // 즉시 표시(임시) — 아래에서 data URL로 교체
    data: { label: name },
  });
  b.setSelection([id]);
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result);
    const cur = useBoardStore.getState().nodes[id];
    if (cur) useBoardStore.getState().updateNodeRaw(id, { src: dataUrl });
    URL.revokeObjectURL(objUrl);
    void saveAsset(name, 'image', dataUrl, name);
  };
  reader.onerror = () => URL.revokeObjectURL(objUrl);
  reader.readAsDataURL(file);
}

/** 여러 이미지 파일을 (wx,wy) 기준에 살짝 어긋나게 배치(겹침 방지). 비이미지는 무시. */
export async function addImageFilesToBoard(files: File[], wx: number, wy: number): Promise<void> {
  const imgs = files.filter((f) => f.type.startsWith('image/'));
  imgs.forEach((f, i) => void addImageFileAtWorld(f, wx + i * 40, wy + i * 40));
}
