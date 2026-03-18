/**
 * rates Edge Function
 *
 * Read-through cache for exchange rates using the free, no-auth API:
 * https://github.com/fawazahmed0/exchange-api
 *
 * Primary URL:  https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/{base}.json
 * Fallback URL: https://latest.currency-api.pages.dev/v1/currencies/{base}.json
 *
 * No API key required.
 */
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

type RatesRow = {
  base_currency: string;
  rates: Record<string, number>;
  provider: string;
  fetched_at: string;
  expires_at: string;
};

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
  if (!resp?.ok) throw new Error(`Provider failed (${resp?.status ?? 'network error'})`);

  // Response shape: { "date": "...", "usd": { "eur": 0.92, ... } }
  const data = await resp.json() as Record<string, unknown>;
  const ratesRaw = data[baseL] as Record<string, number> | undefined;
  if (!ratesRaw || typeof ratesRaw !== 'object') throw new Error('Unexpected provider response shape');

  // Normalise keys to UPPERCASE
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

  let payload: { base_currency?: string; force?: boolean } = {};
  try { payload = await req.json(); } catch { /* ignore */ }

  const base_currency = ((payload.base_currency ?? 'USD') as string).trim().toUpperCase() || 'USD';
  const force         = Boolean(payload.force);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();

  // ── 1. Serve from cache when fresh ───────────────────────────────────────────
  if (!force) {
    const { data: cached, error: cachedErr } = await supabase
      .from('exchange_rates')
      .select('*')
      .eq('base_currency', base_currency)
      .maybeSingle<RatesRow>();

    if (!cachedErr && cached) {
      const expiresAt = new Date(cached.expires_at).getTime();
      if (Number.isFinite(expiresAt) && expiresAt > now.getTime()) {
        return json(200, {
          base_currency,
          provider:   cached.provider,
          fetched_at: cached.fetched_at,
          expires_at: cached.expires_at,
          rates:      cached.rates,
          cached:     true,
        });
      }
    }
  }

  // ── 2. Fetch from provider ────────────────────────────────────────────────────
  let rates: Record<string, number> | null = null;
  let fetchError: string | null = null;

  try {
    rates = await fetchFromProvider(base_currency);
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e);
  }

  if (!rates) {
    // Fallback to stale cache rather than returning an error
    const { data: stale } = await supabase
      .from('exchange_rates')
      .select('*')
      .eq('base_currency', base_currency)
      .maybeSingle<RatesRow>();

    if (stale) {
      return json(200, {
        base_currency,
        provider:       stale.provider,
        fetched_at:     stale.fetched_at,
        expires_at:     stale.expires_at,
        rates:          stale.rates,
        cached:         true,
        stale:          true,
        provider_error: fetchError,
      });
    }

    return json(502, { error: 'Failed to fetch exchange rates', details: fetchError });
  }

  // ── 3. Upsert cache ───────────────────────────────────────────────────────────
  const fetchedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  await supabase.from('exchange_rates').upsert({
    base_currency,
    rates,
    provider:   'fawazahmed0/exchange-api',
    fetched_at: fetchedAt,
    expires_at: expiresAt,
  });

  return json(200, {
    base_currency,
    provider:   'fawazahmed0/exchange-api',
    fetched_at: fetchedAt,
    expires_at: expiresAt,
    rates,
    cached:     false,
  });
});
