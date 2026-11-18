import { createClient } from '@supabase/supabase-js';
import { readEvaluation, prepareCycleClosure, readTeamEvaluation } from '../src/excellence/evaluation-service.js';
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
  const rpc = async (action, data) => {
   const response = await client.rpc('wms_excellence_api', { p_warehouse: body.warehouse, p_action: action, p_data: data });
   if (response.error) throw Error(response.error.message); return response.data;
  };
  if (body.action === 'TEAM') { res.status(200).json(await readTeamEvaluation(rpc,{cycle_id:body.cycle_id})); return; }
  if (body.action === 'CLOSE') {
   // The backend secret proves that the snapshots came through the shared server-side engine.
   // The database still validates the caller's authenticated admin identity, scope, revision and coverage.
   const closeSecret = process.env.EXCELLENCE_CLOSE_SECRET;
   if (!closeSecret) { res.status(503).json({ error: 'Fechamento administrativo ainda não configurado.' }); return; }
   const prepared = await prepareCycleClosure(rpc, body.cycle_id);
   const result = await client.rpc('wms_excellence_close_cycle', {
    p_cycle: body.cycle_id,
    p_actor_auth: user.user.id,
    p_revision: prepared.revision,
    p_assessments: prepared.snapshots,
    p_backend_secret: closeSecret
   });
   if (result.error) throw Error(result.error.message);
   res.status(200).json(result.data); return;
  }
  res.status(200).json(await readEvaluation(rpc, { cycle_id: body.cycle_id, user_id: body.user_id }));
 } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível calcular a avaliação.' }); }
}
