import 'server-only';
import { requireAdmin } from '../auth/require-admin';
import { databaseForAdmin } from '../supabase/server';
import { uuid } from '../billing/validation';
import { isRecord } from '../editor/contracts';
import { checkedRpc, persistenceError } from './billing';
import { pageKinds, pageInput, searchPattern } from '../workspace/pagination';
export async function workspacePage(issuer: string, input: ReturnType<typeof pageInput>) {
  await requireAdmin(); uuid(issuer); if (input.client) uuid(input.client);
  const db = await databaseForAdmin(), config = pageKinds[input.kind];
  let query = db.from(config.table).select('*', {count:'exact'}).eq('issuer_profile_id',issuer);
  if (input.search) query = query.ilike(config.search,searchPattern(input.search));
  if (input.client) query = query.eq(input.kind === 'clients' ? 'id' : 'client_id',input.client);
  const response = await query.order('created_at',{ascending:false}).order('id',{ascending:false})
    .range(input.page*input.size,(input.page+1)*input.size-1);
  if (response.error) throw persistenceError(response.error);
  if (!Array.isArray(response.data) || !response.data.every(isRecord)) throw new Error('PERSISTENCE_RESPONSE_INVALID');
  const items = response.data;
  const balances = input.kind === 'factures' && items.some(x=>x.lifecycle!=='draft')
    ? await checkedRpc(db,'logifa_invoice_balances',{p_issuer:issuer,p_ids:items.filter(x=>x.lifecycle!=='draft').map(x=>x.id)}) : {};
  const ids = [...new Set(items.map(x=>x.client_id).filter(x=>typeof x==='string'))];
  const clients = ids.length ? await db.from('clients').select('id,company_name').eq('issuer_profile_id',issuer).in('id',ids) : {data:[],error:null};
  if (clients.error) throw persistenceError(clients.error);
  return {items,total:response.count??0,page:input.page,pageSize:input.size,balances,clients:clients.data};
}
