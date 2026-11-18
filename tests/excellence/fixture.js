import { readFile } from 'node:fs/promises';
import { communicationFixture, asActor } from '../communication-fixture.js';
export async function excellenceFixture() {
 const db = await communicationFixture();
 for (const name of ['excellence_foundation.sql', 'excellence_api.sql', 'excellence_closure.sql']) await db.exec(await readFile(new URL('../../supabase/proposals/' + name, import.meta.url), 'utf8'));
 await db.exec(`create table wms_transfer_events(id text primary key,warehouse_code text,user_id text,event_type text,created_at timestamptz,sku text,quantity numeric);
 insert into wms_transfer_events values('synthetic-event-1','VDCG','op','CONFERENCIA','2026-11-18T12:00:00Z','01314',4);
 insert into operacao_tarefas(id,codigo_visivel,tipo,titulo,estoque_id,atribuido_para,status,data_conclusao)
 values('12345678-1234-4234-8234-123456789012','TAR-DEMO','ORGANIZACAO','Organização sintética','VDCG','op','CONCLUIDA','2026-11-18T11:00:00Z');
 alter table wms_replenishment_requests add column responsavel_id text,add column claimed_by_id text,add column finished_at timestamptz;
 update wms_replenishment_requests set status='CONCLUIDO',responsavel_id='op',finished_at='2026-11-18T10:00:00Z';`);
 const rpc = async (action, data = {}, unit = 'VDCG') => (await db.query('select wms_excellence_api($1,$2,$3::jsonb) result', [unit, action, JSON.stringify(data)])).rows[0].result;
 await asActor(db, 'admin');
 const cycle = await rpc('CREATE_CYCLE', { name: 'Novembro 2026 · Calibração local', from: '2026-11-01', to: '2026-11-30' });
 await rpc('ENABLE', { cycle_id: cycle.id });
 await rpc('SYNC', { cycle_id: cycle.id });
 return { db, rpc, cycle, asActor: actor => asActor(db, actor) };
}
