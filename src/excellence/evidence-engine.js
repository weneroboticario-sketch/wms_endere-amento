/** Relative cycle metric, never points per request. Typed facts are emitted by SQL. */
export function replenishmentExecutionScore(evidence, maximum) {
 const latest=new Map();
 for(const row of evidence.filter(row=>row.source_table==='wms_replenishment_requests')) {
  const previous=latest.get(row.source_id);
  if(!previous || Date.parse(row.evidence_date)>Date.parse(previous.evidence_date) || (Date.parse(row.evidence_date)===Date.parse(previous.evidence_date) && row.event_type.startsWith('REPLENISHMENT_COMPLETED'))) latest.set(row.source_id,row);
 }
 const included=[],excluded=[];let numerator=0;
 for(const row of latest.values()) {
  const id=row.source_table+':'+row.source_id;
  if(row.metadata?.exemption_validated===true) {excluded.push({id,reason:'AUSENCIA_OU_IMPEDIMENTO_VALIDADO'});continue;}
  if(['REPLENISHMENT_NO_STOCK','REPLENISHMENT_RETURNED_TO_QUEUE'].includes(row.event_type)) {excluded.push({id,reason:'IMPEDIMENTO_OU_AUSENCIA_VALIDADA'});continue;}
  if(row.metadata.opportunity_verified!==true) {excluded.push({id,reason:'AUTORIA_OU_RESPONSABILIDADE_NAO_COMPROVADA'});continue;}
  const completed=row.event_type.startsWith('REPLENISHMENT_COMPLETED');if(completed)numerator++;
  included.push({id,completed});
 }
 return {points:included.length?numerator/included.length*maximum:null,numerator,denominator:included.length,maximum,included,excluded,formula:'atendimentos concluídos / oportunidades atribuídas observadas no ciclo × máximo; parcial não é falha de qualidade',limitation:'Métrica experimental de conclusão, não mede velocidade nem mérito por volume. Falta de estoque e devoluções são neutras.'};
}
