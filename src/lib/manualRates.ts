/* ============================================================================
 * Manual exchange rates (user-defined)
 * ----------------------------------------------------------------------------
 * The user sets the value of each currency themselves. Rates are expressed as:
 *   "1 unit of <currency> = <rate> units of the default currency"
 * So the default currency always has an implicit rate of 1.
 *
 * The source of truth is profiles.manual_rates, so every device sees the same
 * rates. localStorage keeps a per-user copy so reads stay synchronous; it is
 * refreshed from the profile on every app load (syncManualRates).
 * ========================================================================= */

import { supabase } from './supabase';

export type ManualRates = Record<string, number>;

const keyFor = (userId: string | undefined) => `ft-manual-rates:${userId ?? 'anon'}`;

export function loadManualRates(userId: string | undefined): ManualRates {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(userId: string | undefined, rates: ManualRates) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(rates));
  } catch {
    /* ignore */
  }
}

/** Save locally (instant) and to the profile (synced). Resolves to an error message or null. */
export async function saveManualRates(userId: string | undefined, rates: ManualRates): Promise<string | null> {
  writeCache(userId, rates);
  if (!userId) return null;
  const { error } = await supabase.from('profiles').update({ manual_rates: rates }).eq('id', userId);
  return error ? error.message : null;
}

const clean = (v: unknown): ManualRates => {
  const out: ManualRates = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    Object.entries(v as Record<string, unknown>).forEach(([k, n]) => {
      const x = Number(n);
      if (Number.isFinite(x) && x > 0) out[k] = x;
    });
  }
  return out;
};

/**
 * Reconcile with the profile's rates on app load. The profile wins; if it has
 * none yet but this device does (rates set before syncing existed), upload
 * them once. Returns true when the local copy changed.
 */
export function syncManualRates(userId: string, fromProfile: unknown): boolean {
  const remote = clean(fromProfile);
  const local = loadManualRates(userId);
  if (Object.keys(remote).length === 0) {
    if (Object.keys(local).length > 0) void saveManualRates(userId, local);
    return false;
  }
  if (JSON.stringify(remote) === JSON.stringify(local)) return false;
  writeCache(userId, remote);
  return true;
}

/**
 * Convert an amount between two currencies using the user's manual rates,
 * with `defaultCurrency` as the pivot (rate 1). Returns the input amount
 * unchanged if a needed rate is missing.
 */
export function convertManual(
  amount: number,
  from: string,
  to: string,
  defaultCurrency: string,
  rates: ManualRates,
): number {
  if (from === to) return amount;
  const rateOf = (code: string) => (code === defaultCurrency ? 1 : rates[code]);
  const rFrom = rateOf(from);
  const rTo = rateOf(to);
  if (!rFrom || !rTo) return amount;
  // amount(from) → default → to
  const inDefault = amount * rFrom;
  return inDefault / rTo;
}
