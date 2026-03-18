/**
 * ai-analysis Edge Function
 * Model: gemini-2.0-flash-lite (cheapest Tier 1) → gemini-1.5-flash-8b fallback
 * Minimal prompt, concise JSON output.
 */
import { corsHeaders } from '../_shared/cors.ts';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface CategoryItem { category: string; amount: number; pct: number }
interface PersonItem   { name: string; amount: number; count: number }
interface GoalItem     { name: string; target: number; current: number; pct: number; deadline?: string }
interface BudgetItem   { name: string; allocated: number; spent: number; pct: number }

interface FinancialSnapshot {
  period: string;
  currency: string;
  totalIncome: number;
  totalExpenses: number;
  savingsRate: number;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  categorySpending: CategoryItem[];
  topPayees: PersonItem[];
  topPayers: PersonItem[];
  savingsGoals: GoalItem[];
  budgets: BudgetItem[];
  monthlyTrend: { month: string; expenses: number }[];
}

export interface AIAnalysis {
  health_score: number;
  health_label: string;
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendations: { title: string; detail: string; priority: 'high' | 'medium' | 'low' }[];
  goal_advice: { goal: string; advice: string }[];
  budget_advice: { budget: string; advice: string }[];
  action_items: string[];
}

/* ── Compact prompt (minimal tokens) ───────────────────────────────────── */
function buildPrompt(d: FinancialSnapshot): string {
  const c = d.currency;
  const r = (n: number) => `${c}${n.toFixed(0)}`;

  const cats = d.categorySpending.slice(0, 5)
    .map((x) => `${x.category}:${r(x.amount)}(${x.pct.toFixed(0)}%)`).join(', ') || 'none';

  const payees = d.topPayees.slice(0, 4)
    .map((x) => `${x.name}:${r(x.amount)}`).join(', ') || 'none';

  const payers = d.topPayers.slice(0, 4)
    .map((x) => `${x.name}:${r(x.amount)}`).join(', ') || 'none';

  const goals = d.savingsGoals.slice(0, 4)
    .map((x) => `${x.name}:${r(x.current)}/${r(x.target)}(${x.pct.toFixed(0)}%)${x.deadline ? ' due:' + x.deadline : ''}`).join('; ') || 'none';

  const budgets = d.budgets.slice(0, 4)
    .map((x) => `${x.name}:${r(x.spent)}/${r(x.allocated)}(${x.pct.toFixed(0)}%)`).join('; ') || 'none';

  const monthlySavings = d.totalIncome > 0
    ? r(d.totalIncome * (d.savingsRate / 100))
    : r(0);

  return `Personal finance advisor. Analyze this data and give short, specific advice using real numbers.

Period:${d.period} | Income:${r(d.totalIncome)} | Expenses:${r(d.totalExpenses)} | Savings:${d.savingsRate.toFixed(0)}%(${monthlySavings}/mo) | NetWorth:${r(d.netWorth)}(Assets:${r(d.totalAssets)},Liabilities:${r(d.totalLiabilities)})
TopCategories:${cats}
Payees:${payees}
Payers:${payers}
Goals:${goals}
Budgets:${budgets}

Reply ONLY with this JSON (no markdown):
{"health_score":<1-10>,"health_label":"<Poor|Fair|Good|Very Good|Excellent>","summary":"<2 sentences>","strengths":["<max 3, 1 sentence each>"],"concerns":["<max 3, 1 sentence each>"],"recommendations":[{"title":"<5 words>","detail":"<1 sentence with numbers>","priority":"<high|medium|low>"}],"goal_advice":[{"goal":"<name>","advice":"<1 sentence with timeline>"}],"budget_advice":[{"budget":"<name>","advice":"<1 sentence>"}],"action_items":["<max 4 quick wins>"]}`;
}

/* ── Call one model ─────────────────────────────────────────────────────── */
async function tryModel(
  model: string,
  prompt: string,
  apiKey: string,
): Promise<{ analysis: AIAnalysis; modelUsed: string } | { error: string; status: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
          maxOutputTokens: 900,
        },
      }),
    });
  } catch (e) {
    return { error: `Network error: ${String(e)}`, status: 502 };
  }

  if (!resp.ok) {
    return { error: `${model} → ${resp.status}`, status: resp.status };
  }

  const data = await resp.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  try {
    return { analysis: JSON.parse(raw) as AIAnalysis, modelUsed: model };
  } catch {
    return { error: `${model} returned non-JSON`, status: 502 };
  }
}

/* ── Handler ────────────────────────────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(200, { ok: false, error: 'Method not allowed' });

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) {
    return json(200, { ok: false, error: 'GEMINI_API_KEY secret is not set in Supabase Edge Function secrets.' });
  }

  let snapshot: FinancialSnapshot;
  try {
    snapshot = await req.json() as FinancialSnapshot;
  } catch {
    return json(200, { ok: false, error: 'Invalid request body.' });
  }

  const prompt = buildPrompt(snapshot);

  // Cheapest confirmed Tier 1 models first; skip on 400/404/429 and try next
  const models = ['gemini-3.1-flash-lite-preview', 'gemini-1.5-flash-8b', 'gemini-1.5-flash'];
  const errors: string[] = [];

  for (const model of models) {
    const result = await tryModel(model, prompt, GEMINI_API_KEY);
    if ('analysis' in result) {
      return json(200, { ok: true, analysis: result.analysis, modelUsed: result.modelUsed });
    }
    errors.push(result.error);
    const skippable = [400, 404, 429];
    if (!skippable.includes(result.status)) break;
  }

  return json(200, { ok: false, error: `All models failed: ${errors.join(' | ')}` });
});
