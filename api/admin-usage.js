import { checkAuth } from './backoffice/_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  const range = req.query.range || '30d';
  const rangeMap = { '7d': 7, '30d': 30, '90d': 90 };
  const days = rangeMap[range];

  try {
    let query = supabaseAdmin.from('ai_usage_logs').select('*').order('created_at', { ascending: false });
    if (days) {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      query = query.gte('created_at', since);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const totalCost = rows.reduce((s, r) => s + Number(r.cost_usd), 0);
    const totalCalls = rows.length;
    const totalInputTokens = rows.reduce((s, r) => s + (r.input_tokens || 0), 0);
    const totalOutputTokens = rows.reduce((s, r) => s + (r.output_tokens || 0), 0);

    const modelMap = {};
    rows.forEach(r => {
      if (!modelMap[r.model]) modelMap[r.model] = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
      modelMap[r.model].calls++;
      modelMap[r.model].inputTokens += r.input_tokens || 0;
      modelMap[r.model].outputTokens += r.output_tokens || 0;
      modelMap[r.model].cost += Number(r.cost_usd);
    });
    const byModel = Object.entries(modelMap).map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.cost - a.cost);

    const endpointMap = {};
    rows.forEach(r => {
      if (!endpointMap[r.endpoint]) endpointMap[r.endpoint] = { calls: 0, cost: 0 };
      endpointMap[r.endpoint].calls++;
      endpointMap[r.endpoint].cost += Number(r.cost_usd);
    });
    const byEndpoint = Object.entries(endpointMap).map(([endpoint, v]) => ({ endpoint, ...v }))
      .sort((a, b) => b.cost - a.cost);

    const dailyDays = days || 90;
    const dailyMap = {};
    const now = new Date();
    for (let i = dailyDays - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyMap[key] = { date: key, cost: 0, calls: 0 };
    }
    rows.forEach(r => {
      const key = r.created_at.slice(0, 10);
      if (dailyMap[key]) { dailyMap[key].cost += Number(r.cost_usd); dailyMap[key].calls++; }
    });
    const daily = Object.values(dailyMap);

    res.json({ success: true, data: { totalCost, totalCalls, totalInputTokens, totalOutputTokens, byModel, byEndpoint, daily } });
  } catch (err) {
    console.error('admin/usage error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
