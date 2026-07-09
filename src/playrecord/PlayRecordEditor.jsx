// 놀이기록 편집기 — 템플릿 갤러리 + A4 페이지 + 자유 캔버스(DesignFrame).
// controlled: value(기록 데이터) / onChange(patch) / onExportImage(dataUrl, meta) / selected / zoom.
import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Download, ImagePlus, Bookmark, BookmarkCheck } from "lucide-react";
import { DesignFrame, DesignEl } from "./DesignFrame.jsx";
import { pickerTemplates, templateLabel, isTemplateId, defaultTemplateId, buildVariant, buildVariantPages, blankPage, makePhotoSlot, LAYOUT_VERSION, saveStoryStickers, themeKeyOf } from "./layouts";
import { resolveSticker, payloadDecoAssets, galleryCutoutsForTheme } from "./stickerAssets";
import { regenerateBySubject } from "./assetLibrary";

function TemplateThumb({ doc, width = 116 }) {
  const A4W = 794, A4H = 1123;
  const scale = width / A4W;
  return (
    <div className="prdoc-thumb" style={{ width, height: Math.round(A4H * scale), background: doc?.frame?.bg }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: A4W, height: A4H, transformOrigin: "top left", transform: `scale(${scale})` }}>
        {(doc?.elements || []).map((el) => <DesignEl key={el.id} el={el} />)}
      </div>
    </div>
  );
}

export default function PlayRecordEditor({ value, selected, zoom = 1, onChange, onExportImage }) {
  const data = value || {};
  const onUpdateData = (_id, patch) => onChange && onChange(patch);
  const item = { id: 0 }; // 보드 좌표 미사용(이미지 배치는 호스트가 onExportImage 로 결정)
  // data.variant 는 조합 id(`${theme}-${family}`). 구 값(card/story/card2/canvas1…)이면 주제에 맞는 id 로 해석.
  const rawVariant = data.variant || "card";
  const variant = isTemplateId(rawVariant)
    ? rawVariant
    : defaultTemplateId(data.payload, (rawVariant === "story" || rawVariant === "canvas1") ? "story" : "card");
  const docs = data.docs || {};
  const pages = docs[variant];
  const page = Math.min(data.page || 0, pages ? pages.length - 1 : 0);
  const themeKey = variant.split("-")[0];

  // 꾸미기 그림 추가 목록에 '보드 이미지 갤러리(IDB)의 컷아웃(투명 PNG) 중 현재 주제 매칭분'을 병합.
  // 주제가 바뀌면 다시 로드. 비동기라 레이스 방지용 취소 플래그 사용.
  const [galleryDeco, setGalleryDeco] = useState([]);
  useEffect(() => {
    let cancelled = false;
    galleryCutoutsForTheme(themeKey)
      .then((list) => { if (!cancelled) setGalleryDeco(list); })
      .catch(() => { if (!cancelled) setGalleryDeco([]); });
    return () => { cancelled = true; };
  }, [themeKey]);

  // 구 변형 키를 조합 id 로 마이그레이션(사용자가 고른 여름/캔버스 선택은 유지)
  useEffect(() => {
    if (isTemplateId(rawVariant)) return;
    const LEGACY = { card2: "summer-card", canvas1: "summer-story" };
    const next = LEGACY[rawVariant] || defaultTemplateId(data.payload, rawVariant === "story" ? "story" : "card");
    onUpdateData(item.id, { variant: next, page: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawVariant]);

  // 고정(non-destructive): 레이아웃 버전이 올라가도 기존 편집 docs 는 보존한다 — 사용자 편집(스티커 이동·텍스트 등)이
  // 버전 변경 리빌드로 사라지지 않게. 아직 없는 변형만 새로 빌드하고 docsVersion 만 최신으로 표기.
  useEffect(() => {
    if (data.docsVersion !== LAYOUT_VERSION) {
      onUpdateData(item.id,
        docs[variant]
          ? { docsVersion: LAYOUT_VERSION } // 이미 만든(편집했을 수 있는) 문서는 그대로 두고 버전만 최신화
          : { docs: { ...docs, [variant]: buildVariantPages(variant, data.payload) }, docsVersion: LAYOUT_VERSION, page: 0 }
      );
      return;
    }
    if (!docs[variant]) {
      onUpdateData(item.id, {
        docs: { ...docs, [variant]: buildVariantPages(variant, data.payload) },
        page: 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  // 주제 스티커(이모지 폴백)를 기존 에셋 재사용 또는 생성으로 이미지 교체.
  // dataRef 로 최신 docs 에 머지해 사용자 편집을 덮어쓰지 않는다. resolvingRef 로 중복 호출 방지.
  const dataRef = useRef(data);
  dataRef.current = data;
  const resolvingRef = useRef(new Set());
  useEffect(() => {
    if (!pages) return;
    const pageEls = pages[page]?.elements || [];
    const targets = pageEls.filter(
      (e) => e.stickerAsset && !e.src && !resolvingRef.current.has(e.id)
    );
    if (!targets.length) return;
    targets.forEach((e) => resolvingRef.current.add(e.id));
    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(
        targets.map(async (el) => {
          try {
            return [el.id, await resolveSticker(el.stickerAsset)];
          } catch {
            return [el.id, null];
          }
        })
      );
      if (cancelled) return;
      const map = new Map(resolved.filter(([, r]) => r && r.src));
      if (!map.size) return;
      const d = dataRef.current;
      const curPages = d.docs?.[variant];
      if (!curPages || !curPages[page]) return;
      onUpdateData(item.id, {
        docs: {
          ...d.docs,
          [variant]: curPages.map((pg, i) =>
            i === page
              ? {
                  ...pg,
                  elements: pg.elements.map((e) =>
                    map.has(e.id)
                      ? { ...e, type: "image", src: map.get(e.id).src, cutout: map.get(e.id).cutout, fit: "contain", text: undefined, style: { ...(e.style || {}), radius: 0 } }
                      : e
                  ),
                }
              : pg
          ),
        },
      });
    })();
    return () => {
      cancelled = true;
      // 취소(예: StrictMode 이중호출/재렌더) 시 잠금 해제 → 다음 실행에서 재해석 가능
      targets.forEach((e) => resolvingRef.current.delete(e.id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, page, pages]);

  const setVariant = (v) => onUpdateData(item.id, { variant: v, page: 0 });
  // 템플릿 선택 갤러리(팝오버)
  const [tmplOpen, setTmplOpen] = useState(false);
  useEffect(() => {
    if (!tmplOpen) return;
    const onDoc = (e) => {
      if (!e.target.closest(".prdoc-tmpl-pop") && !e.target.closest(".prdoc-tmpl-btn")) setTmplOpen(false);
    };
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  }, [tmplOpen]);
  const updatePage = (patch) => {
    if (!pages) return;
    const next = pages.map((p, i) => (i === page ? { ...p, ...patch } : p));
    onUpdateData(item.id, { docs: { ...docs, [variant]: next } });
  };
  // 스티커 "재생성" — 요소의 subject(있으면)/주제로 AI 새 이미지 생성 후 그 요소의 src 교체.
  // dataRef 로 최신 docs 에 머지(생성 지연 동안의 다른 편집을 덮지 않음).
  const regenerateEl = async (el) => {
    if (!el) return;
    const d = dataRef.current;
    const subject = el.subject || el.stickerAsset?.themeLabel || d?.payload?.meta?.theme || d?.title || "cute clay sticker";
    const r = await regenerateBySubject(subject).catch(() => null);
    if (!r || !r.src) return;
    const curPages = dataRef.current.docs?.[variant];
    if (!curPages || !curPages[page]) return;
    onUpdateData(item.id, {
      docs: {
        ...dataRef.current.docs,
        [variant]: curPages.map((pg, i) =>
          i === page
            ? { ...pg, elements: pg.elements.map((e) => (e.id === el.id ? { ...e, src: r.src, cutout: true } : e)) }
            : pg
        ),
      },
    });
  };
  const canvasRef = useRef(null);
  // 놀이기록 → PNG 저장(현재 페이지 캔버스). 미리보기 스케일 무시하고 A4 원본 해상도로 캡처.
  const saveImage = async () => {
    const node = canvasRef.current?.querySelector(".dframe");
    if (!node) return;
    const fr = pages?.[page]?.frame || { w: 794, h: 1123 };
    const fileName = `${(data.title || "놀이기록").replace(/[\\/:*?"<>|]/g, "_")}-${variant}-${page + 1}.png`;
    const opt = { width: fr.w, height: fr.h, pixelRatio: 2, cacheBust: false, style: { transform: "scale(1)", transformOrigin: "top left", margin: "0" } };
    let dataUrl;
    try { dataUrl = await toPng(node, { ...opt, skipFonts: false }); }
    catch (e) { dataUrl = await toPng(node, { ...opt, skipFonts: true }); }
    // 1) 파일로 다운로드
    const a = document.createElement("a");
    a.href = dataUrl; a.download = fileName; a.click();
    // 2) 보드에도 저장 — 렌더된 PNG를 카드 오른쪽에 이미지 아이템으로 추가
    onExportImage?.(dataUrl, { fileName, variant, page });
  };
  // 현재 페이지 스티커 배치를 그 주제의 스토리 디폴트로 "찜" 저장
  const [presetSaved, setPresetSaved] = useState(false);
  const saveStickerPreset = () => {
    if (!pages) return;
    const els = pages[page]?.elements || [];
    const stickers = els
      .filter((e) => e.type === "image" && (e.sticker || /generated-assets|\/deco\//.test(e.src || "")))
      .map((e) => ({
        src: (e.src || "").replace(/^https?:\/\/[^/]+/, ""),
        x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w), h: Math.round(e.h),
        rot: Math.round(e.rotation || 0), flip: !!e.flipH,
      }));
    if (!stickers.length) return;
    saveStoryStickers(themeKeyOf(data.payload), stickers);
    setPresetSaved(true);
    setTimeout(() => setPresetSaved(false), 1600);
  };
  const addPage = () => {
    const next = [...(pages || []), blankPage(data.payload)];
    onUpdateData(item.id, { docs: { ...docs, [variant]: next }, page: next.length - 1 });
  };
  const addPhotoSlot = () => {
    if (!pages) return;
    const slot = makePhotoSlot();
    const next = pages.map((p, i) => (i === page ? { ...p, elements: [...p.elements, slot] } : p));
    onUpdateData(item.id, { docs: { ...docs, [variant]: next } });
  };
  const removePage = () => {
    if (!pages || pages.length <= 1) return;
    onUpdateData(item.id, {
      docs: { ...docs, [variant]: pages.filter((_, i) => i !== page) },
      page: Math.max(0, page - 1),
    });
  };
  const goPage = (delta) =>
    pages && onUpdateData(item.id, { page: Math.max(0, Math.min(pages.length - 1, page + delta)) });

  const stop = (e) => e.stopPropagation();
  const activeDoc = pages && pages[page];

  return (
    <div className="prdoc">
      {selected && (
        <div className="prdoc-bar" onPointerDown={stop} onMouseDown={stop} onDoubleClick={stop}>
          <div className="prdoc-tabs" style={{ position: "relative" }}>
            {/* 템플릿 선택 — 미리보기 썸네일 갤러리(팝오버) */}
            <button className="prdoc-tmpl-btn" onClick={() => setTmplOpen((o) => !o)} title="템플릿 선택">
              <span>{templateLabel(variant)}</span>
              <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
            </button>
            {tmplOpen && (
              <div className="prdoc-tmpl-pop" onPointerDown={stop} onMouseDown={stop}>
                {pickerTemplates(data.payload).map((t) => (
                  <button
                    key={t.id}
                    className={"prdoc-tmpl-item" + (t.id === variant ? " on" : "")}
                    onClick={() => { setVariant(t.id); setTmplOpen(false); }}
                  >
                    <TemplateThumb doc={buildVariant(t.id, data.payload)} width={116} />
                    <span className="prdoc-tmpl-label">{t.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="prdoc-pages">
            <button onClick={saveImage} title="이미지로 저장 (PNG)" style={{ width: "auto", padding: "0 9px", display: "inline-flex", alignItems: "center" }}><Download size={15} /></button>
            {variant === "story" && (
              <button onClick={saveStickerPreset} title={presetSaved ? "스티커 배치 저장됨 ✓" : "현재 스티커 배치를 이 주제의 기본값으로 찜(저장)"} style={{ width: "auto", padding: "0 9px", display: "inline-flex", alignItems: "center", color: presetSaved ? "#3fae6a" : undefined }}>
                {presetSaved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
              </button>
            )}
            <button onClick={addPhotoSlot} title="사진 자리 추가" style={{ width: "auto", padding: "0 9px", display: "inline-flex", alignItems: "center" }}><ImagePlus size={16} /></button>
            <span className="prdoc-bar-div" />
            <button onClick={() => goPage(-1)} disabled={page <= 0} title="이전 페이지">‹</button>
            <span className="prdoc-pageno">{page + 1} / {pages ? pages.length : 1}</span>
            <button onClick={() => goPage(1)} disabled={!pages || page >= pages.length - 1} title="다음 페이지">›</button>
            <button onClick={addPage} title="페이지 추가">＋</button>
            {pages && pages.length > 1 && (
              <button onClick={removePage} title="이 페이지 삭제">🗑</button>
            )}
          </div>
        </div>
      )}
      <div className="prdoc-canvas" ref={canvasRef}>
        {activeDoc ? (
          <DesignFrame key={`${variant}-${page}`} data={activeDoc} selected={selected} zoom={zoom} onChange={updatePage} photos={data.payload?.photos} decoAssets={payloadDecoAssets(data.payload, themeKey, galleryDeco)} onRegenerate={regenerateEl} />
        ) : (
          <div className="prdoc-loading">불러오는 중…</div>
        )}
      </div>
    </div>
  );
}
