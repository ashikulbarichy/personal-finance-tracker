import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, UserCheck, Edit2, Search } from 'lucide-react';

interface Payee {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  category: string | null;
  notes: string | null;
  total_paid: number;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  freelancer: '#3b82f6',
  vendor: '#f59e0b',
  individual: '#10b981',
  service: '#8b5cf6',
  charity: '#ec4899',
  other: '#64748b',
};

const emptyForm = { name: '', email: '', phone: '', category: 'individual', notes: '' };

export function Payees() {
  const { user } = useAuth();
  const [payees, setPayees] = useState<Payee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Payee | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('USD');

  const load = useCallback(async () => {
    if (!user) { setPayees([]); setLoading(false); return; }

    const [payeesRes, profRes] = await Promise.all([
      supabase.from('payees').select('*').eq('user_id', user.id).order('total_paid', { ascending: false }),
      supabase.from('profiles').select('default_currency').eq('id', user.id).single(),
    ]);

    setPayees((payeesRes.data ?? []) as Payee[]);
    setCurrency(profRes.data?.default_currency ?? 'USD');
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const payload = {
      user_id: user.id,
      name: formData.name,
      email: formData.email || null,
      phone: formData.phone || null,
      category: formData.category || null,
      notes: formData.notes || null,
    };

    if (editing) {
      await supabase.from('payees').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('payees').insert(payload);
    }

    setShowForm(false);
    setEditing(null);
    setFormData(emptyForm);
    load();
  };

  const handleEdit = (p: Payee) => {
    setEditing(p);
    setFormData({ name: p.name, email: p.email ?? '', phone: p.phone ?? '', category: p.category ?? 'individual', notes: p.notes ?? '' });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this payee?')) {
      await supabase.from('payees').delete().eq('id', id);
      load();
    }
  };

  const filtered = payees.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPaid = payees.reduce((s, p) => s + Number(p.total_paid), 0);

  if (loading) return <div className="px-8 py-8 text-slate-400">Loading…</div>;

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-200 font-medium">Total Payees</p>
              <p className="text-2xl font-bold text-white mt-1">{payees.length}</p>
              <p className="text-[11px] text-blue-200 mt-1">external recipients</p>
            </div>
            <div className="p-2.5 bg-white/20 rounded-xl"><UserCheck className="text-white" size={20} /></div>
          </div>
        </div>
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-400 mb-1">Total Paid Out</p>
          <p className="text-xl font-bold text-slate-100">{currency} {totalPaid.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">across all payees</p>
        </div>
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-400 mb-2">By Category</p>
          <div className="space-y-1">
            {Object.entries(
              payees.reduce<Record<string, number>>((acc, p) => {
                const cat = p.category ?? 'other';
                acc[cat] = (acc[cat] ?? 0) + 1;
                return acc;
              }, {})
            ).slice(0, 4).map(([cat, cnt]) => (
              <div key={cat} className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] ?? '#64748b' }} />
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </span>
                <span className="text-xs font-semibold text-slate-200">{cnt}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
          <input type="text" placeholder="Search payees…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
        </div>
        <button onClick={() => { setShowForm(true); setEditing(null); setFormData(emptyForm); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all">
          <Plus size={18} /> Add Payee
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">{editing ? 'Edit Payee' : 'New Payee'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Name *</label>
                <input required type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. John Smith" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="individual">Individual</option>
                  <option value="vendor">Vendor</option>
                  <option value="freelancer">Freelancer</option>
                  <option value="service">Service</option>
                  <option value="charity">Charity</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Phone</label>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 555 000 0000" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
                <input type="text" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional note about this payee" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-all">{editing ? 'Update' : 'Create'}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl border border-slate-700 transition-all">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      <div className="bg-[#141927] rounded-xl border border-slate-800 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <UserCheck className="mx-auto mb-3 text-slate-700" size={40} />
            <p className="text-sm text-slate-500">No payees yet</p>
            <p className="text-xs text-slate-600 mt-1">Add people and companies you regularly pay</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filtered.map((p) => {
              const color = CATEGORY_COLORS[p.category ?? 'other'] ?? '#64748b';
              return (
                <div key={p.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-800/30 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ backgroundColor: `${color}22`, color }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {p.category && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium capitalize"
                            style={{ backgroundColor: `${color}22`, color }}>{p.category}</span>
                        )}
                        {p.email && <span className="text-[10px] text-slate-500 truncate">{p.email}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-100">{currency} {Number(p.total_paid).toFixed(2)}</p>
                      <p className="text-[10px] text-slate-500">total paid</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(p)} className="p-1.5 text-slate-600 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
