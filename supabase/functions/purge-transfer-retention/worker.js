export function transferDocumentPrefix(row){
  if(!/^[A-Za-z0-9:_-]+$/.test(row.id)||!/^[A-Za-z0-9_-]+$/.test(row.warehouse_code))throw new Error("Invalid retention scope");
  return `${row.warehouse_code}/wms_transfers/${row.id}/`;
}
export async function purgeExpiredTransfers(client){
  const candidates=await client.rpc("wms_transfer_purge_candidates");
  if(candidates.error)throw candidates.error;
  let purged=0,failed=0;
  for(const row of candidates.data||[]){
    try{
      const prefix=transferDocumentPrefix(row),bucket=client.storage.from("wms-transfer-invoices");
      const paths=[];
      async function scan(folder){
        for(let offset=0;;offset+=100){
          const response=await bucket.list(folder,{limit:100,offset,sortBy:{column:"name",order:"asc"}});
          if(response.error)throw response.error;
          for(const file of response.data||[]){
            if(!file.name||file.name.includes("/")||file.name==="."||file.name==="..")throw new Error("Invalid document path");
            const path=folder+file.name;
            if(file.id)paths.push(path);else await scan(path+"/");
          }
          if((response.data||[]).length<100)break;
        }
      }
      await scan(prefix);
      for(let offset=0;offset<paths.length;offset+=100){
        const response=await bucket.remove(paths.slice(offset,offset+100));if(response.error)throw response.error;
      }
      const response=await client.rpc("wms_transfer_purge_finish",{p_id:row.id,p_claim:row.purge_claim});
      if(response.error||response.data!==true)throw response.error||new Error("Purge not confirmed");
      purged++;
    }catch{failed++;}
  }
  return {purged,failed};
}
