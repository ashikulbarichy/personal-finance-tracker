/* Money formatting shared by every page (Keel style):
 *  - true minus sign "−", optional "+" for signed figures
 *  - BDT / INR use lakh grouping (৳1,20,000) and no decimals; others 2 decimals
 *  - wrap figures in an element with .tabular-nums so "Hide balances" masks them */
const SYMBOLS: Record<string, string> = {
  BDT: '৳', USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥', CNY: '¥', AUD: 'A$', CAD: 'C$',
  SGD: 'S$', AED: 'AED ', SAR: 'SAR ', MYR: 'RM', PKR: '₨', NPR: 'रू', LKR: 'Rs ', KRW: '₩', THB: '฿',
};
const LAKH = new Set(['BDT', 'INR', 'PKR', 'NPR']);
const NO_DECIMALS = new Set(['BDT', 'JPY', 'KRW', 'PKR', 'NPR']);

export const currencySymbol = (cur: string) => SYMBOLS[cur] ?? `${cur} `;

export function formatMoney(
  n: number,
  cur: string,
  opts: { sign?: boolean; decimals?: number } = {},
): string {
  const v = Number.isFinite(n) ? n : 0;
  const a = Math.abs(v);
  const s = v < 0 ? '−' : opts.sign && v > 0 ? '+' : '';
  const dec = opts.decimals ?? (NO_DECIMALS.has(cur) ? 0 : 2);
  const body = a.toLocaleString(LAKH.has(cur) ? 'en-IN' : 'en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
  return `${s}${currencySymbol(cur)}${body}`;
}

/** Short form for tight spots: ৳9.6L, ৳1.2Cr, $12.4k. */
export function formatCompact(n: number, cur: string): string {
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  const t = (x: number) => String(+x.toFixed(1));
  const sym = currencySymbol(cur);
  if (LAKH.has(cur)) {
    if (a >= 1e7) return `${s}${sym}${t(a / 1e7)}Cr`;
    if (a >= 1e5) return `${s}${sym}${t(a / 1e5)}L`;
  }
  if (a >= 1e9) return `${s}${sym}${t(a / 1e9)}B`;
  if (a >= 1e6) return `${s}${sym}${t(a / 1e6)}M`;
  if (a >= 1e3) return `${s}${sym}${t(a / 1e3)}k`;
  return `${s}${sym}${Math.round(a)}`;
}
