/** Relative cycle metric, never points per request. Typed facts are emitted by SQL. */
export function replenishmentExecutionScore(evidence, maximum) {
 const latest=new Map();
 for(const row of evidence.filter(row=>['wms_replenishment_requests','wms_replenishment_participation_events'].includes(row.source_table))) {
  const role=row.metadata?.replenishment_role||'EXECUTOR';
  const requestId=row.metadata?.request_id||row.source_id;
  const key=requestId+':'+role;
  const previous=latest.get(key);
  if(!previous || Date.parse(row.evidence_date)>Date.parse(previous.evidence_date) || (Date.parse(row.evidence_date)===Date.parse(previous.evidence_date) && row.event_type.startsWith('REPLENISHMENT_COMPLETED'))) latest.set(key,row);
 }
 const included=[],excluded=[];let numerator=0;
 for(const row of latest.values()) {
  const role=row.metadata?.replenishment_role||'EXECUTOR';
  const requestId=row.metadata?.request_id||row.source_id;
  const id='wms_replenishment_requests:'+requestId;
  if(row.metadata?.exemption_validated===true) {excluded.push({id,role,reason:'AUSENCIA_OU_IMPEDIMENTO_VALIDADO'});continue;}
  if(role==='EXECUTOR' && ['REPLENISHMENT_NO_STOCK','REPLENISHMENT_RETURNED_TO_QUEUE'].includes(row.event_type)) {excluded.push({id,role,reason:'IMPEDIMENTO_OU_AUSENCIA_VALIDADA'});continue;}
  if(row.metadata.opportunity_verified!==true) {excluded.push({id,role,reason:'AUTORIA_OU_RESPONSABILIDADE_NAO_COMPROVADA'});continue;}
  const completed=
   (role==='SOLICITANTE' && row.event_type==='REPLENISHMENT_REQUEST_PROCESSED')
   || (role==='CONCLUIDOR' && row.event_type==='REPLENISHMENT_COMPLETION_RECORDED')
   || (role==='EXECUTOR' && (row.event_type.startsWith('REPLENISHMENT_COMPLETED') || row.event_type==='REPLENISHMENT_ATTENDED'));
  if(completed)numerator++;
  included.push({id,role,completed});
 }
 return {points:included.length?numerator/included.length*maximum:null,numerator,denominator:included.length,maximum,included,excluded,formula:'contribuições verificadas concluídas / oportunidades verificadas por papel × máximo; SOLICITANTE, EXECUTOR e CONCLUIDOR são avaliados separadamente',limitation:'Volume bruto não gera pontos. Solicitar só conta quando a solicitação foi efetivamente processada; falta de estoque e devolução não penalizam automaticamente o executor.'};
}
