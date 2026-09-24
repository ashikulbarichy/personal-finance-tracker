import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, MoreHorizontal, Pencil, Archive, ArchiveRestore, Trash2, Wallet, Scale } from 'lucide-react';
import type { Database } from '../lib/database.types';
import { AdjustBalanceModal } from '../components/accounts/AdjustBalanceModal';
import { Button, IconButton, PageHeader, Input, Select, Modal, EmptyState, ListSkeleton, Avatar, labelCls, cx } from '../components/ui';
import { formatMoney } from '../lib/money';

type Account = Database['public']['Tables']['accounts']['Row'];
type SavingsAllocation = Database['public']['Tables']['savings_goal_allocations']['Row'];

export const ACCOUNT_TYPE_LABEL: Record<Account['type'], string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit_card: 'Credit card',
  virtual_card: 'Virtual card',
  cash: 'Cash',
  investment: 'Investment',
  multi_currency: 'Multi-currency',
  mfs: 'Mobile money',
};

const notifyChanged = () => window.dispatchEvent(new Event('ft-data-changed'));

/** Row "…" menu — edit / adjust / archive / delete. */
function RowMenu({
  account,
  onEdit,
  onAdjust,
  onToggleActive,
  onDelete,
}: {
  account: Account;
  onEdit: () => void;
  onAdjust: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const item = 'flex items-center gap-2.5 w-full h-10 px-3 text-sm text-left hover:bg-slate-100/[0.07]';
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <IconButton
        bordered={false}
        aria-label={`Actions for ${account.name}`}
        aria-expanded={open}
        onClick={(e) => {
          // Open upward when there isn't room for the menu below the button.
          const r = e.currentTarget.getBoundingClientRect();
          setUp(window.innerHeight - r.bottom < 160);
          setOpen((o) => !o);
        }}
        className="w-11 h-11 md:w-9 md:h-9 text-slate-400"
      >
        <MoreHorizontal size={16} />
      </IconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={cx('absolute right-0 z-50 w-48 bg-elevated shadow-ds-md border border-line py-1 anim-pop', up ? 'bottom-full mb-1' : 'top-full mt-1')}>
            <button type="button" className={item} onClick={() => { setOpen(false); onEdit(); }}>
              <Pencil size={14} /> Edit
            </button>
            <button type="button" className={item} onClick={() => { setOpen(false); onAdjust(); }}>
              <Scale size={14} /> Adjust balance
            </button>
            <button type="button" className={item} onClick={() => { setOpen(false); onToggleActive(); }}>
              {account.is_active ? <Archive size={14} /> : <ArchiveRestore size={14} />}
              {account.is_active ? 'Archive' : 'Unarchive'}
            </button>
            <button type="button" className={cx(item, 'text-red-400')} onClick={() => { setOpen(false); onDelete(); }}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Accounts() {
  const { user } = useAuth();
  const { fmt } = useUserPrefs();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adjusting, setAdjusting] = useState<Account | null>(null);
  const [allocations, setAllocations] = useState<SavingsAllocation[]>([]);
  const [lastActivity, setLastActivity] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [availableCurrencies, setAvailableCurrencies] = useState<string[]>(['USD']);
  const [formData, setFormData] = useState({
    name: '',
    type: 'checking' as Account['type'],
    balance: '0',
    currency: 'USD',
  });

  const loadAccounts = useCallback(async () => {
    if (!user) {
      setAccounts([]);
      return;
    }

    const [accountsRes, allocationsRes, lastTxRes] = await Promise.all([
      supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('savings_goal_allocations')
        .select('account_id, amount, goal_id')
        .eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('account_id, transaction_date')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false })
        .limit(1000),
    ]);

    if (accountsRes.data) {
      setAccounts(accountsRes.data);
    }
    setLoaded(true);
    if (allocationsRes.data) {
      setAllocations(allocationsRes.data as SavingsAllocation[]);
    }
    if (lastTxRes.data) {
      const map: Record<string, string> = {};
      for (const t of lastTxRes.data as { account_id: string; transaction_date: string }[]) {
        if (t.account_id && !map[t.account_id]) map[t.account_id] = t.transaction_date;
      }
      setLastActivity(map);
    }
  }, [user]);

  useEffect(() => {
    loadAccounts();
    const onChange = () => loadAccounts();
    window.addEventListener('ft-data-changed', onChange);
    return () => window.removeEventListener('ft-data-changed', onChange);
  }, [loadAccounts]);

  useEffect(() => {
    const loadCurrency = async () => {
      if (!user) {
        setAvailableCurrencies(['USD']);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('default_currency, enabled_currencies')
        .eq('id', user.id)
        .single();

      const defaultCurrency = data?.default_currency || 'USD';
      const enabled =
        (data?.enabled_currencies as string[] | null | undefined) ?? [defaultCurrency];

      const uniqueCurrencies = Array.from(new Set(enabled.length ? enabled : [defaultCurrency]));

      setAvailableCurrencies(uniqueCurrencies);

      setFormData((prev) => ({
        ...prev,
        currency: prev.currency || defaultCurrency,
      }));
    };
    loadCurrency();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (editingAccount) {
      await supabase
        .from('accounts')
        .update({
          name: formData.name,
          type: formData.type,
          balance: parseFloat(formData.balance),
          currency: formData.currency,
        })
        .eq('id', editingAccount.id);
    } else {
      await supabase.from('accounts').insert({
        user_id: user.id,
        name: formData.name,
        type: formData.type,
        balance: parseFloat(formData.balance),
        currency: formData.currency,
      });
    }

    setShowForm(false);
    setEditingAccount(null);
    setFormData({ name: '', type: 'checking', balance: '0', currency: 'USD' });
    loadAccounts();
    notifyChanged();
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      type: account.type,
      balance: account.balance.toString(),
      currency: account.currency,
    });
    setShowForm(true);
  };

  const handleToggleActive = async (account: Account) => {
    await supabase
      .from('accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id);
    loadAccounts();
    notifyChanged();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this account?')) {
      await supabase.from('accounts').delete().eq('id', id);
      loadAccounts();
      notifyChanged();
    }
  };

  const reservedByAccount = useMemo(
    () =>
      allocations.reduce<Record<string, number>>((acc, alloc) => {
        acc[alloc.account_id] = (acc[alloc.account_id] || 0) + Number(alloc.amount);
        return acc;
      }, {}),
    [allocations],
  );

  /** One section per currency; archived accounts listed last and not totalled. */
  const groups = useMemo(() => {
    const map = new Map<string, Account[]>();
    for (const a of accounts) {
      const list = map.get(a.currency) ?? [];
      list.push(a);
      map.set(a.currency, list);
    }
    return Array.from(map.entries())
      .map(([cur, rows]) => ({
        cur,
        rows: [...rows].sort((a, b) => Number(b.is_active) - Number(a.is_active)),
        total: rows.filter((a) => a.is_active).reduce((s, a) => s + Number(a.balance), 0),
      }))
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [accounts]);

  const openNewForm = () => {
    setShowForm(true);
    setEditingAccount(null);
    setFormData({ name: '', type: 'checking', balance: '0', currency: availableCurrencies[0] || 'USD' });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingAccount(null);
  };

  const addButton = (
    <Button variant="secondary" onClick={openNewForm}>
      <Plus size={16} /> Add account
    </Button>
  );

  return (
    <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 md:pb-[120px] flex flex-col gap-5 md:gap-7">
      <PageHeader
        className="hidden md:flex"
        description="Balances are kept in each account's own currency"
        actions={addButton}
      />
      <div className="md:hidden flex items-center justify-between gap-3">
        <span className="text-[13px] text-slate-400">Balances in each account's own currency</span>
        {addButton}
      </div>

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingAccount ? 'Edit account' : 'New account'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Account name</label>
              <Input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Chase Checking"
              />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <Select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as Account['type'] })}
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="credit_card">Credit Card</option>
                <option value="virtual_card">Virtual Card</option>
                <option value="cash">Cash</option>
                <option value="investment">Investment</option>
                <option value="multi_currency">Multi-currency Account</option>
                <option value="mfs">Mobile Money (MFS)</option>
              </Select>
            </div>
            <div>
              <label className={labelCls}>Balance</label>
              <Input
                type="number"
                step="0.01"
                required
                value={formData.balance}
                onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <Select
                required
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              >
                {Array.from(new Set([...availableCurrencies, formData.currency])).map((cur) => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit">{editingAccount ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      {groups.map((g) => (
        <section key={g.cur}>
          <div className="flex items-baseline justify-between pb-2 md:pb-2.5 rule-b">
            <h2 className="t-kicker !text-slate-100 md:!text-[17px] md:!font-extrabold md:!normal-case md:!tracking-normal">{g.cur}</h2>
            <span className="text-lg md:text-[22px] font-extrabold tabular-nums text-slate-100">
              {formatMoney(g.total, g.cur)}
            </span>
          </div>

          {g.rows.map((account) => {
            const reserved = reservedByAccount[account.id] || 0;
            const last = lastActivity[account.id];
            const go = () => navigate(`/accounts/${account.id}`);
            return (
              <div
                key={account.id}
                role="link"
                tabIndex={0}
                onClick={go}
                onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
                className={cx(
                  'grid items-center gap-3 min-h-[62px] row-rule hover-tint cursor-pointer',
                  'grid-cols-[38px_minmax(0,1fr)_auto_44px] md:grid-cols-[minmax(0,1.4fr)_150px_170px_170px_36px_20px]',
                  !account.is_active && 'opacity-55',
                )}
              >
                {/* Name + avatar */}
                <span className="contents md:flex md:items-center md:gap-3 md:min-w-0">
                  <Avatar name={account.name} ink size={36} className="!w-[38px] !h-[38px] md:!w-9 md:!h-9" />
                  <span className="flex flex-col leading-[1.3] min-w-0">
                    <span className="text-[15px] font-semibold text-slate-100 truncate">{account.name}</span>
                    <span className="text-xs text-slate-400 truncate">
                      <span className="md:hidden">{ACCOUNT_TYPE_LABEL[account.type]} · </span>
                      {account.currency}
                      {reserved > 0 && (
                        <> · <span className="tabular-nums">{formatMoney(reserved, account.currency)}</span> reserved for goals</>
                      )}
                      {!account.is_active && ' · Archived'}
                    </span>
                  </span>
                </span>
                <span className="hidden md:block text-[13px] text-slate-100">{ACCOUNT_TYPE_LABEL[account.type]}</span>
                <span className="hidden md:block text-[13px] text-slate-400">
                  {last ? `Last activity ${fmt(last)}` : 'No activity yet'}
                </span>
                <span className="text-right text-[15px] md:text-base font-bold tabular-nums text-slate-100">
                  {formatMoney(Number(account.balance), account.currency)}
                </span>
                <RowMenu
                  account={account}
                  onEdit={() => handleEdit(account)}
                  onAdjust={() => setAdjusting(account)}
                  onToggleActive={() => handleToggleActive(account)}
                  onDelete={() => handleDelete(account.id)}
                />
                <span className="hidden md:grid place-items-center text-slate-400">
                  <ChevronRight size={14} />
                </span>
              </div>
            );
          })}
        </section>
      ))}

      {!loaded && <ListSkeleton rows={4} />}

      {loaded && accounts.length === 0 && !showForm && (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Create your first account to get started."
          action={
            <Button onClick={openNewForm}>
              <Plus size={16} /> Add account
            </Button>
          }
        />
      )}

      <AdjustBalanceModal account={adjusting} onClose={() => setAdjusting(null)} />
    </div>
  );
}
