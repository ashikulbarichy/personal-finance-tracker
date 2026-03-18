import { supabase } from './supabase';

export type LiveRatesResponse = {
  base_currency: string;
  provider: string;
  fetched_at: string;
  expires_at: string;
  rates: Record<string, number>;
  cached?: boolean;
  stale?: boolean;
};

const DEFAULT_BASE = (import.meta.env.VITE_RATES_BASE || 'USD').toString().toUpperCase();
const STORAGE_KEY = 'fin_live_rates_v1';

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

export function getBaseCurrency(): string {
  return DEFAULT_BASE || 'USD';
}

export async function fetchLiveRates(opts?: {
  base_currency?: string;
  force?: boolean;
  allowCache?: boolean;
}): Promise<LiveRatesResponse> {
  const base_currency = (opts?.base_currency || DEFAULT_BASE || 'USD').toUpperCase();
  const force = Boolean(opts?.force);
  const allowCache = opts?.allowCache !== false;

  // Check localStorage first (fast path)
  if (allowCache && !force) {
    const cached = safeParse<Record<string, LiveRatesResponse>>(localStorage.getItem(STORAGE_KEY));
    const hit = cached?.[base_currency];
    if (hit) {
      const expires = new Date(hit.expires_at).getTime();
      if (Number.isFinite(expires) && expires > Date.now()) return hit;
    }
  }

  // Call Edge Function (no currencies filter – free plan fetches all)
  const { data, error } = await supabase.functions.invoke<LiveRatesResponse>('rates', {
    body: { base_currency, force },
  });

  if (error) throw error;
  if (!data) throw new Error('No rates returned from Edge Function');

  // Mirror to localStorage for instant startup on next load
  try {
    const existing = safeParse<Record<string, LiveRatesResponse>>(localStorage.getItem(STORAGE_KEY)) ?? {};
    existing[base_currency] = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch { /* ignore quota errors */ }

  return data;
}

/**
 * Convert an amount between two currencies using a single base.
 * Formula: A→B = amount × (rate[B] / rate[A])  (when base is neither A nor B)
 */
export function convertWithBase(params: {
  amount: number;
  from: string;
  to: string;
  base_currency: string;
  rates: Record<string, number>;
}): number {
  const { amount } = params;
  const from = params.from.toUpperCase();
  const to   = params.to.toUpperCase();
  const base = params.base_currency.toUpperCase();
  const rates = params.rates;

  if (!amount || from === to) return amount;

  if (from === base) {
    const r = rates[to];
    return typeof r === 'number' ? amount * r : amount;
  }
  if (to === base) {
    const r = rates[from];
    return typeof r === 'number' ? amount / r : amount;
  }
  // Cross-rate via base
  const rFrom = rates[from];
  const rTo   = rates[to];
  if (typeof rFrom !== 'number' || typeof rTo !== 'number') return amount;
  return amount * (rTo / rFrom);
}
