import { useNavigate } from 'react-router-dom';
import { cx, EmptyState, Button } from '../ui';
import { monthProgress } from '../../lib/dateUtils';
import { formatMoney } from '../../lib/money';
import type { BudgetRow } from './useBudgets';

/** Budget-vs-actual rows with a "where you should be today" marker.
 *  Used on Home (top rows), Plan › Budgets (phone) and Categories. */
export function BudgetList({
  rows,
  currency,
  limit,
  compact,
}: {
  rows: BudgetRow[];
  currency: string;
  limit?: number;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const today = monthProgress() * 100;
  const list = rows
    .filter((r) => r.budget > 0)
    .sort((a, b) => b.spent / b.budget - a.spent / a.budget)
    .slice(0, limit ?? undefined);

  if (list.length === 0) {
    return (
      <EmptyState
        title="No budgets yet"
        description="Give an expense category a monthly budget and it shows up here."
        action={<Button variant="secondary" onClick={() => navigate('/categories')}>Set budgets</Button>}
      />
    );
  }

  return (
    <div>
      {list.map((b) => {
        const pct = (b.spent / b.budget) * 100;
        const over = b.spent > b.budget;
        const ahead = !over && pct > today + 5;
        const left = b.budget - b.spent;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => navigate(`/transactions?category=${b.id}`)}
            className="w-full flex flex-col gap-[7px] py-2.5 row-rule text-left hover-tint"
          >
            <div className="flex justify-between gap-2 w-full text-sm">
              <span className="font-semibold text-slate-100 truncate">{b.name}</span>
              <span className={cx('tabular-nums', over ? 'text-red-400 font-bold' : 'text-slate-100')}>
                {formatMoney(b.spent, currency)}
                {!compact && <span className="text-slate-400 font-normal"> / {formatMoney(b.budget, currency)}</span>}
              </span>
            </div>
            <div className="relative h-1.5 w-full bg-slate-900">
              <div
                className={cx('absolute inset-y-0 left-0 transition-[width] duration-500 ease-ds', over ? 'bg-red-500' : ahead ? 'bg-blue-300' : 'bg-slate-100')}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
              <div className="absolute -top-[3px] -bottom-[3px] w-[2px] bg-slate-100" style={{ left: `${today}%` }} />
            </div>
            {compact && (
              <div className="flex justify-between w-full text-xs">
                <span className="text-slate-400 tabular-nums">of {formatMoney(b.budget, currency)}</span>
                <span className={cx('font-semibold tabular-nums', over ? 'text-red-400' : 'text-slate-300')}>
                  {over ? `${formatMoney(-left, currency)} over` : `${formatMoney(left, currency)} left`}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
