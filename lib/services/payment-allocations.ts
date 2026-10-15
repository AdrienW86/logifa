import 'server-only';
import { scopedRecord } from './workspace';
import { databaseForAdmin } from '../supabase/server';
import { checkedRpc, persistenceError } from './billing';
import { isRecord } from '../editor/contracts';
import { allocationChoices } from '../billing/payment-allocations';
export async function paymentAllocations(id: string, issuer: string) {
  await scopedRecord('payments', id, issuer);
  const db = await databaseForAdmin();
  const allocation = await db.from('payment_allocations').select('id,invoice_id,amount_minor').eq('payment_id',id);
  if (allocation.error) throw persistenceError(allocation.error);
  if (!Array.isArray(allocation.data) || !allocation.data.every(isRecord)) throw new Error('PERSISTENCE_RESPONSE_INVALID');
  const rows = allocation.data;
  const [reversals,invoices,status] = await Promise.all([
    rows.length ? db.from('allocation_reversals').select('allocation_id,amount_minor').in('allocation_id',rows.map(row=>row.id)) : {data:[],error:null},
    rows.length ? db.from('invoices').select('id,invoice_number').eq('issuer_profile_id',issuer).in('id',rows.map(row=>row.invoice_id)) : {data:[],error:null},
    checkedRpc(db,'logifa_payment_status',{p_payment:id}),
  ]);
  if (reversals.error) throw persistenceError(reversals.error);
  if (invoices.error) throw persistenceError(invoices.error);
  if (!Array.isArray(reversals.data) || !reversals.data.every(isRecord) || !Array.isArray(invoices.data) || !invoices.data.every(isRecord)) throw new Error('PERSISTENCE_RESPONSE_INVALID');
  return {allocations:allocationChoices(rows,reversals.data,invoices.data),unallocated_minor:status.unallocated_minor};
}
