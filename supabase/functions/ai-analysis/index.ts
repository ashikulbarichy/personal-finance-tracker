/**
 * ai-analysis Edge Function
 *
 * Receives a financial snapshot from the client, builds a prompt, and
 * calls the Gemini 2.0 Flash API to produce structured recommendations.
 *
 * Required secret:  GEMINI_API_KEY
 */
import { corsHeaders } from '../_shared/cors.ts';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/* ── Types ──────────────────────────────────────────────────────────────── */
interface CategoryItem  { category: string; amount: number; pct: number }
interface PersonItem    { name: string; amount: number; count: number }
interface GoalItem      { name: string; target: number; current: number; pct: number; deadline?: string; timeline?: string }
interface BudgetItem    { name: string; period: string; allocated: number; spent: number; pct: number }
interface MonthItem     { month: string; income: number; expenses: number }

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
  monthlyTrend: MonthItem[];
}

export interface AIAnalysis {
  health_score: number;          // 1–10
  health_label: string;          // Poor / Fair / Good / Very Good / Excellent
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendations: {
    title: string;
    detail: string;
    priority: 'high' | 'medium' | 'low';
  }[];
  goal_advice: { goal: string; advice: string }[];
  budget_advice: { budget: string; advice: string }[];
  action_items: string[];        // quick wins, bullet list
}

/* ── Prompt builder ─────────────────────────────────────────────────────── */
function buildPrompt(data: FinancialSnapshot): string {
  const fmt = (n: number) => `${data.currency} ${n.toFixed(2)}`;

  const catList = data.categorySpending
    .slice(0, 8)
    .map((c) => `  • ${c.category}: ${fmt(c.amount)} (${c.pct.toFixed(1)}%)`)
    .join('\n') || '  (none)';

  const payeeList = data.topPayees
    .slice(0, 6)
    .map((p) => `  • ${p.name}: ${fmt(p.amount)} (${p.count} txns)`)
    .join('\n') || '  (none)';

  const payerList = data.topPayers
    .slice(0, 6)
    .map((p) => `  • ${p.name}: ${fmt(p.amount)} (${p.count} txns)`)
    .join('\n') || '  (none)';

  const goalList = data.savingsGoals
    .map((g) => {
      const remaining = g.target - g.current;
      const deadline  = g.deadline ? ` | Deadline: ${g.deadline}` : '';
      const tl        = g.timeline ? ` (${g.timeline.replace('_', '-')})` : '';
      return `  • ${g.name}${tl}: ${fmt(g.current)} / ${fmt(g.target)} (${g.pct.toFixed(1)}%)${deadline} — ${fmt(remaining)} remaining`;
    })
    .join('\n') || '  (none)';

  const budgetList = data.budgets
    .map((b) => {
      const over = b.pct > 100 ? ` ⚠ OVER BUDGET by ${fmt(b.spent - b.allocated)}` : '';
      return `  • ${b.name} (${b.period}): spent ${fmt(b.spent)} of ${fmt(b.allocated)} (${b.pct.toFixed(1)}%)${over}`;
    })
    .join('\n') || '  (none)';

  const trendList = data.monthlyTrend
    .map((m) => {
      const net = m.income - m.expenses;
      return `  • ${m.month}: Income ${fmt(m.income)} | Expenses ${fmt(m.expenses)} | Net ${net >= 0 ? '+' : ''}${fmt(net)}`;
    })
    .join('\n') || '  (none)';

  return `You are an expert personal finance advisor. Analyze the following financial data for a user and provide specific, actionable recommendations tailored to their situation.

== FINANCIAL SNAPSHOT (${data.period}) ==

SUMMARY METRICS
  Income:        ${fmt(data.totalIncome)}
  Expenses:      ${fmt(data.totalExpenses)}
  Savings Rate:  ${data.savingsRate.toFixed(1)}%
  Net Worth:     ${fmt(data.netWorth)}  (Assets: ${fmt(data.totalAssets)}, Liabilities: ${fmt(data.totalLiabilities)})

TOP EXPENSE CATEGORIES
${catList}

WHO THEY PAY (payees)
${payeeList}

WHO PAYS THEM (payers / income sources)
${payerList}

SAVINGS GOALS
${goalList}

BUDGET STATUS
${budgetList}

6-MONTH INCOME & EXPENSE TREND
${trendList}

== INSTRUCTIONS ==
Provide a complete, honest financial analysis. Be specific — reference actual numbers from the data. Do NOT give generic advice.
If savings goals exist, calculate roughly how long at the current savings rate it will take to reach each goal and advise accordingly.
If budgets are over-limit, call that out clearly.
Point out unusual or concerning spending patterns in the payee list.
Respond ONLY with a valid JSON object matching this exact schema (no markdown, no code fences):

{
  "health_score": <integer 1-10>,
  "health_label": "<Poor|Fair|Good|Very Good|Excellent>",
  "summary": "<2-3 sentence honest overview of their financial health>",
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "concerns": ["<concern 1>", "<concern 2>", ...],
  "recommendations": [
    {
      "title": "<short action title>",
      "detail": "<specific advice referencing their actual numbers>",
      "priority": "<high|medium|low>"
    }
  ],
  "goal_advice": [
    { "goal": "<goal name>", "advice": "<specific advice with timeline estimate>" }
  ],
  "budget_advice": [
    { "budget": "<budget name>", "advice": "<specific advice>" }
  ],
  "action_items": ["<quick win 1>", "<quick win 2>", ...]
}`;
}

/* ── Try a Gemini model, return parsed AIAnalysis or null on failure ─────── */
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
          temperature: 0.4,
          maxOutputTokens: 2048,
        },
      }),
    });
  } catch (e) {
    return { error: `Network error calling ${model}: ${String(e)}`, status: 502 };
  }

  if (!resp.ok) {
    return { error: `Model ${model} returned ${resp.status}`, status: resp.status };
  }

  const data = await resp.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  try {
    const analysis = JSON.parse(raw) as AIAnalysis;
    return { analysis, modelUsed: model };
  } catch {
    return { error: `${model} returned non-JSON`, status: 502 };
  }
}

/* ── Main handler ───────────────────────────────────────────────────────── */
// Always return HTTP 200 so the client can read the JSON body.
// Errors are communicated via { ok: false, error: "..." } in the body.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(200, { ok: false, error: 'Method not allowed' });

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) {
    return json(200, { ok: false, error: 'GEMINI_API_KEY secret is not set. Add it in the Supabase Dashboard → Edge Functions → Secrets.' });
  }

  let snapshot: FinancialSnapshot;
  try {
    snapshot = await req.json() as FinancialSnapshot;
  } catch {
    return json(200, { ok: false, error: 'Invalid request body' });
  }

  const prompt = buildPrompt(snapshot);

  // Fallback chain: try models in order, skip 429/quota errors
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
  const errors: string[] = [];

  for (const model of models) {
    const result = await tryModel(model, prompt, GEMINI_API_KEY);

    if ('analysis' in result) {
      return json(200, { ok: true, analysis: result.analysis, modelUsed: result.modelUsed });
    }

    errors.push(`${model}: ${result.error}`);

    // Only skip to the next model on quota/rate-limit errors (429)
    if (result.status !== 429) break;
  }

  return json(200, {
    ok: false,
    error: `All Gemini models failed. Details: ${errors.join(' | ')}`,
  });
});
