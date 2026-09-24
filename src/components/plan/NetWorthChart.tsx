import { useMemo, useState } from 'react';
import { formatCompact, formatMoney } from '../../lib/money';
import { cx } from '../ui';
import type { Snapshot } from './useMoneyPlan';

const label = (m: string) => new Date(`${m}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

/** Net worth month by month. Below-zero stretch is shaded red so the climb
 *  out of the negative is visible at a glance. */
export function NetWorthChart({ history, currency, height = 200 }: { history: Snapshot[]; currency: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = history.map((h) => Number(h.net_worth));

  const g = useMemo(() => {
    const W = 600, H = 200;
    const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts);
    const pad = (hi - lo || 1) * 0.1;
    const min = lo - pad, max = hi + pad;
    const X = (i: number) => (pts.length > 1 ? (i / (pts.length - 1)) * W : W / 2);
    const Y = (v: number) => H - ((v - min) / (max - min || 1)) * H;
    const line = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
    const zero = Y(0);
    const area = pts.length ? `${line} L${X(pts.length - 1).toFixed(1)} ${zero} L${X(0).toFixed(1)} ${zero} Z` : '';
    return { W, H, line, area, zeroPct: (zero / H) * 100, dots: pts.map((v, i) => ({ x: (X(i) / W) * 100, y: (Y(v) / H) * 100, v })) };
  }, [pts.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (history.length === 0) {
    return <p className="text-sm text-slate-400 py-6">Your net worth is recorded once a month from now on — the chart fills in as months pass.</p>;
  }

  const i = hover ?? pts.length - 1;
  const first = pts[0], lastV = pts[pts.length - 1];
  const change = lastV - first;

  return (
    <div>
      <div className="flex items-end gap-6 mb-3">
        <div>
          <div className="text-xs text-slate-400">{label(history[i].month)}</div>
          <div className={cx('text-[26px] font-extrabold tracking-[-0.02em] tabular-nums leading-tight', pts[i] < 0 ? 'text-red-400' : 'text-slate-100')}>
            {formatMoney(pts[i], currency)}
          </div>
        </div>
        {pts.length > 1 && (
          <div className="pb-1">
            <div className="text-xs text-slate-400">Since {label(history[0].month)}</div>
            <div className={cx('text-sm font-bold tabular-nums', change < 0 ? 'text-red-400' : 'text-slate-100')}>
              {change >= 0 ? '▲' : '▼'} {formatMoney(Math.abs(change), currency)}
            </div>
          </div>
        )}
      </div>
      <div className="relative rule-b" style={{ height }} onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-x-0 border-t border-dashed border-line-strong" style={{ top: `${g.zeroPct}%` }}>
          <span className="absolute right-0 -top-4 text-[11px] text-slate-400 tabular-nums">{formatCompact(0, currency)}</span>
        </div>
        <svg viewBox={`0 0 ${g.W} ${g.H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
          <defs>
            <clipPath id="nw-below"><rect x="0" y={(g.zeroPct / 100) * g.H} width={g.W} height={g.H} /></clipPath>
            <clipPath id="nw-above"><rect x="0" y="0" width={g.W} height={(g.zeroPct / 100) * g.H} /></clipPath>
          </defs>
          {g.area && <path d={g.area} fill="rgb(var(--blue-100))" clipPath="url(#nw-above)" />}
          {g.area && <path d={g.area} fill="rgb(var(--red-900))" clipPath="url(#nw-below)" />}
          <path d={g.line} fill="none" stroke="rgb(var(--slate-100))" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        </svg>
        {g.dots.map((d, k) => (
          <div key={k}
            className={cx('absolute -ml-[4px] -mt-[4px] w-2 h-2', k === i ? (d.v < 0 ? 'bg-red-500' : 'bg-blue-500') : 'bg-slate-100')}
            style={{ left: `${d.x}%`, top: `${d.y}%` }} />
        ))}
        {/* hover columns */}
        <div className="absolute inset-0 flex">
          {pts.map((_, k) => <div key={k} className="flex-1 h-full" onMouseEnter={() => setHover(k)} onClick={() => setHover(k)} />)}
        </div>
      </div>
      <div className="flex justify-between pt-1.5">
        {history.filter((_, k) => history.length <= 8 || k % Math.ceil(history.length / 8) === 0 || k === history.length - 1)
          .map((h) => <span key={h.month} className="text-[11px] text-slate-400">{label(h.month)}</span>)}
      </div>
    </div>
  );
}

/** Tiny trend line for the Home card. */
export function NetWorthSpark({ history }: { history: Snapshot[] }) {
  if (history.length < 2) return null;
  const pts = history.map((h) => Number(h.net_worth));
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const W = 120, H = 28;
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * W).toFixed(1)} ${(H - ((v - lo) / (hi - lo || 1)) * H).toFixed(1)}`).join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="overflow-visible" aria-label="Net worth trend">
      <path d={d} fill="none" stroke={up ? 'rgb(var(--blue-500))' : 'rgb(var(--red-500))'} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
