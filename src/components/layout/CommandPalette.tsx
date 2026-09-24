import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, CornerDownLeft, Eye, Moon, Plus, Search, User, Receipt } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { NAV } from '../../lib/nav';
import { cx } from '../ui';

type Row = { label: string; sub?: string; icon: React.ElementType; run: () => void; group: string };

/** ⌘K palette — jump to pages, run actions, find transactions and payees. */
export function CommandPalette({
  open,
  onClose,
  onNewTransaction,
}: {
  open: boolean;
  onClose: () => void;
  onNewTransaction: (type?: 'expense' | 'transfer') => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toggle: toggleTheme } = useTheme();
  const { toggle: toggleHide } = usePrivacy();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [txns, setTxns] = useState<{ id: string; title: string; amount: number; currency: string; type: string }[]>([]);
  const [payees, setPayees] = useState<{ id: string; name: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setIdx(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    if (user) {
      supabase.from('transactions').select('id, title, amount, currency, type')
        .eq('user_id', user.id).order('transaction_date', { ascending: false }).limit(300)
        .then(({ data }) => setTxns(data ?? []));
      supabase.from('payees').select('id, name').eq('user_id', user.id).limit(300)
        .then(({ data }) => setPayees(data ?? []));
    }
    return () => window.clearTimeout(t);
  }, [open, user]);

  const rows = useMemo<Row[]>(() => {
    const go = (path: string) => () => { navigate(path); onClose(); };
    const actions: Row[] = [
      { group: 'Actions', label: 'New transaction', sub: 'N', icon: Plus, run: () => { onClose(); onNewTransaction('expense'); } },
      { group: 'Actions', label: 'New transfer', icon: ArrowLeftRight, run: () => { onClose(); onNewTransaction('transfer'); } },
      { group: 'Actions', label: 'Hide or show balances', icon: Eye, run: () => { toggleHide(); onClose(); } },
      { group: 'Actions', label: 'Switch light / dark', icon: Moon, run: () => { toggleTheme(); onClose(); } },
    ];
    const pages: Row[] = NAV.flatMap((g) => g.items.map((it) => ({ group: 'Pages', label: 'Go to ' + it.label, icon: it.icon, run: go(it.path) })));
    const needle = q.trim().toLowerCase();
    if (!needle) return [...actions, ...pages];
    const match = (s: string) => s.toLowerCase().includes(needle);
    const txRows: Row[] = txns.filter((t) => match(t.title || '')).slice(0, 6).map((t) => ({
      group: 'Transactions',
      label: t.title,
      sub: `${t.type === 'income' ? '+' : '−'}${Number(t.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${t.currency}`,
      icon: Receipt,
      run: go(`/transactions?q=${encodeURIComponent(t.title)}`),
    }));
    const pRows: Row[] = payees.filter((p) => match(p.name)).slice(0, 5).map((p) => ({
      group: 'Payees', label: p.name, icon: User, run: go(`/transactions?q=${encodeURIComponent(p.name)}`),
    }));
    return [...actions.filter((r) => match(r.label)), ...pages.filter((r) => match(r.label)), ...txRows, ...pRows];
  }, [q, txns, payees, navigate, onClose, onNewTransaction, toggleHide, toggleTheme]);

  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-pi="${idx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(rows.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); rows[idx]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let lastGroup = '';
  return (
    <>
      <div
        onClick={onClose}
        className={cx('fixed inset-0 z-[80] bg-slate-200/35 dark:bg-black/55 transition-opacity duration-150', open ? 'opacity-100' : 'opacity-0 pointer-events-none')}
      />
      <div
        className={cx(
          'fixed z-[81] top-[72px] md:top-[96px] left-3 right-3 md:left-1/2 md:right-auto md:w-[620px] md:-ml-[310px]',
          'bg-app border border-line-strong shadow-ds-lg flex flex-col transition-all duration-200 ease-ds',
          open ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98] pointer-events-none',
        )}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-3 px-4 h-14 rule-b">
          <Search size={18} className="text-slate-100" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search or type a command…"
            className="flex-1 h-full bg-transparent border-0 outline-none text-[17px] text-slate-100 placeholder-slate-500"
          />
          <span className="kbd">ESC</span>
        </div>
        <div ref={listRef} className="relative max-h-[380px] overflow-auto p-1.5">
          {rows.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            const on = i === idx;
            return (
              <div key={r.group + r.label + i}>
                {header && <div className="t-th px-2.5 pt-2.5 pb-1">{header}</div>}
                <div
                  data-pi={i}
                  onClick={r.run}
                  onMouseMove={() => { if (idx !== i) setIdx(i); }}
                  className={cx('flex items-center gap-3 h-[42px] px-2.5 cursor-pointer', on ? 'bg-slate-100 text-app' : 'text-slate-100')}
                >
                  <r.icon size={16} />
                  <span className={cx('flex-1 text-sm truncate', on && 'font-semibold')}>{r.label}</span>
                  {r.sub && <span className={cx('text-xs tabular-nums', on ? 'text-app/70' : 'text-slate-400')}>{r.sub}</span>}
                  {on && <CornerDownLeft size={14} />}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="px-2.5 py-6 text-sm text-slate-400">Nothing found for “{q}”.</div>}
        </div>
        <div className="hidden md:flex gap-[18px] px-4 py-2.5 border-t border-line text-xs text-slate-400">
          <span>↑ ↓ to move</span><span>↵ to open</span><span>N new transaction</span><span className="ml-auto">⌘K to toggle</span>
        </div>
      </div>
    </>
  );
}
