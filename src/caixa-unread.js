// Supabase is the source of truth. No browser-persistent read state.
export function createCaixaUnread({ client, warehouse, isCurrent = () => true }) {
 let counts = new Map(), revision = 0;
 return {
  count: request => counts.get(request) || 0,
  async refresh() {
   if (!isCurrent()) return;
   const sequence = ++revision;
   const result = await client.rpc('list_wms_caixa_unread', {code:warehouse});
   if (!isCurrent() || sequence !== revision) return;
   if (result.error || !Array.isArray(result.data)) return;
   counts = new Map(result.data.map(row=>[row.request_id,Number(row.unread_count)||0]));
  },
  async acknowledge(request, messages) {
   const ids = messages.filter(m=>m.request_id===request && /^\d+$/.test(String(m.id))).map(m=>BigInt(m.id));
   if (!ids.length || !isCurrent()) return;
   ++revision; // Invalidate a poll begun before this read.
   const result = await client.rpc('mark_wms_caixa_read', {request_key:request,message_key:String(ids.reduce((a,b)=>a>b?a:b))});
   if (!isCurrent()) return;
   if (result.error) throw new Error('Não foi possível sincronizar a leitura.');
   await this.refresh();
  }
 };
}
