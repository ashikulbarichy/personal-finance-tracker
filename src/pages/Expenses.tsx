import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { TrendingDown, Search } from 'lucide-react';

interface TxRow {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  transaction_date: string;
  accounts: { name: string } | null;
  categories: { name: string; color: string } | null;
}

interface MonthBar { label: string; value: number; }
interface CatSlice { category: string; amount: number; color: string; }

function MiniBarChart({ bars }: { bars: MonthBar[] }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="flex items-end gap-1 h-20">
      {bars.map((b) => (
        <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-rose-500/80 rounded-t"
            style={{ height: `${Math.max((b.value / max) * 64, b.value > 0 ? 3 : 0)}px` }}
          />
          <span className="text-[9px] text-slate-500">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Expenses() {
  const { user } = useAuth();
  const { fmt } = useUserPrefs();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [monthBars, setMonthBars] = useState<MonthBar[]>([]);

  const load = useCallback(async () => {
    if (!user) { setRows([]); setLoading(false); return; }

    const now = new Date();
    const sixAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];

    const [txRes, profRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, title, description, amount, transaction_date, accounts(name), categories(name, color)')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .order('transaction_date', { ascending: false }),
      supabase.from('profiles').select('default_currency').eq('id', user.id).single(),
    ]);

    setRows((txRes.data ?? []) as TxRow[]);
    setCurrency(profRes.data?.default_currency ?? 'USD');

    // 6-month bars
    const bars: MonthBar[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      bars.push({ label: d.toLocaleString('default', { month: 'short' }), value: 0 });
    }
    (txRes.data ?? []).forEach((t) => {
      const d = new Date((t as TxRow).transaction_date);
      const back = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (back >= 0 && back <= 5) bars[5 - back].value += Number((t as TxRow).amount);
    });
    setMonthBars(bars);
    void sixAgo;
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    rows.filter((t) =>
      t.title?.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase()) ||
      t.accounts?.name.toLowerCase().includes(search.toLowerCase())
    ), [rows, search]);

  const total = useMemo(() => rows.reduce((s, t) => s + t.amount, 0), [rows]);

  const topCats = useMemo(() => {
    const map = new Map<string, CatSlice>();
    rows.forEach((t) => {
      const name = t.categories?.name ?? 'Uncategorized';
      const color = t.categories?.color ?? '#64748b';
      const ex = map.get(name) ?? { category: name, amount: 0, color };
      map.set(name, { ...ex, amount: ex.amount + t.amount });
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [rows]);

  if (loading) return <div className="px-8 py-8 text-slate-400">Loading…</div>;

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-5">
      {/* Header stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-rose-600 to-red-700 p-5 rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-rose-200 font-medium">Total Expenses</p>
              <p className="text-2xl font-bold text-white mt-1">{currency} {total.toFixed(2)}</p>
            </div>
            <div className="p-2.5 bg-white/20 rounded-xl"><TrendingDown className="text-white" size={20} /></div>
          </div>
        </div>

        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-400 mb-3">6-Month Trend</p>
          <MiniBarChart bars={monthBars} />
        </div>

        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-400 mb-3">Top Categories</p>
          <div className="space-y-2">
            {topCats.map((c) => (
              <div key={c.category} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="text-xs text-slate-400 truncate">{c.category}</span>
                </div>
                <span className="text-xs font-semibold text-slate-200 shrink-0">{currency} {c.amount.toFixed(2)}</span>
              </div>
            ))}
            {topCats.length === 0 && <p className="text-xs text-slate-600">No data yet</p>}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
        <input
          type="text"
          placeholder="Search expenses…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-[#141927] rounded-xl border border-slate-800 overflow-hidden">
        <div className="hidden md:block">
          <table className="w-full">
            <thead className="bg-slate-800/40 border-b border-slate-800">
              <tr>
                {['Date', 'Title', 'Account', 'Category', 'Amount'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-800/30">
                  <td className="px-5 py-3 text-sm text-slate-400">{fmt(t.transaction_date)}</td>
                  <td className="px-5 py-3 text-sm text-slate-100">{t.title || t.description || '—'}</td>
                  <td className="px-5 py-3 text-sm text-slate-400">{t.accounts?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-sm">
                    {t.categories ? (
                      <span className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: `${t.categories.color}22`, color: t.categories.color }}>
                        {t.categories.name}
                      </span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-5 py-3 text-sm font-semibold text-rose-400">
                    <div className="flex flex-col items-start gap-0.5">
                      <span>-{currency} {t.amount.toFixed(2)}</span>
                      {Number(t.charge_amount ?? 0) > 0 && (
                        <span className="text-[10px] text-slate-500">charge {currency} {Number(t.charge_amount).toFixed(2)}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-600 text-sm">No expenses found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Mobile */}
        <div className="md:hidden divide-y divide-slate-800">
          {filtered.map((t) => (
            <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-100 truncate">{t.title || t.description || '—'}</p>
                <p className="text-xs text-slate-500 mt-0.5">{fmt(t.transaction_date)} · {t.accounts?.name ?? '—'}</p>
                {t.categories && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-medium"
                    style={{ backgroundColor: `${t.categories.color}22`, color: t.categories.color }}>
                    {t.categories.name}
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-rose-400">-{currency} {t.amount.toFixed(2)}</div>
                {Number(t.charge_amount ?? 0) > 0 && (
                  <div className="text-[10px] text-slate-500">charge {currency} {Number(t.charge_amount).toFixed(2)}</div>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-slate-600 text-sm">No expenses found</div>
          )}
        </div>
      </div>
    </div>
  );
}
