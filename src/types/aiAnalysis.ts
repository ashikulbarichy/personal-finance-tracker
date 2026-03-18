export interface AIAnalysis {
  health_score: number;
  health_label: string;
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
  action_items: string[];
}
