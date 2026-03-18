/**
 * refresh-rates Edge Function
 *
 * Called hourly by the Supabase cron job.
 * Fetches latest rates from the free, no-auth API:
 * https://github.com/fawazahmed0/exchange-api
 *
 * No API key required.
 *
 * Optional env vars:
 *   RATES_CURRENCIES     – comma-separated list of base currencies to refresh
 *                          e.g. "USD,AUD,BDT"  (default: "USD")
 *   RATES_BASE_CURRENCY  – single base currency (legacy fallback, ignored when
 *                          RATES_CURRENCIES is set)
 */
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function fetchFromProvider(base: string): Promise<Record<string, number>> {
  const baseL = base.toLowerCase();
  const primaryUrl  = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${baseL}.json`;
  const fallbackUrl = `https://latest.currency-api.pages.dev/v1/currencies/${baseL}.json`;

  let resp = await fetch(primaryUrl).catch(() => null);
  if (!resp?.ok) {
    resp = await fetch(fallbackUrl).catch(() => null);
  }
  if (!resp?.ok) throw new Error(`Provider failed for ${base} (${resp?.status ?? 'network error'})`);

  const data = await resp.json() as Record<string, unknown>;
  const ratesRaw = data[baseL] as Record<string, number> | undefined;
  if (!ratesRaw || typeof ratesRaw !== 'object') throw new Error('Unexpected provider response shape');

  const rates: Record<string, number> = {};
  for (const [k, v] of Object.entries(ratesRaw)) {
    if (typeof v === 'number') rates[k.toUpperCase()] = v;
  }
  return rates;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const SUPABASE_URL              = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: 'Missing server env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
  }

  // Build list of currencies to refresh
  const currenciesEnv = Deno.env.get('RATES_CURRENCIES') ?? Deno.env.get('RATES_BASE_CURRENCY') ?? 'USD';
  const currencies = currenciesEnv
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    // deduplicate
    .filter((c, i, arr) => arr.indexOf(c) === i);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now       = new Date();
  const fetchedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  const results: Array<{ base: string; ok: boolean; count?: number; error?: string }> = [];

  for (const base_currency of currencies) {
    try {
      const rates = await fetchFromProvider(base_currency);

      const { error: upsertErr } = await supabase.from('exchange_rates').upsert({
        base_currency,
        rates,
        provider:   'fawazahmed0/exchange-api',
        fetched_at: fetchedAt,
        expires_at: expiresAt,
      });

      if (upsertErr) {
        results.push({ base: base_currency, ok: false, error: upsertErr.message });
      } else {
        results.push({ base: base_currency, ok: true, count: Object.keys(rates).length });
      }
    } catch (e) {
      results.push({ base: base_currency, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const allOk = results.every((r) => r.ok);

  return json(allOk ? 200 : 207, {
    ok:         allOk,
    fetched_at: fetchedAt,
    expires_at: expiresAt,
    provider:   'fawazahmed0/exchange-api',
    results,
  });
});
