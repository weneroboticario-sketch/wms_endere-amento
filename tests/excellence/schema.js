import { readFile } from 'node:fs/promises';
export const readFoundationSql=async()=>{
 const foundation=await readFile(new URL('../../supabase/migrations/20261118202204_wms_excellence_foundation.sql',import.meta.url),'utf8');
 const tasks=await readFile(new URL('../../supabase/migrations/20261118221000_excellence_standard_tasks.sql',import.meta.url),'utf8');
 return foundation+'\n'+tasks;
};