import { createClient } from '@supabase/supabase-js';
import { calculatePreliminary } from '../src/excellence/scoring.js';
export default async function handler(req, res) {
 res.setHeader('Cache-Control', 'no-store');
 if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido.' }); return; }
 if (process.env.LOGISTICA_EXCELENCIA_ENABLED !== 'true') { res.status(404).json({ error: 'Módulo desativado.' }); return; }
 const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
 const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
 if (!url || !key || !/^Bearer [^\s]+$/.test(req.headers.authorization || '')) { res.status(401).json({ error: 'Autenticação necessária.' }); return; }
 try {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: req.headers.authorization } } });
  const { data: user, error: authError } = await client.auth.getUser(req.headers.authorization.slice(7));
  if (authError || !user.user) { res.status(401).json({ error: 'Sessão inválida.' }); return; }
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { data, error } = await client.rpc('wms_excellence_api', { p_warehouse: body.warehouse, p_action: 'DASHBOARD', p_data: { cycle_id: body.cycle_id, user_id: body.user_id } });
  if (error) { res.status(403).json({ error: 'Avaliação não autorizada ou indisponível.' }); return; }
  res.status(200).json({ ...data, calculation: calculatePreliminary(data) });
 } catch { res.status(400).json({ error: 'Não foi possível calcular a avaliação.' }); }
}
