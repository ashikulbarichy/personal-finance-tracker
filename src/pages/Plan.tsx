import { useState } from 'react';
import { SegmentedControl } from '../components/ui';
import { BudgetList } from '../components/budgets/BudgetList';
import { useBudgets } from '../components/budgets/useBudgets';
import { SavingsGoals } from './SavingsGoals';

/** Phone "Plan" tab — Budgets | Goals. (On the web these live on
 *  Categories and Goals.) */
export function PlanPage() {
  const [tab, setTab] = useState<'budgets' | 'goals'>('budgets');
  const { rows, currency } = useBudgets();

  return (
    <div className="px-5 md:px-8 pt-3 md:pt-7 pb-7 flex flex-col gap-4 max-w-3xl">
      <h1 className="text-[28px] md:text-[32px] font-extrabold tracking-[-0.02em] text-slate-100">Plan</h1>
      <SegmentedControl
        stretch
        options={[{ value: 'budgets', label: 'Budgets' }, { value: 'goals', label: 'Goals' }]}
        value={tab}
        onChange={setTab}
        className="[&>button]:h-10 [&>button]:text-sm"
      />
      {tab === 'budgets' ? (
        <div className="rule-t">
          <div className="text-xs text-slate-400 py-2.5 flex items-center gap-1.5">
            <span className="w-[2px] h-2.5 bg-slate-100" />Where you should be today
          </div>
          <BudgetList rows={rows} currency={currency} compact />
        </div>
      ) : (
        <SavingsGoals embedded />
      )}
    </div>
  );
}
