import { readFile } from 'node:fs/promises';
export const readFoundationSql=async()=>{
 const foundation=await readFile(new URL('../../supabase/migrations/20261118202204_wms_excellence_foundation.sql',import.meta.url),'utf8');
 const tasks=await readFile(new URL('../../supabase/migrations/20261118221000_excellence_standard_tasks.sql',import.meta.url),'utf8');
 const governance=await readFile(new URL('../../supabase/migrations/20261119123000_excellence_supervisor_governance.sql',import.meta.url),'utf8');
 const membershipCompat=await readFile(new URL('../../supabase/migrations/20261119133000_excellence_supervisor_membership_compat.sql',import.meta.url),'utf8');
 const operationalMonitoring=await readFile(new URL('../../supabase/migrations/20261119142000_excellence_operational_monitoring.sql',import.meta.url),'utf8');
 return foundation+'\n'+tasks+'\n'+governance+'\n'+membershipCompat+'\n'+operationalMonitoring;
};