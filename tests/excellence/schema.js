import { readFile } from 'node:fs/promises';
export const readFoundationSql=()=>readFile(new URL('../../supabase/migrations/20261118202204_wms_excellence_foundation.sql',import.meta.url),'utf8');
