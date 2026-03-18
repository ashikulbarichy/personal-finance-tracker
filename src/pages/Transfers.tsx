import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { ArrowRightLeft, Search } from 'lucide-react';

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

function MiniBarChart({ bars }: { bars: MonthBar[] }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="flex items-end gap-1 h-20">
      {bars.map((b) => (
        <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-cyan-500/80 rounded-t"
            style={{ height: `${Math.max((b.value / max) * 64, b.value > 0 ? 3 : 0)}px` }}
          />
          <span className="text-[9px] text-slate-500">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Transfers() {
  const { user } = useAuth();
  const { fmt } = useUserPrefs();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [monthBars, setMonthBars] = useState<MonthBar[]>([]);

  const load = useCallback(async () => {
    if (!user) { setRows([]); setLoading(false); return; }

    const [txRes, profRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, title, description, amount, transaction_date, accounts(name), categories(name, color)')
        .eq('user_id', user.id)
        .ilike('description', '%transfer%')
        .order('transaction_date', { ascending: false }),
      supabase.from('profiles').select('default_currency').eq('id', user.id).single(),
    ]);

    setRows((txRes.data ?? []) as TxRow[]);
    setCurrency(profRes.data?.default_currency ?? 'USD');

    const now = new Date();
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
  const count = rows.length;

  if (loading) return <div className="px-8 py-8 text-slate-400">Loading…</div>;

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-cyan-600 to-blue-700 p-5 rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-cyan-200 font-medium">Total Transferred</p>
              <p className="text-2xl font-bold text-white mt-1">{currency} {total.toFixed(2)}</p>
              <p className="text-[11px] text-cyan-200 mt-1">{count} transfer{count !== 1 ? 's' : ''}</p>
            </div>
            <div className="p-2.5 bg-white/20 rounded-xl"><ArrowRightLeft className="text-white" size={20} /></div>
          </div>
        </div>

        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-400 mb-3">6-Month Volume</p>
          <MiniBarChart bars={monthBars} />
        </div>

        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800 flex flex-col justify-center">
          <p className="text-xs text-slate-400 mb-2">Avg per Transfer</p>
          <p className="text-xl font-bold text-slate-100">
            {count > 0 ? `${currency} ${(total / count).toFixed(2)}` : '—'}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">across all time</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
        <input
          type="text"
          placeholder="Search transfers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
        />
      </div>

      <div className="bg-[#141927] rounded-xl border border-slate-800 overflow-hidden">
        <div className="hidden md:block">
          <table className="w-full">
            <thead className="bg-slate-800/40 border-b border-slate-800">
              <tr>
                {['Date', 'Title / Description', 'Account', 'Amount'].map((h) => (
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
                  <td className="px-5 py-3 text-sm font-semibold text-cyan-400">
                    <div className="flex flex-col items-start gap-0.5">
                      <span>{currency} {t.amount.toFixed(2)}</span>
                      {Number(t.charge_amount ?? 0) > 0 && (
                        <span className="text-[10px] text-slate-500">charge {currency} {Number(t.charge_amount).toFixed(2)}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-600 text-sm">No transfers found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-slate-800">
          {filtered.map((t) => (
            <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-100 truncate">{t.title || t.description || '—'}</p>
                <p className="text-xs text-slate-500 mt-0.5">{fmt(t.transaction_date)} · {t.accounts?.name ?? '—'}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-cyan-400">{currency} {t.amount.toFixed(2)}</div>
                {Number(t.charge_amount ?? 0) > 0 && (
                  <div className="text-[10px] text-slate-500">charge {currency} {Number(t.charge_amount).toFixed(2)}</div>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-slate-600 text-sm">No transfers found</div>
          )}
        </div>
      </div>
    </div>
  );
}
