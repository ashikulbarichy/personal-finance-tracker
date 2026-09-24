/* Recurring rules are remind-and-confirm: nothing posts on its own. Recording
 * an occurrence (from the Recurring page or the notification panel) inserts
 * the transaction and advances the rule. */
import { supabase } from './supabase';
import type { Database } from './database.types';

type Recurring = Database['public']['Tables']['recurring_transactions']['Row'];
export type Frequency = Recurring['frequency'];

/** Parse 'YYYY-MM-DD' as a local date (midnight). */
export function parseDay(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Step a date forward by `steps` cadence units. */
export function addSteps(d: Date, f: Frequency, steps: number): Date {
  const n = new Date(d);
  if (f === 'daily') n.setDate(n.getDate() + steps);
  else if (f === 'weekly') n.setDate(n.getDate() + steps * 7);
  else if (f === 'monthly') n.setMonth(n.getMonth() + steps);
  else n.setFullYear(n.getFullYear() + steps);
  return n;
}
export const advance = (d: Date, r: { frequency: Frequency; interval_count: number }) =>
  addSteps(d, r.frequency, Math.max(1, r.interval_count || 1));

/** Record one occurrence. Returns an error message, or whether the rule ended. */
export async function recordRecurring(
  rec: Recurring,
  opts: { userId: string; currency: string; timezone: string },
): Promise<{ error: string | null; ended: boolean }> {
  const { error: txErr } = await supabase.from('transactions').insert({
    user_id: opts.userId,
    account_id: rec.account_id,
    category_id: rec.category_id,
    payee_id: rec.type === 'expense' ? rec.payee_id : null,
    payer_id: rec.type === 'income' ? rec.payee_id : null,
    amount: rec.amount,
    type: rec.type,
    currency: opts.currency,
    title: rec.name,
    description: rec.description,
    transaction_date: new Date().toISOString(),
    timezone: opts.timezone,
  });
  if (txErr) return { error: txErr.message, ended: false };

  // Advance past this occurrence (and any others that were also overdue).
  const today = startOfToday();
  let next = parseDay(rec.next_date);
  do { next = advance(next, rec); } while (next <= today);
  const occurrences = rec.occurrences_count + 1;

  let active = rec.is_active;
  if (rec.end_type === 'after_occurrences' && rec.max_occurrences != null && occurrences >= rec.max_occurrences) active = false;
  if (rec.end_type === 'on_date' && rec.end_date && next > parseDay(rec.end_date)) active = false;

  await supabase.from('recurring_transactions').update({
    next_date: toISODate(next),
    occurrences_count: occurrences,
    is_active: active,
  }).eq('id', rec.id);

  window.dispatchEvent(new Event('ft-data-changed'));
  return { error: null, ended: !active };
}
