import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useUserPrefs } from '../../contexts/UserPrefsContext';
import { NAV } from '../../lib/nav';
import { Avatar, cx } from '../ui';

/** Keel brand mark — a solid accent square with a bold K. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <div
      className="bg-blue-600 text-app grid place-items-center font-extrabold shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.57) }}
    >
      K
    </div>
  );
}

export const SIDEBAR_W = { open: 232, collapsed: 64 };

const isActivePath = (path: string, current: string) => current === path || current.startsWith(path + '/');

/** Web sidebar (≥ md). Phones use the bottom tab bar instead.
 *  - The active item's icon tile fills with the accent from the bottom up,
 *    and a 2px bar slides from the old item to the new one.
 *  - `collapsed` shrinks it to an icon rail; names show in a hover tooltip. */
export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { signOut } = useAuth();
  const { defaultCurrency, fullName, avatarUrl } = useUserPrefs();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ top: number; height: number } | null>(null);
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);

  // Position the sliding indicator on the active link.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>('a[data-active="true"]');
    setBar(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
  }, [pathname, collapsed]);

  const showTip = (label: string, e: React.MouseEvent | React.FocusEvent) => {
    if (!collapsed) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2 });
  };

  return (
    <aside
      className={cx(
        'hidden md:flex print:!hidden shrink-0 bg-surface rule-r flex-col h-screen pt-5 pb-4 transition-[width] duration-300 ease-ds overflow-hidden',
        collapsed ? 'px-2.5' : 'px-3',
      )}
      style={{ width: collapsed ? SIDEBAR_W.collapsed : SIDEBAR_W.open }}
    >
      <div className={cx('flex items-center gap-2.5 pb-[22px]', collapsed ? 'px-[7px]' : 'px-2.5')}>
        <BrandMark />
        <div className={cx('text-[19px] font-extrabold tracking-[-0.02em] text-slate-100 transition-opacity duration-200', collapsed && 'opacity-0')}>Keel</div>
      </div>

      <nav ref={navRef} className="relative flex-1 overflow-y-auto overflow-x-hidden no-scrollbar" onMouseLeave={() => setTip(null)}>
        {bar && (
          <span
            aria-hidden
            className="absolute left-0 w-[2px] bg-blue-500 transition-[top,height] duration-300 ease-ds"
            style={{ top: bar.top, height: bar.height }}
          />
        )}
        {NAV.map((g, gi) => (
          <div key={gi} className="flex flex-col gap-px mb-3">
            {g.label && (
              collapsed
                ? <div className="mx-2 my-1.5 h-px bg-line" />
                : <div className="t-th !text-slate-400 px-2.5 pt-1.5 pb-1 whitespace-nowrap">{g.label}</div>
            )}
            {g.items.map((it) => {
              const on = isActivePath(it.path, pathname);
              return (
                <NavLink
                  key={it.path}
                  to={it.path}
                  data-active={on}
                  aria-label={collapsed ? it.label : undefined}
                  onMouseEnter={(e) => showTip(it.label, e)}
                  onFocus={(e) => showTip(it.label, e)}
                  onBlur={() => setTip(null)}
                  className={cx(
                    'group flex items-center gap-2.5 h-[36px] text-sm transition-colors duration-200 whitespace-nowrap',
                    collapsed ? 'px-[8px]' : 'px-2',
                    on ? 'bg-app text-slate-100 font-bold' : 'text-slate-100 hover:bg-slate-100/[0.07]',
                  )}
                >
                  <span className={cx('nav-ico w-[26px] h-[26px]', on ? 'is-on' : 'text-slate-300 group-hover:text-slate-100')}>
                    <it.icon size={16} strokeWidth={on ? 2.3 : 2} />
                  </span>
                  <span className={cx('flex-1 transition-opacity duration-200', collapsed && 'opacity-0')}>{it.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Hover label for the collapsed rail (fixed, so the scrolling nav can't clip it) */}
      {collapsed && tip && (
        <div
          className="fixed z-[80] left-[70px] -translate-y-1/2 px-2.5 py-1.5 bg-slate-100 text-app text-[13px] font-semibold shadow-ds-md pointer-events-none anim-fade whitespace-nowrap"
          style={{ top: tip.top }}
        >
          {tip.label}
        </div>
      )}

      <div className={cx('mt-auto flex items-center gap-2.5 pt-3 rule-t', collapsed ? 'flex-col px-0' : 'px-2.5')}>
        <button type="button" onClick={() => navigate('/settings')} title="Profile & settings" className="shrink-0">
          <Avatar name={fullName} src={avatarUrl} ink />
        </button>
        {!collapsed && (
          <div className="flex flex-col leading-tight min-w-0 flex-1">
            <span className="text-sm font-semibold text-slate-100 truncate">{fullName || 'You'}</span>
            <span className="text-xs text-slate-400 whitespace-nowrap">Personal · {defaultCurrency}</span>
          </div>
        )}
        <button
          type="button"
          title="Log out"
          aria-label="Log out"
          onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
          className="grid place-items-center w-8 h-8 shrink-0 text-slate-400 hover:text-red-400 hover:bg-slate-100/[0.07] transition-colors"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
