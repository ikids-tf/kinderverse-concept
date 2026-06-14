/* 슬라이드 차트 렌더 — ChartBlock(JSON)을 recharts(React-SVG)로 그린다.
   불변식 유지: 글자는 엔진이 렌더(차트 라벨·축도 SVG 텍스트), 외부 SaaS·이미지 차트 API 금지
   (데이터는 브라우저 안에서만). 색은 테마 토큰(--s-*) — SVG 속성은 var()를 못 쓰므로
   getComputedStyle로 '한 번' 읽어 테마별 캐시(단일 출처 = themes.css).

   디자인(전문 레시피): 둥근 막대 · 직접 값 라벨 · 격자/축 군더더기 제거 · 부드러운 영역 채움 ·
   악센트 한 색 + 보조색. 유아교사가 '예쁘고 읽기 쉽게' 쓰도록 한 슬라이드 한 차트. */

import { Component, useLayoutEffect, useRef, useState, type ComponentProps, type FC, type ReactNode } from 'react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  LabelList,
  Legend,
} from 'recharts';
import type { ChartBlock, Theme } from '../schema/deckspec';

/* ── 테마 팔레트 — themes.css의 --s-* 를 JS 색으로(SVG 속성은 var() 불가) ── */
interface Palette {
  accent: string;
  accent2: string;
  fg: string;
  fg2: string;
  muted: string;
  border: string;
  canvas: string;
}
const FALLBACK: Palette = {
  accent: '#f2733e',
  accent2: '#e0a62c',
  fg: '#141311',
  fg2: '#56524b',
  muted: '#8c887f',
  border: '#e7e0d4',
  canvas: '#f8f7f2',
};
// 테마는 data-theme에만 의존하므로 테마별로 1회만 읽어 캐시(썸네일 다수에도 가벼움).
const cache: Record<string, Palette> = {};
function readPalette(theme: string, el: HTMLElement | null): Palette {
  if (cache[theme]) return cache[theme];
  if (!el) return FALLBACK;
  const cs = getComputedStyle(el);
  const g = (name: string, fb: string): string => cs.getPropertyValue(name).trim() || fb;
  const p: Palette = {
    accent: g('--s-accent', FALLBACK.accent),
    accent2: g('--s-accent-2', FALLBACK.accent2),
    fg: g('--s-fg', FALLBACK.fg),
    fg2: g('--s-fg-2', FALLBACK.fg2),
    muted: g('--s-fg-muted', FALLBACK.muted),
    border: g('--s-border', FALLBACK.border),
    canvas: g('--s-canvas', FALLBACK.canvas),
  };
  cache[theme] = p;
  return p;
}
function useThemePalette(theme: Theme, ref: React.RefObject<HTMLDivElement>): Palette {
  const [pal, setPal] = useState<Palette>(() => cache[theme] ?? FALLBACK);
  useLayoutEffect(() => {
    setPal(readPalette(theme, ref.current));
  }, [theme, ref]);
  return pal;
}

/* ── 색 보간(파이 4번째+ 슬라이스를 악센트 틴트로) ── */
function parseHex(h: string): [number, number, number] | null {
  let s = h.trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  if (s.length !== 6) return null;
  const n = Number.parseInt(s, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const ch = (i: number) => Math.round(ca[i] + (cb[i] - ca[i]) * t).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

/* ── 데이터 정규화 — label(문자 1개) + 숫자 계열들을 자동 탐지(키 이름에 관대). ── */
const isNumeric = (v: unknown): boolean =>
  typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v));

interface Norm {
  rows: Record<string, number | string>[];
  labelKey: string;
  series: string[];
}
function normalize(data: unknown): Norm {
  const raw = Array.isArray(data) ? (data.filter((r) => r && typeof r === 'object') as Record<string, unknown>[]) : [];
  if (!raw.length) return { rows: [], labelKey: 'label', series: [] };
  const keys: string[] = [];
  for (const r of raw) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  // 숫자 계열: 존재하는 값이 모두 숫자(또는 숫자문자)인 키.
  const numericKeys = keys.filter((k) => {
    const vals = raw.map((r) => r[k]).filter((v) => v != null);
    return vals.length > 0 && vals.every(isNumeric);
  });
  let labelKey = keys.find((k) => !numericKeys.includes(k));
  const synth = !labelKey;
  if (!labelKey) labelKey = '__idx';
  const series = numericKeys.slice(0, 4); // 최대 4계열
  const rows = raw.map((r, i) => {
    const o: Record<string, number | string> = {};
    o[labelKey as string] = synth ? String(i + 1) : String(r[labelKey as string] ?? `${i + 1}`);
    for (const k of series) o[k] = Number(r[k] ?? 0);
    return o;
  });
  return { rows, labelKey: labelKey as string, series };
}

/* 값 라벨 포맷 — 정수는 천단위, 소수는 1자리(부동소수 잔재 방지). */
const fmt = (v: unknown): string => {
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
  const n = Number(v);
  return Number.isFinite(n) ? (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1)) : String(v ?? '');
};

const CART_MARGIN = { top: 36, right: 30, left: 8, bottom: 6 };
const AXIS_FONT = 20;
const LABEL_FONT = 21;
const RAD = Math.PI / 180;

/** Pie label 콜백 타입(recharts) — 좁은 파라미터 타입을 안전하게 넘기기 위한 별칭. */
type PieLabelProp = ComponentProps<typeof Pie>['label'];

/** 컨테이너 실측 크기(ResizeObserver). clientWidth/Height는 ancestor transform(scale)에
    영향받지 않는 '레이아웃' 크기라 차트 좌표계로 적절(썸네일은 그 위 transform이 축소).
    숨겨졌을 땐 0 → 차트를 마운트하지 않아 recharts의 0×0 경고를 피한다(ResponsiveContainer 대체). */
function useSize(ref: React.RefObject<HTMLDivElement>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** 차트 전용 에러 경계 — 비정상 데이터로 recharts가 throw해도 덱 전체가 블랭크되지 않게
    자리표시로 격리한다(키가 바뀌면 리마운트되어 자동 복구). */
class ChartBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="sl-ph">
          <span className="ph-ic" aria-hidden>📊</span>
          <span className="ph-label">차트를 표시할 수 없어요</span>
        </div>
      );
    }
    return this.props.children;
  }
}

export const SlideChart: FC<{ block: ChartBlock; theme: Theme; dataBi?: number }> = ({ block, theme, dataBi }) => {
  const ref = useRef<HTMLDivElement>(null);
  const pal = useThemePalette(theme, ref);
  const size = useSize(ref);
  const { rows, labelKey, series } = normalize(block.data);
  const valid = rows.length > 0 && series.length > 0;
  const multi = series.length > 1;
  const seriesColor = (i: number): string => [pal.accent, pal.accent2, pal.fg2, pal.muted][i % 4];

  const xAxis = (
    <XAxis
      dataKey={labelKey}
      axisLine={{ stroke: pal.border }}
      tickLine={false}
      tick={{ fontSize: AXIS_FONT, fill: pal.fg2 }}
      tickMargin={10}
      padding={{ left: 16, right: 16 }}
      interval={0}
    />
  );
  const legend = multi ? (
    <Legend verticalAlign="top" align="right" iconType="circle" iconSize={11} wrapperStyle={{ fontSize: 18, color: pal.fg2, paddingBottom: 8 }} />
  ) : null;
  // 라벨/점이 잘리지 않도록 위쪽 18% 헤드룸.
  const yHeadroom = <YAxis hide domain={[0, (max: number) => Math.ceil(max * 1.18) || 1]} />;

  let chart: ReactNode = null;
  if (block.chartType === 'bar') {
    chart = (
      <BarChart data={rows} width={size.w} height={size.h} margin={CART_MARGIN} barCategoryGap="18%">
        {legend}
        {xAxis}
        {yHeadroom}
        {series.map((k, i) => (
          <Bar key={k} dataKey={k} fill={seriesColor(i)} radius={[10, 10, 0, 0]} maxBarSize={110} isAnimationActive={false}>
            {!multi && <LabelList dataKey={k} position="top" offset={10} fill={pal.fg} fontSize={LABEL_FONT} fontWeight={600} formatter={fmt} />}
          </Bar>
        ))}
      </BarChart>
    );
  } else if (block.chartType === 'line') {
    chart = (
      <AreaChart data={rows} width={size.w} height={size.h} margin={CART_MARGIN}>
        {legend}
        {xAxis}
        {yHeadroom}
        {series.map((k, i) => {
          const c = seriesColor(i);
          return (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stroke={c}
              strokeWidth={3}
              fill={c}
              fillOpacity={multi ? 0 : 0.16}
              dot={{ r: 5, fill: c, stroke: pal.canvas, strokeWidth: 2 }}
              activeDot={false}
              isAnimationActive={false}
            >
              {!multi && <LabelList dataKey={k} position="top" offset={12} fill={pal.fg} fontSize={LABEL_FONT} fontWeight={600} formatter={fmt} />}
            </Area>
          );
        })}
      </AreaChart>
    );
  } else if (block.chartType === 'pie') {
    const valueKey = series[0];
    const base = [pal.accent, pal.accent2, pal.fg2];
    const cellColor = (i: number): string => (i < base.length ? base[i] : mix(base[i % base.length], pal.canvas, 0.4));
    const total = rows.reduce((s, r) => s + Number(r[valueKey] ?? 0), 0) || 1;
    const renderLabel = (a: { cx: number; cy: number; midAngle: number; outerRadius: number; index: number }): ReactNode => {
      const pct = Number(rows[a.index]?.[valueKey] ?? 0) / total;
      if (pct < 0.06) return null;
      const r = a.outerRadius + 24;
      const x = a.cx + r * Math.cos(-a.midAngle * RAD);
      const y = a.cy + r * Math.sin(-a.midAngle * RAD);
      return (
        <text x={x} y={y} textAnchor={x >= a.cx ? 'start' : 'end'} dominantBaseline="central" fontSize={18} fill={pal.fg2}>
          {`${rows[a.index]?.[labelKey] ?? ''} ${Math.round(pct * 100)}%`}
        </text>
      );
    };
    chart = (
      <PieChart width={size.w} height={size.h} margin={{ top: 24, right: 96, left: 96, bottom: 24 }}>
        <Pie
          data={rows}
          dataKey={valueKey}
          nameKey={labelKey}
          cx="50%"
          cy="50%"
          innerRadius="46%"
          outerRadius="72%"
          paddingAngle={2}
          cornerRadius={6}
          stroke={pal.canvas}
          strokeWidth={2}
          isAnimationActive={false}
          labelLine={false}
          label={renderLabel as unknown as PieLabelProp}
        >
          {rows.map((_, i) => (
            <Cell key={i} fill={cellColor(i)} />
          ))}
        </Pie>
      </PieChart>
    );
  } else {
    // radar
    chart = (
      <RadarChart data={rows} width={size.w} height={size.h} margin={{ top: 16, right: 28, left: 28, bottom: 12 }} outerRadius="78%">
        {legend}
        <PolarGrid stroke={pal.border} />
        <PolarAngleAxis dataKey={labelKey} tick={{ fontSize: 18, fill: pal.fg2 }} />
        <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 'auto']} />
        {series.map((k, i) => {
          const c = seriesColor(i);
          return <Radar key={k} dataKey={k} stroke={c} strokeWidth={2} fill={c} fillOpacity={0.22} dot={{ r: 3, fill: c }} isAnimationActive={false} />;
        })}
      </RadarChart>
    );
  }

  // 크기 0(숨김/마운트 직후)에는 차트를 그리지 않는다 — recharts 0×0 경고 방지.
  const ready = valid && size.w > 0 && size.h > 0;
  // 차트 내용이 바뀌면 경계를 리마운트(실패 상태 자동 복구).
  const chartKey = `${block.chartType}:${rows.length}:${series.join('|')}`;
  return (
    <div className="sl-chart" ref={ref} data-bi={dataBi}>
      {!valid ? (
        <div className="sl-ph">
          <span className="ph-ic" aria-hidden>📊</span>
          <span className="ph-label">데이터를 입력하면 차트가 나타나요</span>
        </div>
      ) : ready ? (
        <ChartBoundary key={chartKey}>{chart}</ChartBoundary>
      ) : null}
    </div>
  );
};
