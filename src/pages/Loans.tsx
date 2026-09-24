import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { Plus, Pencil, Trash2, Banknote, ChevronRight, X, Landmark } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Database } from '../lib/database.types';
import {
  Button, IconButton, PageHeader, Input, Select, Modal, EmptyState, ListSkeleton, Badge, Avatar, KpiStrip, Kpi,
  SegmentedControl, Progress, burst, fieldCls, labelCls, cx, useToast,
} from '../components/ui';
import { formatMoney, currencySymbol } from '../lib/money';

type Loan = Database['public']['Tables']['loans']['Row'];
type Account = Database['public']['Tables']['accounts']['Row'];
type LoanPayment = Database['public']['Tables']['loan_payments']['Row'];

interface LoanWithAccount extends Loan {
  accounts: { name: string; currency: string } | null;
}

type Direction = 'owe' | 'lent';

const notifyChanged = () => window.dispatchEvent(new Event('ft-data-changed'));

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Sum balances per currency → [['BDT', 1200], ['USD', 40]] (largest group first). */
function perCurrency(items: { cur: string; amount: number }[]) {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.cur, (m.get(i.cur) ?? 0) + i.amount);
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

export function Loans() {
  const { user } = useAuth();
  const toast = useToast();
  const { fmt } = useUserPrefs();
  const navigate = useNavigate();
  const [loans, setLoans] = useState<LoanWithAccount[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payments, setPayments] = useState<LoanPayment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [payees, setPayees] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState<Direction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<Loan | null>(null);
  const [repayId, setRepayId] = useState<string | null>(null);
  const [repayVal, setRepayVal] = useState('');
  const [savingRepay, setSavingRepay] = useState(false);
  const emptyPaymentForm = () => ({
    amount: '',
    from_account_id: '',
    to_account_id: '',
    payment_type: 'repayment' as 'disbursement' | 'repayment',
    notes: '',
    payment_date: new Date().toISOString().slice(0, 16),
  });
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [formData, setFormData] = useState({
    name: '',
    type: 'borrowing' as Loan['type'],
    principal_amount: '',
    current_balance: '',
    lender_borrower: '',
    due_date: '',
    account_id: '',
  });

  const loadData = useCallback(async () => {
    if (!user) {
      setLoans([]);
      setAccounts([]);
      return;
    }

    const [loansRes, accountsRes, paymentsRes, payeesRes] = await Promise.all([
      supabase
        .from('loans')
        .select('*, accounts(name, currency)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase
        .from('loan_payments')
        .select('*')
        .eq('user_id', user.id)
        .order('payment_date', { ascending: false }),
      supabase.from('payees').select('id, name').eq('user_id', user.id).order('name'),
    ]);
    setPayees(payeesRes.data ?? []);

    if (loansRes.data) setLoans(loansRes.data as LoanWithAccount[]);
    if (accountsRes.data) setAccounts(accountsRes.data);
    if (paymentsRes.data) setPayments(paymentsRes.data);
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    loadData();
    const onChange = () => loadData();
    window.addEventListener('ft-data-changed', onChange);
    return () => window.removeEventListener('ft-data-changed', onChange);
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const principal = parseFloat(formData.principal_amount);

    // Link the loan to a payee (existing by name, or a new one), so everything
    // with this person — payments and loans — shows up under them.
    const who = formData.lender_borrower.trim();
    let payeeId = payees.find((p) => p.name.trim().toLowerCase() === who.toLowerCase())?.id ?? null;
    if (!payeeId && who) {
      const { data: created } = await supabase.from('payees').insert({ user_id: user.id, name: who }).select('id').single();
      payeeId = created?.id ?? null;
    }

    const loanData = {
      user_id: user.id,
      name: formData.name,
      type: formData.type,
      principal_amount: principal,
      // New loans start with current_balance = principal (full amount owed/outstanding).
      // Only repayment payments reduce this balance toward 0 (paid off).
      current_balance: editingLoan
        ? parseFloat(formData.current_balance || formData.principal_amount)
        : principal,
      lender_borrower: who,
      payee_id: payeeId,
      due_date: formData.due_date || null,
      account_id: formData.account_id || null,
    };

    if (editingLoan) {
      await supabase.from('loans').update(loanData).eq('id', editingLoan.id);
    } else {
      const { data: insertedLoan } = await supabase
        .from('loans')
        .insert(loanData)
        .select('*')
        .single();

      // Create initial disbursement to set balance and adjust accounts
      if (insertedLoan && insertedLoan.account_id) {
        await supabase.from('loan_payments').insert({
          user_id: insertedLoan.user_id,
          loan_id: insertedLoan.id,
          from_account_id: insertedLoan.type === 'lending' ? insertedLoan.account_id : null,
          to_account_id: insertedLoan.type === 'borrowing' ? insertedLoan.account_id : null,
          amount: principal,
          payment_type: 'disbursement',
          payment_date: new Date().toISOString(),
          notes: 'Initial loan disbursement',
        });
      }
    }

    setShowForm(false);
    setEditingLoan(null);
    resetForm();
    loadData();
    notifyChanged();
  };

  const handlePayment = async () => {
    if (!user || !showPaymentModal || !paymentForm.amount) return;

    const amount = parseFloat(paymentForm.amount);
    if (!amount || Number.isNaN(amount)) return;

    const loan = showPaymentModal;
    const { error: payErr } = await supabase.from('loan_payments').insert({
      user_id: user.id,
      loan_id: showPaymentModal.id,
      from_account_id: paymentForm.from_account_id || null,
      to_account_id: paymentForm.to_account_id || null,
      amount,
      payment_type: paymentForm.payment_type,
      payment_date: paymentForm.payment_date,
      notes: paymentForm.notes || null,
    });

    setShowPaymentModal(null);
    setPaymentForm(emptyPaymentForm());
    loadData();
    notifyChanged();

    // A whole debt closed is the "small win" worth celebrating.
    if (!payErr && loan.type === 'borrowing' && paymentForm.payment_type === 'repayment'
        && amount >= Number(loan.current_balance) - 0.005 && Number(loan.current_balance) > 0) {
      const left = loans.filter((l) => l.type === 'borrowing' && l.id !== loan.id && Number(l.current_balance) > 0).length;
      burst();
      toast.show(left ? `${loan.name} is paid off! ${left} to go — roll that payment into the next one.` : 'Your last debt is paid off. You’re debt-free!');
    }
  };

  /** Inline "Record repayment" on an owed-to-me card: a repayment received
   *  into the loan's linked account (mirrors the initial disbursement). */
  const handleInlineRepayment = async (loan: Loan) => {
    if (!user) return;
    const amount = parseFloat(repayVal);
    if (!amount || Number.isNaN(amount) || amount <= 0) return;
    setSavingRepay(true);
    await supabase.from('loan_payments').insert({
      user_id: user.id,
      loan_id: loan.id,
      from_account_id: null,
      to_account_id: loan.account_id || null,
      amount,
      payment_type: 'repayment',
      payment_date: new Date().toISOString(),
      notes: null,
    });
    setSavingRepay(false);
    setRepayId(null);
    setRepayVal('');
    loadData();
    notifyChanged();
  };

  const openPayment = (loan: Loan) => {
    setPaymentForm({
      ...emptyPaymentForm(),
      // Pre-fill the side of the payment that the linked account usually plays.
      from_account_id: loan.type === 'borrowing' ? loan.account_id || '' : '',
      to_account_id: loan.type === 'lending' ? loan.account_id || '' : '',
    });
    setShowPaymentModal(loan);
  };

  const closePayment = () => {
    setShowPaymentModal(null);
    setPaymentForm(emptyPaymentForm());
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: tab === 'lent' ? 'lending' : 'borrowing',
      principal_amount: '',
      current_balance: '',
        lender_borrower: '',
      due_date: '',
      account_id: '',
    });
  };

  const openNew = () => {
    setShowForm(true);
    setEditingLoan(null);
    resetForm();
  };

  const handleEdit = (loan: Loan) => {
    setEditingLoan(loan);
    setFormData({
      name: loan.name,
      type: loan.type,
      principal_amount: loan.principal_amount.toString(),
      current_balance: loan.current_balance.toString(),
      lender_borrower: loan.lender_borrower,
      due_date: loan.due_date || '',
      account_id: loan.account_id || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this loan?')) {
      await supabase.from('loans').delete().eq('id', id);
      loadData();
      notifyChanged();
    }
  };

  const [displayCurrency, setDisplayCurrency] = useState('USD');

  useEffect(() => {
    const loadCurrency = async () => {
      if (!user) {
        setDisplayCurrency('USD');
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('default_currency')
        .eq('id', user.id)
        .single();
      setDisplayCurrency(data?.default_currency || 'USD');
    };
    loadCurrency();
  }, [user]);

  const curOf = useCallback(
    (loan: LoanWithAccount) => loan.accounts?.currency || displayCurrency,
    [displayCurrency],
  );

  const lastPaymentByLoan = useMemo(() => {
    const m: Record<string, LoanPayment> = {};
    for (const p of payments) if (p.payment_type === 'repayment' && !m[p.loan_id]) m[p.loan_id] = p;
    return m;
  }, [payments]);

  const owe = loans.filter((l) => l.type === 'borrowing');
  const lent = loans.filter((l) => l.type === 'lending');
  const active: Direction = tab ?? (owe.length === 0 && lent.length > 0 ? 'lent' : 'owe');
  const today = localToday();

  const isOpen = (l: Loan) => Number(l.current_balance) > 0;

  /* ---- I owe summary ---- */
  const owedTotals = perCurrency(owe.filter(isOpen).map((l) => ({ cur: curOf(l), amount: Number(l.current_balance) })));
  const repaidTotals = perCurrency(
    owe.map((l) => ({ cur: curOf(l), amount: Math.max(0, Number(l.principal_amount ?? 0) - Number(l.current_balance)) })),
  );
  const nextDueLoan = owe
    .filter((l) => isOpen(l) && l.due_date)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0];

  /* ---- Owed to me summary ---- */
  const lentTotals = perCurrency(lent.filter(isOpen).map((l) => ({ cur: curOf(l), amount: Number(l.current_balance) })));
  const people = new Set(lent.filter(isOpen).map((l) => l.lender_borrower.trim().toLowerCase())).size;

  const moneyList = (totals: [string, number][]) =>
    totals.length === 0 ? formatMoney(0, displayCurrency) : formatMoney(totals[0][1], totals[0][0]);
  const moneyRest = (totals: [string, number][]) =>
    totals.length > 1 ? (
      <span className="tabular-nums">+ {totals.slice(1).map(([c, v]) => formatMoney(v, c)).join(' · ')}</span>
    ) : undefined;

  const list = active === 'owe' ? owe : lent;

  const segmented = (stretch?: boolean) => (
    <SegmentedControl
      stretch={stretch}
      options={[{ value: 'owe', label: 'I owe' }, { value: 'lent', label: 'Owed to me' }]}
      value={active}
      onChange={(v) => { setTab(v); setRepayId(null); }}
      className={stretch ? '[&>button]:h-10 [&>button]:text-sm' : undefined}
    />
  );

  const cardActions = (loan: LoanWithAccount) => (
    <div className="flex items-center -mr-2 -mt-1.5 shrink-0">
      {loan.type === 'lending' && isOpen(loan) && (
        <IconButton bordered={false} aria-label="Record a payment with details" title="Record payment…" onClick={() => openPayment(loan)} className="w-11 h-11 md:w-9 md:h-9 text-slate-400">
          <Banknote size={16} />
        </IconButton>
      )}
      <IconButton bordered={false} aria-label="Edit loan" onClick={() => handleEdit(loan)} className="w-11 h-11 md:w-9 md:h-9 text-slate-400">
        <Pencil size={15} />
      </IconButton>
      <IconButton bordered={false} aria-label="Delete loan" onClick={() => handleDelete(loan.id)} className="w-11 h-11 md:w-9 md:h-9 text-slate-400 hover:text-red-400">
        <Trash2 size={15} />
      </IconButton>
      <IconButton bordered={false} aria-label="Open loan" onClick={() => navigate(`/loans/${loan.id}`)} className="w-11 h-11 md:w-9 md:h-9 text-slate-400">
        <ChevronRight size={16} />
      </IconButton>
    </div>
  );

  return (
    <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 md:pb-[120px] flex flex-col gap-5 md:gap-6">
      <PageHeader
        className="hidden md:flex"
        description="Money you owe and money owed to you"
        actions={
          <>
            {segmented()}
            <Button variant="secondary" onClick={openNew}>
              <Plus size={16} /> Add loan
            </Button>
          </>
        }
      />
      <div className="md:hidden flex flex-col gap-3">
        {segmented(true)}
      </div>

      {/* ---- Summary strip ---- */}
      {active === 'owe' ? (
        <>
          <KpiStrip cols={3} className="hidden md:grid">
            <Kpi label="Total owed" value={moneyList(owedTotals)} note={moneyRest(owedTotals)} />
            <Kpi label="Repaid so far" value={moneyList(repaidTotals)} note={moneyRest(repaidTotals)} />
            <Kpi
              label="Next due"
              value={nextDueLoan ? fmt(nextDueLoan.due_date) : '—'}
              note={nextDueLoan ? (nextDueLoan.due_date! < today ? `Overdue · ${nextDueLoan.name}` : nextDueLoan.name) : 'No due dates set'}
              noteTone={nextDueLoan && nextDueLoan.due_date! < today ? 'accent' : 'muted'}
            />
          </KpiStrip>
          <div className="md:hidden flex items-baseline justify-between gap-3 pb-2.5 rule-b">
            <span className="text-[13px] text-slate-400">Total owed</span>
            <span className="flex flex-col items-end">
              <span className="text-[22px] font-extrabold tabular-nums text-slate-100">{moneyList(owedTotals)}</span>
              {owedTotals.length > 1 && <span className="text-xs text-slate-400">{moneyRest(owedTotals)}</span>}
            </span>
          </div>
        </>
      ) : (
        <>
          <KpiStrip cols={lentTotals.length >= 3 ? 4 : lentTotals.length === 2 ? 3 : 2} className="hidden md:grid">
            {(lentTotals.length ? lentTotals.slice(0, 3) : [[displayCurrency, 0] as [string, number]]).map(([c, v]) => (
              <Kpi key={c} label={`Owed to you · ${c}`} value={formatMoney(v, c)} />
            ))}
            <Kpi label="Outstanding with" value={`${people} ${people === 1 ? 'person' : 'people'}`} />
          </KpiStrip>
          <div className="md:hidden grid grid-cols-2 rule-t rule-b">
            {(lentTotals.length ? lentTotals.slice(0, 2) : [[displayCurrency, 0] as [string, number]]).map(([c, v], i) => (
              <div key={c} className={cx('py-3', i === 0 ? 'pr-3 rule-r' : 'pl-3.5')}>
                <div className="t-th">{c}</div>
                <div className="text-xl font-extrabold tabular-nums text-slate-100">{formatMoney(v, c)}</div>
              </div>
            ))}
            {lentTotals.length < 2 && (
              <div className="py-3 pl-3.5">
                <div className="t-th">People</div>
                <div className="text-xl font-extrabold text-slate-100">{people}</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ---- Cards ---- */}
      {list.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
          {list.map((loan) => {
            const cur = curOf(loan);
            const principal = Number(loan.principal_amount ?? 0);
            const balance = Number(loan.current_balance);
            const repaid = Math.max(0, principal - balance);
            const pct = principal > 0 ? Math.min(100, (repaid / principal) * 100) : 0;
            const settled = principal > 0 && balance <= 0;
            const overdue = !settled && !!loan.due_date && loan.due_date < today;
            const pctLabel = settled ? '100% repaid' : `${Math.round(pct)}% repaid`;
            const lastPay = lastPaymentByLoan[loan.id];

            if (loan.type === 'borrowing') {
              const meta: { k: string; v: string }[] = [
                { k: 'Borrowed', v: formatMoney(principal, cur) },
                { k: 'Repaid', v: formatMoney(repaid, cur) },
                { k: 'Due', v: loan.due_date ? fmt(loan.due_date) : '—' },
                { k: 'Last payment', v: lastPay ? fmt(lastPay.payment_date) : '—' },
              ];
              return (
                <div key={loan.id} className={cx('bg-surface p-4 md:p-[22px] flex flex-col gap-2.5 md:gap-4', settled && 'opacity-70')}>
                  <div className="flex justify-between items-start gap-3">
                    <button type="button" onClick={() => navigate(`/loans/${loan.id}`)} className="text-left min-w-0">
                      <div className="text-[11px] tracking-[0.1em] uppercase font-semibold text-blue-400 mb-1">
                        Money you owe
                      </div>
                      <div className="text-[17px] md:text-[19px] font-extrabold text-slate-100 truncate hover:underline">{loan.name}</div>
                      <div className="text-[13px] text-slate-400 truncate">{loan.lender_borrower}</div>
                    </button>
                    {cardActions(loan)}
                  </div>
                  <div>
                    <div className="text-[26px] md:text-[30px] font-extrabold tracking-[-0.02em] tabular-nums text-slate-100 leading-tight">
                      {settled ? formatMoney(0, cur) : formatMoney(balance, cur)}
                    </div>
                    <div className="hidden md:block text-[13px] text-slate-400">
                      {settled ? 'Paid off' : <>left of <span className="tabular-nums">{formatMoney(principal, cur)}</span></>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Progress value={pct} height={8} className="!bg-slate-800" />
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-100">{pctLabel}</span>
                      <span className={cx('md:hidden', overdue ? 'text-red-400' : 'text-slate-400')}>
                        {settled ? 'Paid off' : loan.due_date ? `${overdue ? 'Overdue' : 'Due'} ${fmt(loan.due_date)}` : ''}
                      </span>
                      {overdue && <span className="hidden md:inline text-red-400 font-semibold">Overdue</span>}
                    </div>
                  </div>
                  <div className="hidden md:grid grid-cols-2 rule-t">
                    {meta.map((m) => (
                      <div key={m.k} className="py-2.5 border-b border-slate-700 flex flex-col">
                        <span className="text-xs text-slate-400">{m.k}</span>
                        <span className={cx('text-sm font-semibold text-slate-100', m.k === 'Principal' && 'tabular-nums')}>{m.v}</span>
                      </div>
                    ))}
                  </div>
                  {settled ? (
                    <Badge className="self-start bg-slate-900 text-slate-300 inline-flex items-center gap-1 px-2 py-[3px] text-[11px] font-semibold">Paid off</Badge>
                  ) : (
                    <Button onClick={() => openPayment(loan)} className="self-stretch md:self-start !justify-start h-11 md:h-9">
                      Record payment
                    </Button>
                  )}
                </div>
              );
            }

            /* ---- Owed to me: person card ---- */
            const inlineOpen = repayId === loan.id;
            return (
              <div key={loan.id} className={cx('bg-surface p-4 md:p-[22px] flex flex-col gap-2.5 md:gap-4', settled && 'opacity-80')}>
                <div className="flex justify-between items-start gap-3">
                  <button type="button" onClick={() => navigate(`/loans/${loan.id}`)} className="flex items-center gap-3 text-left min-w-0">
                    <Avatar name={loan.lender_borrower} ink size={40} className="hidden md:grid" />
                    <span className="min-w-0">
                      <span className="block text-[17px] md:text-lg font-extrabold text-slate-100 truncate hover:underline">{loan.lender_borrower}</span>
                      <span className="hidden md:block text-[13px] text-slate-400 truncate">{loan.name}</span>
                    </span>
                  </button>
                  {cardActions(loan)}
                </div>
                <div>
                  <div className="text-[26px] md:text-[30px] font-extrabold tracking-[-0.02em] tabular-nums text-slate-100 leading-tight">
                    {formatMoney(Math.max(balance, 0), cur)}
                  </div>
                  <div className="hidden md:block text-[13px] text-slate-400">
                    {settled ? 'Fully repaid' : <>outstanding of <span className="tabular-nums">{formatMoney(principal, cur)}</span> lent</>}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Progress value={pct} height={8} className="!bg-slate-800" />
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-100">
                      {pctLabel}
                      <span className="md:hidden font-normal text-slate-400"> · {loan.name}</span>
                    </span>
                    <span className={cx(overdue ? 'text-red-400 font-semibold' : 'text-slate-400', 'text-right')}>
                      {settled ? '' : loan.due_date ? `${overdue ? 'Overdue since' : 'Due'} ${fmt(loan.due_date)}` : 'No due date'}
                    </span>
                  </div>
                </div>
                {settled ? (
                  <Badge className="self-start bg-slate-900 text-slate-300 inline-flex items-center gap-1 px-2 py-[3px] text-[11px] font-semibold">Settled</Badge>
                ) : inlineOpen ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => { e.preventDefault(); handleInlineRepayment(loan); }}
                  >
                    <div className="relative flex-1 min-w-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                        {currencySymbol(cur).trim()}
                      </span>
                      <input
                        autoFocus
                        inputMode="decimal"
                        type="number"
                        step="0.01"
                        min="0"
                        value={repayVal}
                        onChange={(e) => setRepayVal(e.target.value)}
                        placeholder="Amount received"
                        className={cx(fieldCls, 'pl-8 h-11 md:h-9 tabular-nums')}
                      />
                    </div>
                    <Button type="submit" disabled={savingRepay || !repayVal} className="h-11 md:h-9">Save</Button>
                    <Button variant="secondary" className="hidden md:inline-flex" onClick={() => { setRepayId(null); setRepayVal(''); }}>Cancel</Button>
                    <IconButton aria-label="Cancel" className="md:hidden w-11 h-11" onClick={() => { setRepayId(null); setRepayVal(''); }}>
                      <X size={16} />
                    </IconButton>
                  </form>
                ) : (
                  <Button onClick={() => { setRepayId(loan.id); setRepayVal(''); }} className="self-stretch md:self-start !justify-start h-11 md:h-9">
                    Record repayment
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loaded && <ListSkeleton rows={3} />}

      {loaded && list.length === 0 && (
        <EmptyState
          icon={Landmark}
          title={active === 'owe' ? 'You don’t owe anyone' : 'Nobody owes you'}
          description={active === 'owe' ? 'Add a loan you’ve taken to track what’s left to repay.' : 'Add money you’ve lent to track repayments.'}
          action={
            <Button onClick={openNew}>
              <Plus size={16} /> Add loan
            </Button>
          }
        />
      )}

      {list.length > 0 && (
        <div className="md:hidden">
          <Button variant="secondary" block size="lg" onClick={openNew}>
            <Plus size={16} /> Add loan
          </Button>
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingLoan(null);
        }}
        title={editingLoan ? 'Edit loan' : 'New loan'}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Loan name</label>
              <Input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Personal Loan"
              />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <Select
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value as Loan['type'] })
                }
              >
                <option value="borrowing">Borrowing (I owe)</option>
                <option value="lending">Lending (Owed to me)</option>
              </Select>
            </div>
            <div>
              <label className={labelCls}>Principal amount</label>
              <Input
                type="number"
                step="0.01"
                required
                value={formData.principal_amount}
                onChange={(e) => setFormData({ ...formData, principal_amount: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Current balance</label>
              <Input
                type="number"
                step="0.01"
                required
                value={formData.current_balance}
                onChange={(e) => setFormData({ ...formData, current_balance: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>
                {formData.type === 'borrowing' ? 'Lender' : 'Borrower'}
              </label>
              <Input
                type="text"
                required
                list="loan-payees"
                value={formData.lender_borrower}
                onChange={(e) => setFormData({ ...formData, lender_borrower: e.target.value })}
                placeholder="Pick a payee or type a new name"
              />
              <datalist id="loan-payees">
                {payees.map((p) => <option key={p.id} value={p.name} />)}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Due date (optional)</label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Account (optional)</label>
              <Select
                value={formData.account_id}
                onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
              >
                <option value="">No account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                setEditingLoan(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit">{editingLoan ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!showPaymentModal}
        onClose={closePayment}
        title={showPaymentModal ? `Record payment · ${showPaymentModal.name}` : 'Record payment'}
        maxWidth="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={closePayment}>
              Cancel
            </Button>
            <Button onClick={handlePayment}>Record payment</Button>
          </>
        }
      >
        {showPaymentModal && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Payment amount</label>
              <Input
                type="number"
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="Enter payment amount"
              />
            </div>
            <div>
              <label className={labelCls}>Payment type</label>
              <Select
                value={paymentForm.payment_type}
                onChange={(e) =>
                  setPaymentForm((f) => ({
                    ...f,
                    payment_type: e.target.value as 'disbursement' | 'repayment',
                  }))
                }
              >
                <option value="repayment">
                  {showPaymentModal.type === 'borrowing'
                    ? 'Repayment (I pay back)'
                    : 'Repayment received'}
                </option>
                <option value="disbursement">
                  {showPaymentModal.type === 'borrowing'
                    ? 'Money received (borrow more)'
                    : 'Money lent out'}
                </option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>
                  {showPaymentModal.type === 'borrowing'
                    ? paymentForm.payment_type === 'repayment'
                      ? 'From account (I pay with)'
                      : 'From account (optional)'
                    : paymentForm.payment_type === 'repayment'
                    ? 'From account (optional)'
                    : 'From account (I lend from)'}
                </label>
                <Select
                  value={paymentForm.from_account_id}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, from_account_id: e.target.value }))}
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={labelCls}>
                  {showPaymentModal.type === 'borrowing'
                    ? paymentForm.payment_type === 'repayment'
                      ? 'To account (optional)'
                      : 'To account (I receive to)'
                    : paymentForm.payment_type === 'repayment'
                    ? 'To account (I receive to)'
                    : 'To account (optional)'}
                </label>
                <Select
                  value={paymentForm.to_account_id}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, to_account_id: e.target.value }))}
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Payment date</label>
              <Input
                type="datetime-local"
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm((f) => ({ ...f, payment_date: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <textarea
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className={fieldCls}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
