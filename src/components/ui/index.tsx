/* ============================================================================
 * UI KIT — "Keel" / Modernist primitives. Import from '../components/ui'.
 *
 * Rules of the system (see /Personal Finance App Redesign/_ds/.../readme.md):
 *  - Zero corner radius. Flat. Nothing floats except popovers/dialogs.
 *  - Strong 2px rules (.rule-t / .rule-b) organise sections; 1px .row-rule
 *    separates rows. No cards-with-borders.
 *  - Everything flush-left, labels inside wide buttons too.
 *  - Accent (bg-blue-600 = calm blue) only for the primary action & small emphasis.
 *  - Motion is quick and calm (see the Motion block in index.css).
 *  - Money uses .tabular-nums (the header eye toggle masks it globally).
 * ========================================================================= */
import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Check, ChevronRight, X } from 'lucide-react';
import { titleFor } from '../../lib/nav';

/* ---- classNames helper ---- */
export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/* ---- Shared field styles (use on raw inputs/selects too) ---- */
export const fieldCls =
  'w-full min-h-[36px] px-2.5 py-1.5 bg-app border border-line-strong text-slate-100 text-sm placeholder-slate-500 ' +
  'hover:border-slate-400 focus:outline-none focus:border-blue-500 focus-visible:outline-none transition-colors ' +
  'disabled:opacity-45 disabled:cursor-not-allowed';
export const labelCls = 'block text-xs text-slate-300/80 mb-[5px]';

/* ---- Button ---- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ink';
type ButtonSize = 'sm' | 'md' | 'lg';

const btnBase =
  'inline-flex items-center justify-center gap-1.5 font-extrabold leading-tight transition-colors duration-150 ' +
  'disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap select-none';

const btnVariants: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-400 text-app border border-transparent',
  secondary: 'bg-transparent text-slate-100 border border-line-strong hover:bg-slate-100/[0.07] active:bg-slate-100/[0.14]',
  ghost: 'bg-transparent text-blue-400 border border-transparent hover:bg-blue-500/10 active:bg-blue-500/20 !px-1',
  danger: 'bg-transparent text-red-400 border border-line-strong hover:bg-red-500/10',
  ink: 'bg-slate-100 text-app border border-transparent hover:bg-slate-300',
};

const btnSizes: Record<ButtonSize, string> = {
  sm: 'text-[13px] h-8 px-3',
  md: 'text-sm h-9 px-[14px]',
  lg: 'text-[15px] h-11 px-4',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full-width with the label flush left (Modernist wide button). */
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', block, className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cx(btnBase, btnVariants[variant], btnSizes[size], block && 'w-full !justify-start text-left', className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

/** Square icon button (36×36). */
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { bordered?: boolean }>(
  ({ className, bordered = true, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-grid place-items-center w-9 h-9 shrink-0 text-slate-100 transition-colors hover:bg-slate-100/[0.07] active:bg-slate-100/[0.14] disabled:opacity-45',
        bordered ? 'border border-line-strong' : 'border border-transparent',
        className,
      )}
      {...props}
    />
  ),
);
IconButton.displayName = 'IconButton';

/* ---- Card — surface-filled block (no border, no radius) ---- */
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('bg-card', className)} {...rest}>
      {children}
    </div>
  );
}

/* ---- PageHeader — eyebrow line + 32px title, actions bottom-aligned right ----
 * `title` defaults to the route's title, so pages only pass what's special. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const { pathname } = useLocation();
  const t = title ?? titleFor(pathname);
  return (
    <div className={cx('flex flex-col gap-3 sm:flex-row sm:items-end', className)}>
      <div className="flex-1 min-w-0">
        {description && <div className="text-[13px] text-slate-400 mb-1">{description}</div>}
        <h1 className="text-[28px] md:text-[32px] font-extrabold tracking-[-0.02em] text-slate-100 leading-[1.12]">{t}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/* ---- Section title (h2 17px) with an optional ghost link on the right ---- */
export function SectionTitle({
  children,
  action,
  onAction,
  meta,
  className,
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3 mb-2', className)}>
      <div className="flex items-baseline gap-3 min-w-0">
        <h2 className="text-[17px] font-extrabold text-slate-100">{children}</h2>
        {meta && <span className="text-xs text-slate-400 truncate">{meta}</span>}
      </div>
      {action && (
        <Button variant="ghost" size="sm" onClick={onAction} className="shrink-0">
          {action}
          <ChevronRight size={14} />
        </Button>
      )}
    </div>
  );
}

/* ---- KPI strip ---- */
export function KpiStrip({ children, cols = 4, className }: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  const grid = { 2: 'grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4' }[cols];
  return <div className={cx('kpi-strip', grid, className)}>{children}</div>;
}

export function Kpi({
  label,
  value,
  sub,
  note,
  noteTone = 'muted',
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  note?: ReactNode;
  noteTone?: 'muted' | 'accent';
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="t-kicker mb-1.5">{label}</div>
      <div className="text-[22px] md:text-[26px] font-extrabold tracking-[-0.02em] leading-[1.1] tabular-nums text-slate-100 truncate">{value}</div>
      {sub && <div className="text-[15px] md:text-base font-semibold tabular-nums text-slate-300">{sub}</div>}
      {note && <div className={cx('text-xs mt-1.5', noteTone === 'accent' ? 'text-red-400' : 'text-slate-400')}>{note}</div>}
    </div>
  );
}

/* ---- SegmentedControl — bordered, active option is solid ink ---- */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  stretch,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  /** Fill the width with equal segments (phone). */
  stretch?: boolean;
}) {
  return (
    <div className={cx(stretch ? 'grid' : 'inline-flex', 'border border-line-strong', className)}
      style={stretch ? { gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` } : undefined}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'px-3.5 h-[34px] text-[13px] font-semibold whitespace-nowrap transition-colors',
            i > 0 && 'border-l border-line-strong',
            value === o.value ? 'bg-slate-100 text-app' : 'text-slate-100 hover:bg-slate-100/[0.07]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---- Underline tabs (Transactions views) ---- */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string; count?: number | string; accent?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cx('flex items-end rule-b overflow-x-auto no-scrollbar', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cx(
              'flex items-center gap-2 py-2.5 pr-3.5 mr-3.5 -mb-[2px] border-b-2 text-sm whitespace-nowrap transition-colors',
              on ? 'border-blue-500 font-bold text-slate-100' : 'border-transparent text-slate-400 hover:text-slate-100',
            )}
          >
            {o.label}
            {o.count ? (
              <span className={cx('text-[11px] font-bold px-1.5 py-px', o.accent ? 'bg-red-900 text-red-400' : 'bg-slate-900 text-slate-300')}>
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ---- Filter chip (outlined; solid ink when active) ---- */
export function Chip({ active, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cx(
        'shrink-0 inline-flex items-center gap-1.5 h-[34px] px-3 text-[13px] font-semibold border transition-colors',
        active ? 'bg-slate-100 text-app border-slate-100' : 'bg-transparent text-slate-100 border-slate-500 hover:border-slate-100',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ---- Search input ---- */
export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cx('relative', className)}>
      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
      </svg>
      <input {...props} className={cx(fieldCls, 'pl-[34px]')} />
    </div>
  );
}

/* ---- Input / Select / Textarea ---- */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cx(fieldCls, className)} {...props} />,
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cx(fieldCls, className)} {...props}>{children}</select>
  ),
);
Select.displayName = 'Select';

export function Field({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

/* ---- Switch — square Modernist toggle ---- */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative shrink-0 w-10 h-[22px] border-2 p-0 transition-colors disabled:opacity-45',
        checked ? 'bg-blue-600 border-blue-600' : 'bg-transparent border-slate-500',
      )}
    >
      <span
        className={cx('absolute top-[2px] left-[2px] w-[14px] h-[14px] transition-transform duration-200 ease-ds', checked ? 'bg-app' : 'bg-slate-500')}
        style={{ transform: `translateX(${checked ? 18 : 0}px)` }}
      />
    </button>
  );
}

/* ---- Tag / Badge ---- */
export function Badge({ children, className, tone = 'neutral' }: { children: ReactNode; className?: string; tone?: 'neutral' | 'accent' | 'outline' | 'ink' }) {
  const tones = {
    neutral: 'bg-slate-900 text-slate-300',
    accent: 'bg-red-900 text-red-400',
    outline: 'border border-blue-500 text-blue-400',
    ink: 'bg-slate-100 text-app',
  };
  return (
    <span className={cx('inline-flex items-center gap-1 px-2 py-[3px] text-[11px] tracking-[0.02em] font-semibold', className ?? tones[tone])}>
      {children}
    </span>
  );
}

/* ---- Initials avatar (square) ---- */
export function initials(name: string | null | undefined) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}
export function Avatar({ name, ink, size = 32, className, src }: { name: string | null | undefined; ink?: boolean; size?: number; className?: string; src?: string | null }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (src && !broken) {
    return (
      <img src={src} alt="" onError={() => setBroken(true)} className={cx('shrink-0 object-cover bg-slate-900 anim-fade', className)} style={{ width: size, height: size }} />
    );
  }
  return (
    <span className={cx('avatar-sq', ink && 'avatar-ink', className)} style={{ width: size, height: size, fontSize: size >= 40 ? 13 : size >= 36 ? 12 : 11 }}>
      {initials(name)}
    </span>
  );
}

/* ---- Flat progress bar with optional "today" marker ---- */
export function Progress({
  value,
  marker,
  tone = 'ink',
  height = 6,
  className,
}: {
  value: number; // 0–100 (clamped)
  marker?: number; // 0–100
  tone?: 'ink' | 'accent' | 'danger';
  height?: number;
  className?: string;
}) {
  const target = Math.max(0, Math.min(100, value));
  // Mount at 0 and grow to the value, so bars "fill" when a page opens.
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  return (
    <div className={cx('relative w-full bg-slate-900', className)} style={{ height }}>
      <div className={cx('absolute inset-y-0 left-0 transition-[width] duration-700 ease-ds', tone === 'accent' ? 'bg-blue-500' : tone === 'danger' ? 'bg-red-500' : 'bg-slate-100')} style={{ width: `${w}%` }} />
      {marker !== undefined && (
        <div className="absolute -top-[3px] -bottom-[3px] w-[2px] bg-slate-100" style={{ left: `${Math.max(0, Math.min(100, marker))}%` }} />
      )}
    </div>
  );
}

/* ---- EmptyState — flush-left, no illustration ---- */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-12">
      {Icon && <Icon size={20} className="text-slate-400 mb-1" />}
      <p className="text-[17px] font-extrabold text-slate-100">{title}</p>
      {description && <p className="text-sm text-slate-400 max-w-md">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ---- Skeleton ---- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />;
}

/** Placeholder rows for list pages while data loads. */
export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx('flex flex-col', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-3.5 row-rule" style={{ opacity: 1 - i * 0.12 }}>
          <Skeleton className="w-8 h-8 shrink-0" />
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/* ---- Modal — dialog on desktop, bottom sheet on phones ---- */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'max-w-md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  // Portalled to <body> so no page wrapper (animation, filter, scroll box) can
  // re-anchor it — dialogs are always centred on the real viewport.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-slate-200/45 dark:bg-black/60 anim-fade" onClick={onClose}>
      <div
        className={cx(
          'w-full bg-elevated shadow-ds-lg flex flex-col max-h-[92vh] sm:max-h-[88vh] anim-sheet',
          'border-t-2 border-slate-100 sm:border-t-0',
          maxWidth,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 h-14 shrink-0 rule-b">
          <h3 className="text-lg font-extrabold text-slate-100 truncate">{title}</h3>
          <IconButton bordered={false} onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-1.5">
            <X size={18} />
          </IconButton>
        </div>
        <div className="px-5 py-5 overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 py-3.5 rule-t shrink-0 pb-[max(14px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---- Drawer — right-hand detail panel (web) / bottom sheet (phone) ---- */
export function Drawer({
  open,
  onClose,
  kicker,
  headerExtra,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  kicker?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <>
      <div
        onClick={onClose}
        className={cx('fixed inset-0 z-[60] bg-slate-200/15 dark:bg-black/40 transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0 pointer-events-none')}
      />
      <aside
        className={cx(
          'fixed z-[61] bg-app shadow-ds-lg flex flex-col transition-transform duration-300 ease-ds',
          // phone: bottom sheet
          'inset-x-0 bottom-0 max-h-[88vh] border-t-2 border-slate-100',
          // web: right panel
          'md:inset-x-auto md:top-0 md:right-0 md:bottom-0 md:max-h-none md:w-[440px] md:border-t-0 md:border-l-2 md:border-line-strong',
          open ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full',
        )}
        aria-hidden={!open}
      >
        <div className="md:hidden flex justify-center pt-2"><span className="w-10 h-1 bg-slate-700" /></div>
        <div className="h-14 md:h-[60px] shrink-0 flex items-center gap-1 pl-5 md:pl-6 pr-3 rule-b">
          <span className="t-kicker flex-1 truncate">{kicker}</span>
          {headerExtra}
          <IconButton bordered={false} onClick={onClose} aria-label="Close" className="w-8 h-8 ml-1">
            <X size={18} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto p-5 md:p-6 flex flex-col gap-[22px]">{children}</div>
        {footer && <div className="shrink-0 flex gap-2 px-5 md:px-6 py-3.5 rule-t pb-[max(14px,env(safe-area-inset-bottom))]">{footer}</div>}
      </aside>
    </>,
    document.body,
  );
}

/* ---- Detail list row (label | value) used in drawers & sheets ---- */
export function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3 py-3 row-rule text-sm">
      <span className="text-[13px] text-slate-400">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/* ---- Toasts — ink bar, optional Undo ---- */
type Toast = { id: number; msg: string; undo?: () => void };
const ToastCtx = createContext<{ show: (msg: string, undo?: () => void) => void } | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback((msg: string, undo?: () => void) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, msg, undo }]);
    window.setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="fixed z-[90] left-3 right-3 bottom-[100px] md:left-[calc(var(--sidebar-w,232px)+24px)] transition-[left] duration-300 md:right-auto md:bottom-7 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="anim-toast pointer-events-auto flex items-center gap-3.5 md:min-w-[340px] min-h-[46px] pl-4 pr-1.5 bg-slate-100 text-app shadow-ds-lg text-sm">
            <Check size={16} className="shrink-0" />
            <span className="flex-1">{t.msg}</span>
            {t.undo && (
              <button type="button" onClick={() => { t.undo?.(); dismiss(t.id); }} className="px-2 py-1.5 font-bold text-blue-300 dark:text-blue-600">
                Undo
              </button>
            )}
            <button type="button" onClick={() => dismiss(t.id)} className="grid place-items-center w-8 h-8 opacity-70 hover:opacity-100" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  return ctx ?? { show: () => {} };
}

/* ---- AnimatedNumber — counts up from 0 on first render, then eases between values.
 * Skips the animation when balances are hidden or motion is reduced. ---- */
export function AnimatedNumber({ value, format, duration = 700 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(() => (skipMotion() ? value : 0));
  const from = useRef(shown);
  useEffect(() => {
    if (skipMotion()) { setShown(value); from.current = value; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      const v = a + (value - a) * e;
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(shown)}</>;
}

const skipMotion = () =>
  typeof window === 'undefined' ||
  document.documentElement.classList.contains('hide-amounts') ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A tiny vibration on supporting phones (Android). No-op elsewhere. */
export function haptic(ms = 8) {
  try { if (!skipMotion()) navigator.vibrate?.(ms); } catch { /* unsupported */ }
}

/** Celebrate: accent squares burst out from (x, y) — defaults to screen centre. */
export function burst(x = window.innerWidth / 2, y = window.innerHeight / 2) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const el = document.createElement('div');
  el.className = 'burst';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  for (let i = 0; i < 18; i++) {
    const piece = document.createElement('i');
    const ang = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
    const dist = 60 + Math.random() * 70;
    piece.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    piece.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
    piece.style.setProperty('--rot', Math.round(Math.random() * 360) + 'deg');
    el.appendChild(piece);
  }
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 1000);
  haptic(14);
}
