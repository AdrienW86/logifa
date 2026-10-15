import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {database,company,draft,issue,rpc,claims} from './database.mjs';

test('isolated PostgreSQL financial workflow',async t=>{
 const db=await database();
 try{
 const c=await company(db), other=await company(db,'Autre entreprise');
 await t.test('server enforces client company isolation',async()=>{
   await assert.rejects(draft(db,{...c,client:other.client}),/ISSUER|scope|foreign key/i);
 });
 const q=await rpc(db,'logifa_save_document',['quote',null,{issuer_profile_id:c.issuer,client_id:c.client,lines:[{type:'normal',name:'Contrat test',quantity:'1',unit:'forfait',price:'1000',tva:'20'}]}]);
 await issue(db,q.id,'quote');await rpc(db,'logifa_accept_quote',[q.id]);
 const d1=await draft(db,c,'deposit','300',{quote_id:q.id}),d2=await draft(db,c,'deposit','300',{quote_id:q.id});
 await t.test('two issued 30 percent deposits and a final deduct 60 percent invoiced, regardless of receipts',async()=>{
   await issue(db,d1.id);await issue(db,d2.id);
   const f=await draft(db,c,'final','1000',{quote_id:q.id});
   await rpc(db,'logifa_link_all_deposits',[c.issuer,f.id]);await issue(db,f.id);
   const b=await rpc(db,'logifa_invoice_balance',[f.id]);
   assert.equal(b.gross_minor,120000);assert.equal(b.deductions_minor,72000);assert.equal(b.due_minor,48000);assert.equal(b.paid_minor,0);assert.equal(b.is_acquittable,false);
   assert.equal(b.chain_remaining_minor,120000);
   const duplicate=await draft(db,c,'final','1000',{quote_id:q.id});await assert.rejects(issue(db,duplicate.id),/FINAL_ALREADY|DEPOSIT/);
 });
 let standalone,allocation,payment;
 await t.test('standalone deposit supports multiple partial payments and acquittement only after complete cash',async()=>{
   standalone=await draft(db,c,'deposit','100');await issue(db,standalone.id);
   const pay=async amount=>rpc(db,'logifa_record_payment',[{issuer_profile_id:c.issuer,client_id:c.client,amount_minor:amount,received_on:'2026-10-15',method:'transfer',qualification:'deposit',idempotency_key:randomUUID()}]);
   payment=await pay('5000');const key=randomUUID();allocation=await rpc(db,'logifa_allocate_payment',[payment.id,standalone.id,'5000',key]);
   assert.equal((await rpc(db,'logifa_allocate_payment',[payment.id,standalone.id,'5000',key])).id,allocation.id);
   let b=await rpc(db,'logifa_invoice_balance',[standalone.id]);assert.equal(b.remaining_minor,7000);assert.equal(b.is_acquittable,false);
   const second=await pay('7000');await rpc(db,'logifa_allocate_payment',[second.id,standalone.id,'7000',randomUUID()]);
   b=await rpc(db,'logifa_invoice_balance',[standalone.id]);assert.equal(b.remaining_minor,0);assert.equal(b.is_acquittable,true);
 });
 await t.test('refund reverses allocation and withdraws acquittement',async()=>{
   await rpc(db,'logifa_refund_payment',[payment.id,'2000','2026-10-15','transfer',randomUUID(),allocation.id]);
   const b=await rpc(db,'logifa_invoice_balance',[standalone.id]);assert.equal(b.remaining_minor,2000);assert.equal(b.is_acquittable,false);
 });
 await t.test('credit note corrects accounting without inventing a receipt',async()=>{
   const original=await draft(db,c);await issue(db,original.id);
   const credit=await draft(db,c,'credit','100',{correction_of:original.id,credit_reason:'Annulation test'});await issue(db,credit.id);
   await rpc(db,'logifa_apply_credit',[credit.id,original.id,'12000',randomUUID()]);
   const b=await rpc(db,'logifa_invoice_balance',[original.id]);assert.equal(b.remaining_minor,0);assert.equal(b.paid_minor,0);assert.equal(b.is_acquittable,false);
 });
 await t.test('numbering is unique/idempotent and rejects backdating without consuming a counter',async()=>{
   const docs=await Promise.all(Array.from({length:8},()=>draft(db,c)));
   const issued=await Promise.all(docs.map(d=>issue(db,d.id)));
   assert.equal(new Set(issued.map(d=>d.number)).size,8);
   assert.equal((await issue(db,docs[0].id)).number,issued[0].number);
   const pending=await draft(db,c);const count=await db.query('select next_value from document_sequences where legal_entity_id=$1 and document_type=\'invoice\'',[c.entity]);
   await assert.rejects(issue(db,pending.id,'invoice','2026-10-14'),/CHRONOLOGY/);
   assert.deepEqual((await db.query('select next_value from document_sequences where legal_entity_id=$1 and document_type=\'invoice\'',[c.entity])).rows,count.rows);
 });
 await t.test('issued rows and items cannot be updated, non-admin cannot read or invoke',async()=>{
   await assert.rejects(db.query('update invoices set total_net=0 where id=$1',[standalone.id]),/permission denied/);
   await claims(db,'user_intruder');assert.equal((await db.query('select id from invoices')).rows.length,0);
   await assert.rejects(rpc(db,'logifa_invoice_balance',[standalone.id]),/ADMIN_REQUIRED/);
   await claims(db,'user_test_admin');
 });
 await t.test('explicit discounts reduce the same VAT category and cannot create a negative base',async()=>{
   const lines=[{type:'normal',name:'Travaux',quantity:'1',unit:'forfait',price:'100',tva:'20'},
     {type:'normal',name:'Remise attestée',quantity:'1',unit:'forfait',price:'-10',tva:'20'}];
   const discounted=await draft(db,c,'classic','100',{lines});
   await issue(db,discounted.id);
   const balance=await rpc(db,'logifa_invoice_balance',[discounted.id]);assert.equal(balance.gross_minor,10800);
   await assert.rejects(draft(db,c,'classic','100',{lines:[lines[0],{...lines[1],tva:'10'}]}),/DISCOUNT_EXCEEDS_RATE_BASE/);
   await assert.rejects(draft(db,c,'classic','100',{lines:[lines[0],{...lines[1],price:'-101'}]}),/DISCOUNT_EXCEEDS_RATE_BASE/);
 });
 await t.test('historical import preserves number and declared status without assuming payment, retries are idempotent',async()=>{
   const input={issuer_profile_id:c.issuer,client_id:c.client,number:'HISTORIQUE-TEST',issue_date:'2026-10-01',original_status:'payée selon PDF à vérifier',import_key:randomUUID(),total_net:'100',total_vat:'20',total_gross:'120'};
   const original=await rpc(db,'logifa_import_document',['invoice',input]);
   assert.equal((await rpc(db,'logifa_import_document',['invoice',input])).id,original.id);
   const balance=await rpc(db,'logifa_invoice_balance',[original.id]);assert.equal(balance.paid_minor,0);assert.equal(balance.is_acquittable,false);
   await assert.rejects(rpc(db,'logifa_import_document',['invoice',{...input,total_net:'101',total_gross:'121'}]),/IDEMPOTENCY_CONFLICT/);
 });
 await t.test('persistent shared IA quotas block the eleventh call and refuse non-admins',async()=>{
   for(let i=0;i<10;i++) {
     const quota=await rpc(db,'logifa_consume_agent_request',[i%2?'proposal':'pdf_extraction']);
     assert.equal(quota.allowed,true);assert.equal(quota.hour_remaining,9-i);
   }
   await assert.rejects(rpc(db,'logifa_consume_agent_request',['proposal']),/RATE_LIMIT/);
   await claims(db,'user_intruder');
   await assert.rejects(rpc(db,'logifa_consume_agent_request',['proposal']),/ADMIN_REQUIRED/);
   await claims(db,'user_test_admin');
 });
 } finally{await db.close();}
});
