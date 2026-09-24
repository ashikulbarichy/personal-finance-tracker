import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Eye, EyeOff, Home, List, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Search, Target } from 'lucide-react';
import { Sidebar, SIDEBAR_W } from './Sidebar';
import { NotificationsProvider } from '../notifications/NotificationsContext';
import { AppLock } from '../lock/AppLock';
import { NotificationBell, NotificationPanel } from '../notifications/NotificationPanel';
import { ThemeToggle } from './ThemeToggle';
import { CommandPalette } from './CommandPalette';
import { MobileAddSheet } from './MobileAddSheet';
import { TransactionFormModal } from '../transactions/TransactionFormModal';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { PHONE_ROOTS, titleFor } from '../../lib/nav';
import { cx, haptic, IconButton } from '../ui';

const SIDEBAR_KEY = 'keel-sidebar-collapsed';
/** Saved choice, else collapsed on smaller laptop screens. */
function initialCollapsed() {
  try {
    const v = localStorage.getItem(SIDEBAR_KEY);
    if (v !== null) return v === '1';
  } catch { /* storage blocked */ }
  return window.innerWidth < 1100;
}

type FormType = 'expense' | 'income' | 'transfer';

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

/** App chrome for both form factors:
 *  - web (≥ md): 232px sidebar + 60px header (⌘K search, eye, theme, New transaction)
 *  - phone / installed PWA: bottom tab bar (Home · Activity · + · Plan · More),
 *    a back bar on pages reached from More, and a keypad quick-add sheet. */
export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { hidden, toggle: toggleHide } = usePrivacy();
  const [palette, setPalette] = useState(false);
  const [form, setForm] = useState<FormType | null>(null);
  const [sheet, setSheet] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      try { localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1'); } catch { /* storage blocked */ }
      return !c;
    });
  }, []);

  // Toasts and other fixed UI line up with the sidebar edge.
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', `${collapsed ? SIDEBAR_W.collapsed : SIDEBAR_W.open}px`);
  }, [collapsed]);

  const isPhone = () => window.matchMedia('(max-width: 767px)').matches;
  const openNew = useCallback((type: FormType = 'expense') => {
    if (isPhone() && type !== 'transfer') setSheet(true);
    else setForm(type);
  }, []);

  /* Keyboard: ⌘K / Ctrl+K palette, N new transaction */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); return; }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNew('expense'); }
      if (e.key === '[') { e.preventDefault(); toggleSidebar(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openNew, toggleSidebar]);

  /* PWA shortcut: /transactions?new=1 */
  useEffect(() => {
    if (params.get('new') === '1') {
      openNew('expense');
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams, openNew]);

  const path = location.pathname;
  // New page starts at the top.
  useEffect(() => { document.getElementById('app-main')?.scrollTo({ top: 0 }); }, [path]);
  const isSub = !PHONE_ROOTS.includes(path);
  const backTo = path.startsWith('/accounts/') ? '/accounts' : path.startsWith('/loans/') ? '/loans' : '/more';
  const backLabel = backTo === '/more' ? 'More' : titleFor(backTo);

  const tab = (to: string, label: string, Icon: React.ElementType, also: string[] = []) => {
    const on = path === to || also.some((p) => path.startsWith(p));
    return (
      <NavLink
        to={to}
        onClick={() => haptic()}
        className={cx(
          'flex flex-col items-center justify-center gap-[2px] text-[11px] transition-[color,transform] duration-150 active:scale-[0.92]',
          on ? 'text-slate-100 font-bold' : 'text-slate-400 font-medium',
        )}
      >
        <span className={cx('nav-ico w-[40px] h-[28px]', on && 'is-on')}>
          <Icon size={20} strokeWidth={on ? 2.4 : 2} />
        </span>
        {label}
      </NavLink>
    );
  };

  return (
    <AppLock>
    <NotificationsProvider>
    <div className="flex h-[100dvh] bg-app print:block print:h-auto">
      <Sidebar collapsed={collapsed} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* ── Web header ── */}
        <header className="hidden md:flex print:!hidden h-[60px] shrink-0 items-center gap-2.5 pl-4 pr-8 rule-b">
          <IconButton
            bordered={false}
            onClick={toggleSidebar}
            title={collapsed ? 'Show sidebar  [' : 'Hide sidebar  ['}
            aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
            aria-expanded={!collapsed}
            className="text-slate-400 hover:text-slate-100"
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </IconButton>
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="flex-1 max-w-[460px] h-9 flex items-center gap-2.5 pl-3 pr-2.5 bg-surface border border-line-strong text-sm text-slate-400 text-left hover:border-slate-100 transition-colors"
          >
            <Search size={16} />
            <span className="flex-1 truncate">Search transactions, payees, pages…</span>
            <span className="kbd">⌘K</span>
          </button>
          <div className="flex-1" />
          <NotificationBell />
          <ThemeToggle />
          <IconButton onClick={toggleHide} title={hidden ? 'Show balances' : 'Hide balances'} aria-label={hidden ? 'Show balances' : 'Hide balances'}>
            {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </IconButton>
          <button
            type="button"
            onClick={() => setForm('expense')}
            className="inline-flex items-center gap-2.5 h-9 px-[14px] bg-blue-600 hover:bg-blue-700 active:bg-blue-400 text-app text-sm font-extrabold transition-colors"
          >
            <Plus size={16} />
            <span>New transaction</span>
            <span className="text-[11px] px-[5px] py-px border border-app/60 font-semibold">N</span>
          </button>
        </header>

        {/* ── Phone back bar (pages reached from More / detail pages) ── */}
        {isSub && (
          <div className="md:hidden print:hidden sticky top-0 z-20 shrink-0 bg-app rule-b pt-safe">
            <div className="relative flex items-center h-12 px-2">
              <button type="button" onClick={() => navigate(backTo)} className="flex items-center gap-0.5 h-11 pl-1 pr-2 text-[15px] font-semibold text-blue-400">
                <ChevronLeft size={20} />
                {backLabel}
              </button>
              <span className="absolute inset-x-0 text-center text-base font-extrabold text-slate-100 pointer-events-none">{titleFor(path)}</span>
              <div className="ml-auto flex items-center">
                <NotificationBell className="!w-11 !h-11 !border-transparent" size={18} />
                <IconButton bordered={false} onClick={toggleHide} aria-label="Hide balances" className="w-11 h-11">
                  {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
                </IconButton>
              </div>
            </div>
          </div>
        )}
        {!isSub && <div className="md:hidden pt-safe shrink-0" />}

        <main id="app-main" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden print:overflow-visible" style={{ scrollBehavior: 'smooth' }}>
          {/* keyed by path so each page change plays the enter animation */}
          <div key={path} className="page-enter">
            <Outlet />
          </div>
          {/* keep content clear of the phone tab bar */}
          <div className="md:hidden h-[calc(96px+env(safe-area-inset-bottom))]" />
        </main>
      </div>

      {/* ── Phone tab bar ── */}
      <nav className="md:hidden print:hidden fixed inset-x-0 bottom-0 z-40 bg-app rule-t grid grid-cols-5 h-[calc(62px+env(safe-area-inset-bottom))] pb-safe">
        {tab('/dashboard', 'Home', Home)}
        {tab('/transactions', 'Activity', List)}
        <div className="grid place-items-center">
          <button
            type="button"
            onClick={() => { haptic(10); setSheet(true); }}
            aria-label="Add transaction"
            className="w-[54px] h-[54px] -translate-y-1 bg-blue-600 active:bg-blue-400 active:scale-[0.94] text-app grid place-items-center shadow-ds-md transition-[background-color,transform] duration-150"
          >
            <Plus size={26} strokeWidth={2.5} />
          </button>
        </div>
        {tab('/plan', 'Plan', Target, ['/goals'])}
        {tab('/more', 'More', MoreHorizontal, ['/accounts', '/investments', '/debt', '/tax', '/loans', '/recurring', '/payees', '/reports', '/categories', '/currencies', '/settings'])}
      </nav>

      <CommandPalette open={palette} onClose={() => setPalette(false)} onNewTransaction={(t) => setForm(t ?? 'expense')} />
      <MobileAddSheet open={sheet} onClose={() => setSheet(false)} onMoreDetails={(t) => setForm(t)} />
      <TransactionFormModal
        isOpen={form !== null}
        initialType={form ?? 'expense'}
        onClose={() => setForm(null)}
        onSaved={() => { setForm(null); window.dispatchEvent(new Event('ft-data-changed')); }}
      />
      <NotificationPanel />
    </div>
    </NotificationsProvider>
    </AppLock>
  );
}
