import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, LogOut, Moon, Sun, Wallet, Landmark, Repeat, Users, BarChart3, Tag, Coins, Settings, LineChart, Flag, Receipt } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { Avatar } from '../components/ui';

type Row = { path: string; label: string; icon: React.ElementType; val?: string };

/** Phone "More" tab — everything that isn't Home / Activity / Plan. */
export function MorePage() {
  const { user, signOut } = useAuth();
  const { resolved, toggle } = useTheme();
  const { defaultCurrency, fullName: name, avatarUrl } = useUserPrefs();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<{ accounts: number; recurring: number; payees: number }>({ accounts: 0, recurring: 0, payees: 0 });

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
      supabase.from('recurring_transactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('payees').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]).then(([a, r, p]) => setCounts({ accounts: a.count ?? 0, recurring: r.count ?? 0, payees: p.count ?? 0 }));
  }, [user]);

  const groups: Row[][] = [
    [
      { path: '/accounts', label: 'Accounts', icon: Wallet, val: counts.accounts ? String(counts.accounts) : '' },
      { path: '/investments', label: 'Assets & investments', icon: LineChart },
      { path: '/loans', label: 'Loans', icon: Landmark },
      { path: '/debt', label: 'Debt-free plan', icon: Flag },
      { path: '/tax', label: 'Tax summary', icon: Receipt },
      { path: '/recurring', label: 'Recurring', icon: Repeat, val: counts.recurring ? `${counts.recurring} set up` : '' },
      { path: '/payees', label: 'Payees', icon: Users, val: counts.payees ? String(counts.payees) : '' },
    ],
    [
      { path: '/reports', label: 'Analytics', icon: BarChart3 },
      { path: '/categories', label: 'Categories', icon: Tag },
      { path: '/currencies', label: 'Currencies', icon: Coins, val: defaultCurrency },
      { path: '/settings', label: 'Settings', icon: Settings },
    ],
  ];

  const rowCls = 'flex items-center gap-3.5 w-full min-h-[54px] row-rule text-left active:bg-slate-100/[0.06]';

  return (
    <div className="px-5 pt-3 pb-7 flex flex-col gap-5">
      <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-slate-100">More</h1>

      <button type="button" onClick={() => navigate('/settings')} className="flex items-center gap-3 p-3.5 bg-surface text-left active:bg-slate-100/[0.06]">
        <Avatar name={name || user?.email} src={avatarUrl} ink size={44} />
        <div className="flex flex-col leading-snug min-w-0 flex-1">
          <span className="text-base font-bold text-slate-100 truncate">{name || 'Your profile'}</span>
          <span className="text-[13px] text-slate-400 truncate">{user?.email}</span>
        </div>
        <ChevronRight size={16} className="text-slate-400" />
      </button>

      {groups.map((g, i) => (
        <div key={i} className="rule-t">
          {g.map((r) => (
            <button key={r.path} type="button" onClick={() => navigate(r.path)} className={rowCls + ' transition-colors'}>
              <r.icon size={18} className="text-slate-100" />
              <span className="flex-1 text-base text-slate-100">{r.label}</span>
              {r.val && <span className="text-[13px] text-slate-400">{r.val}</span>}
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          ))}
        </div>
      ))}

      <div className="rule-t">
        <button type="button" onClick={toggle} className={rowCls}>
          {resolved === 'dark' ? <Sun size={18} className="text-slate-100" /> : <Moon size={18} className="text-slate-100" />}
          <span className="flex-1 text-base text-slate-100">{resolved === 'dark' ? 'Light appearance' : 'Dark appearance'}</span>
        </button>
        <button type="button" onClick={async () => { await signOut(); navigate('/login', { replace: true }); }} className={rowCls}>
          <LogOut size={18} className="text-red-400" />
          <span className="flex-1 text-base text-red-400 font-semibold">Log out</span>
        </button>
      </div>
    </div>
  );
}
