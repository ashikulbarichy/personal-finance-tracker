import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import type { Database } from '../lib/database.types';
import { ArrowLeft } from 'lucide-react';

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

  const loadData = useCallback(async () => {
    if (!user || !id) {
      setLoan(null);
      setAccounts([]);
      setPayments([]);
      setLoading(false);
      return;
    }

    setLoading(true);

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

    if (loanRes.data) setLoan(loanRes.data);
    if (accountsRes.data) setAccounts(accountsRes.data);
    if (paymentsRes.data) setPayments(paymentsRes.data);
    setDisplayCurrency(profileRes.data?.default_currency || 'USD');

    setLoading(false);
  }, [user, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const accountsById = useMemo(
    () =>
      accounts.reduce<Record<string, Account>>((map, acc) => {
        map[acc.id] = acc;
        return map;
      }, {}),
    [accounts]
  );

  if (loading) {
    return <div className="px-4 py-4 md:px-8 md:py-8 text-slate-400">Loading loan details…</div>;
  }

  if (!loan) {
    return (
      <div className="px-4 py-4 md:px-8 md:py-8">
        <button
          type="button"
          onClick={() => navigate('/loans')}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors mb-4"
        >
          <ArrowLeft size={16} className="mr-1" />
          Back to loans
        </button>
        <p className="text-slate-500">Loan not found.</p>
      </div>
    );
  }

  const principal = Number(loan.principal_amount ?? 0);
  const balance = Number(loan.current_balance);
  const repaid = Math.max(0, principal - balance);
  const percentage = principal > 0 ? (repaid / principal) * 100 : 0;
  const isCompleted = principal > 0 && balance <= 0;

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-6">
      <button
        type="button"
        onClick={() => navigate('/loans')}
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors"
      >
        <ArrowLeft size={16} className="mr-1" />
        Back to loans
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`bg-[#141927] p-6 rounded-lg border lg:col-span-1 ${isCompleted ? 'border-green-300 opacity-70' : 'border-slate-800'}`}>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className={`text-lg font-semibold ${isCompleted ? 'line-through text-slate-600' : 'text-slate-100'}`}>
              {loan.name}
            </h3>
            {isCompleted && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                Paid off
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mb-3 capitalize">
            {loan.type === 'borrowing' ? 'Borrowing (I owe)' : 'Lending (owed to me)'}
          </p>
          <div className="space-y-2 text-sm text-slate-300">
            <p>
              <span className="font-medium">
                {loan.type === 'borrowing' ? 'Lender' : 'Borrower'}:
              </span>{' '}
              {loan.lender_borrower}
            </p>
            <p>
              <span className="font-medium">Principal:</span> {displayCurrency}{' '}
              {principal.toFixed(2)}
            </p>
            <p>
              <span className="font-medium">Current Balance:</span>{' '}
              <span className={isCompleted ? 'text-emerald-400 font-semibold' : ''}>
                {isCompleted
                  ? 'Paid off'
                  : `${displayCurrency} ${balance.toFixed(2)}`}
              </span>
            </p>
            <p>
              <span className="font-medium">Interest rate:</span>{' '}
              {Number(loan.interest_rate).toFixed(2)}%
            </p>
            {loan.due_date && (
              <p>
                <span className="font-medium">Due date:</span>{' '}
                {fmt(loan.due_date)}
              </p>
            )}
          </div>
        </div>
        <div className="bg-[#141927] p-6 rounded-xl border border-slate-800 lg:col-span-2">
          <h4 className="text-sm font-semibold text-slate-100 mb-4">Repayment Progress</h4>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-800/40 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Principal</p>
              <p className="text-sm font-semibold text-slate-100">
                {displayCurrency} {principal.toFixed(2)}
              </p>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Repaid</p>
              <p className="text-sm font-semibold text-blue-700">
                {displayCurrency} {repaid.toFixed(2)}
              </p>
            </div>
            <div className={`rounded-lg p-3 text-center ${isCompleted ? 'bg-emerald-500/10' : 'bg-orange-500/10'}`}>
              <p className="text-xs text-slate-500 mb-1">Current Balance</p>
              <p className={`text-sm font-semibold ${isCompleted ? 'text-green-700' : 'text-orange-700'}`}>
                {isCompleted ? 'Paid off' : `${displayCurrency} ${balance.toFixed(2)}`}
              </p>
            </div>
          </div>

          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                isCompleted
                  ? 'bg-emerald-500/100'
                  : loan.type === 'borrowing'
                  ? 'bg-red-500/100'
                  : 'bg-blue-500/100'
              }`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>Interest: {Number(loan.interest_rate).toFixed(2)}%</span>
            <span>
              {isCompleted ? '100% — Fully paid off ✓' : `${percentage.toFixed(1)}% repaid`}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-[#141927] rounded-xl border border-slate-800">
        <div className="px-4 py-3 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100">Payment history</h3>
        </div>
        {payments.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">
            No payments recorded for this loan yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {payments.map((p) => {
              const fromAcc = p.from_account_id ? accountsById[p.from_account_id] : undefined;
              const toAcc = p.to_account_id ? accountsById[p.to_account_id] : undefined;

              const signedAmount =
                p.payment_type === 'repayment'
                  ? loan.type === 'borrowing'
                    ? -Number(p.amount)
                    : Number(p.amount)
                  : loan.type === 'borrowing'
                  ? Number(p.amount)
                  : -Number(p.amount);

              return (
                <div key={p.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-semibold ${
                          signedAmount < 0 ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        {signedAmount < 0 ? '-' : '+'}
                        {displayCurrency} {Number(p.amount).toFixed(2)}
                      </span>
                      <span className="text-[10px] uppercase text-slate-500">
                        {p.payment_type === 'repayment' ? 'Repayment' : 'Disbursement'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {fmt(p.payment_date)}
                      {fromAcc || toAcc ? ' · ' : ''}
                      {fromAcc && `From ${fromAcc.name}`}
                      {fromAcc && toAcc && ' → '}
                      {toAcc && `To ${toAcc.name}`}
                    </p>
                    {p.notes && (
                      <p className="mt-1 text-xs text-slate-500">
                        {p.notes}
                      </p>
                    )}
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

