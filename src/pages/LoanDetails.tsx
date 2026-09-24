import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import type { Database } from '../lib/database.types';
import { ChevronLeft } from 'lucide-react';
import { Button, PageHeader, KpiStrip, Kpi, SectionTitle, Progress, Badge, EmptyState, Skeleton, cx } from '../components/ui';
import { formatMoney } from '../lib/money';

type Loan = Database['public']['Tables']['loans']['Row'];
type Account = Database['public']['Tables']['accounts']['Row'];
type LoanPayment = Database['public']['Tables']['loan_payments']['Row'];

export function LoanDetails() {
  const { user } = useAuth();
  const { fmt } = useUserPrefs();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loan, setLoan] = useState<Loan | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payments, setPayments] = useState<LoanPayment[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (quiet = false) => {
    if (!user || !id) {
      setLoan(null);
      setAccounts([]);
      setPayments([]);
      setLoading(false);
      return;
    }

    if (!quiet) setLoading(true);

    const [loanRes, accountsRes, paymentsRes, profileRes] = await Promise.all([
      supabase.from('loans').select('*').eq('id', id).eq('user_id', user.id).single(),
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase
        .from('loan_payments')
        .select('*')
        .eq('user_id', user.id)
        .eq('loan_id', id)
        .order('payment_date', { ascending: false }),
      supabase.from('profiles').select('default_currency').eq('id', user.id).single(),
    ]);

    setLoan(loanRes.data ?? null);
    if (accountsRes.data) setAccounts(accountsRes.data);
    if (paymentsRes.data) setPayments(paymentsRes.data);
    setDisplayCurrency(profileRes.data?.default_currency || 'USD');

    setLoading(false);
  }, [user, id]);

  useEffect(() => {
    loadData();
    const onChange = () => loadData(true);
    window.addEventListener('ft-data-changed', onChange);
    return () => window.removeEventListener('ft-data-changed', onChange);
  }, [loadData]);

  const accountsById = useMemo(
    () =>
      accounts.reduce<Record<string, Account>>((map, acc) => {
        map[acc.id] = acc;
        return map;
      }, {}),
    [accounts]
  );

  const wrapper = 'px-5 md:px-8 pt-3 md:pt-7 pb-8 md:pb-[120px] flex flex-col gap-6 md:gap-7';
  const backLink = (
    <Button variant="ghost" size="sm" onClick={() => navigate('/loans')} className="hidden md:inline-flex self-start -mb-4">
      <ChevronLeft size={16} />
      Loans
    </Button>
  );

  if (loading) {
    return (
      <div className={wrapper}>
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!loan) {
    return (
      <div className={wrapper}>
        {backLink}
        <EmptyState title="Loan not found" description="It may have been deleted." />
      </div>
    );
  }

  const cur = (loan.account_id && accountsById[loan.account_id]?.currency) || displayCurrency;
  const principal = Number(loan.principal_amount ?? 0);
  const balance = Number(loan.current_balance);
  const repaid = Math.max(0, principal - balance);
  const percentage = principal > 0 ? Math.min(100, (repaid / principal) * 100) : 0;
  const isCompleted = principal > 0 && balance <= 0;
  const owe = loan.type === 'borrowing';
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const overdue = !isCompleted && !!loan.due_date && loan.due_date < today;
  const linked = loan.account_id ? accountsById[loan.account_id] : undefined;

  return (
    <div className={wrapper}>
      {backLink}
      <PageHeader
        title={loan.name}
        description={owe ? `I owe · ${loan.lender_borrower}` : `Owed to me · ${loan.lender_borrower}`}
        actions={isCompleted ? <Badge>{owe ? 'Paid off' : 'Settled'}</Badge> : undefined}
      />

      <KpiStrip cols={3}>
        <Kpi
          label={owe ? 'Remaining' : 'Outstanding'}
          value={formatMoney(Math.max(balance, 0), cur)}
          note={isCompleted ? (owe ? 'Paid off' : 'Settled') : `of ${formatMoney(principal, cur)}`}
        />
        <Kpi label="Repaid" value={formatMoney(repaid, cur)} note={`${Math.round(percentage)}% of principal`} />
        <Kpi
          label="Due"
          value={loan.due_date ? fmt(loan.due_date) : '—'}
          note={overdue ? 'Overdue' : linked ? `Linked to ${linked.name}` : undefined}
          noteTone={overdue ? 'accent' : 'muted'}
        />
      </KpiStrip>

      <section className="flex flex-col gap-2">
        <div className="flex justify-between text-xs">
          <span className="font-semibold text-slate-100">{isCompleted ? '100% repaid' : `${percentage.toFixed(1)}% repaid`}</span>
          <span className="text-slate-400 tabular-nums">
            {formatMoney(repaid, cur)} of {formatMoney(principal, cur)}
          </span>
        </div>
        <Progress value={percentage} height={8} className="!bg-slate-800" />
      </section>

      <section>
        <SectionTitle meta={`${payments.length} ${payments.length === 1 ? 'entry' : 'entries'}`}>Payment history</SectionTitle>
        <div className="hidden md:grid grid-cols-[130px_130px_minmax(0,1fr)_150px] gap-4 pb-2 rule-b t-th">
          <span>Date</span>
          <span>Type</span>
          <span>Accounts · notes</span>
          <span className="text-right">Amount</span>
        </div>
        <div className="md:hidden rule-t" />

        {payments.map((p) => {
          const fromAcc = p.from_account_id ? accountsById[p.from_account_id] : undefined;
          const toAcc = p.to_account_id ? accountsById[p.to_account_id] : undefined;
          // Sign from the owner's point of view: money into my pocket is +.
          const signedAmount =
            p.payment_type === 'repayment'
              ? owe ? -Number(p.amount) : Number(p.amount)
              : owe ? Number(p.amount) : -Number(p.amount);
          const accountsText = [fromAcc && `From ${fromAcc.name}`, toAcc && `To ${toAcc.name}`].filter(Boolean).join(' → ');
          const detail = [accountsText, p.notes].filter(Boolean).join(' · ');
          const typeLabel = p.payment_type === 'repayment' ? 'Repayment' : 'Disbursement';
          const amount = (
            <span className={cx('text-[15px] tabular-nums text-slate-100 text-right', signedAmount > 0 ? 'font-extrabold' : 'font-normal')}>
              {formatMoney(signedAmount, cur, { sign: true })}
            </span>
          );

          return (
            <div key={p.id} className="row-rule hover-tint">
              <div className="hidden md:grid grid-cols-[130px_130px_minmax(0,1fr)_150px] gap-4 items-center min-h-[52px] py-2">
                <span className="text-[13px] text-slate-400 tabular-nums">{fmt(p.payment_date)}</span>
                <span className="text-[13px] text-slate-100">{typeLabel}</span>
                <span className="text-[13px] text-slate-400 truncate">{detail || '—'}</span>
                {amount}
              </div>
              <div className="md:hidden flex items-center justify-between gap-3 min-h-[60px] py-2">
                <span className="flex flex-col min-w-0">
                  <span className="text-[15px] font-semibold text-slate-100">{typeLabel}</span>
                  <span className="text-xs text-slate-400 truncate">
                    {fmt(p.payment_date)}
                    {detail ? ` · ${detail}` : ''}
                  </span>
                </span>
                {amount}
              </div>
            </div>
          );
        })}

        {payments.length === 0 && (
          <EmptyState title="No payments yet" description="Payments recorded from the Loans page will appear here." />
        )}
      </section>
    </div>
  );
}
