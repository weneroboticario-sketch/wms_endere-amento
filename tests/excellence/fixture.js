import { readFoundationSql } from './schema.js';
import { communicationFixture, asActor } from '../communication-fixture.js';
export async function excellenceFixture() {
 const db = await communicationFixture();
 await db.exec(await readFoundationSql());
 await db.exec(`create table wms_transfer_events(id text primary key,warehouse_code text,user_id text,event_type text,created_at timestamptz,sku text,quantity numeric);
 insert into wms_transfer_events values('synthetic-event-1','VDCG','op','CONFERENCIA','2026-11-18T12:00:00Z','01314',4);
 insert into operacao_tarefas(id,codigo_visivel,tipo,titulo,estoque_id,atribuido_para,status,data_conclusao)
 values('12345678-1234-4234-8234-123456789012','TAR-DEMO','ORGANIZACAO','Organização sintética','VDCG','op','CONCLUIDA','2026-11-18T11:00:00Z');
 alter table wms_replenishment_requests add column claimed_at timestamptz,add column responsavel_id text,add column claimed_by_id text,add column finished_at timestamptz,add column quantidade_solicitada numeric default 5,add column quantidade_atendida numeric default 5,add column quantidade_pendente numeric default 0,add column started_at timestamptz,add column duration_seconds integer,add column returned_to_queue_at timestamptz,add column returned_to_queue_by_id text;
 update wms_replenishment_requests set status='CONCLUIDO',responsavel_id='op',finished_at='2026-11-18T10:00:00Z';`);
 const rpc = async (action, data = {}, unit = 'VDCG') => (await db.query('select wms_excellence_api($1,$2,$3::jsonb) result', [unit, action, JSON.stringify(data)])).rows[0].result;
 await asActor(db, 'admin');
 const cycle = await rpc('CREATE_CYCLE', { execution_model: 'TASKS', name: 'Novembro 2026 · Calibração local', from: '2026-11-01', to: '2026-11-30' });
 await rpc('SET_MEMBERS', { cycle_id: cycle.id, member_ids: ['op','sup','cash'] });
 await rpc('ENABLE', { cycle_id: cycle.id });
 await rpc('SYNC', { cycle_id: cycle.id });
 return { db, rpc, cycle, asActor: actor => asActor(db, actor) };
}
