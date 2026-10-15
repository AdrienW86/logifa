import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
export async function database() {
  const db = new PGlite();
  try {
    await db.exec(await readFile('tests/postgres/legacy-schema.sql','utf8'));
    for (const file of (await readdir('supabase/baseline')).filter(x=>x.endsWith('.sql')).sort())
      await db.exec(await readFile('supabase/baseline/'+file,'utf8'));
    await db.exec(await readFile('tests/postgres/current-issuance.sql','utf8'));
    for (const file of (await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort())
      await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
    await db.exec(`insert into public.profiles(id) values ('synthetic-owner');
      update logifa_private.admin_binding set enabled=true,clerk_subject='user_test_admin',clerk_issuer='https://test.invalid',legacy_profile_id='synthetic-owner';
      set role authenticated;`);
    await claims(db,'user_test_admin');
    return db;
  } catch(e) {await db.close();throw e;}
}
export async function claims(db,subject) {
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:subject,iss:'https://test.invalid',role:'authenticated'})]);
}
export async function rpc(db,name,args=[],types=[]) {
  const response = await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}${types[i]?'::'+types[i]:''}`).join(',')}) as result`,args.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x));
  return response.rows[0].result;
}
export async function company(db,name='Société test') {
  const legal = await rpc(db,'logifa_workspace',['legal',{legal_name:name,siret:'00000000000000',vat_regime:'standard',vat_exigibility:'cash',reviewed:true,quote_prefix:'Q',invoice_prefix:'D',legal_mentions:{payment_terms:'30 jours',pdf_footer:'TEST'}}]);
  const issuer = await rpc(db,'logifa_workspace',['issuer',{commercial_name:name,legal_entity_id:legal.id}]);
  const client = await rpc(db,'logifa_workspace',['client',{issuer_id:issuer.id,company_name:'Client synthétique',client_kind:'individual'}]);
  return {entity:legal.id,issuer:issuer.id,client:client.id};
}
export async function draft(db,c,kind='classic',price='100.00',extra={}) {
  return rpc(db,'logifa_save_document',['invoice',null,{issuer_profile_id:c.issuer,client_id:c.client,document_kind:kind,lines:[{type:'normal',name:'Prestation synthétique',quantity:'1',unit:'forfait',price,tva:'20'}],...extra}]);
}
export async function issue(db,id,kind='invoice',date='2026-10-15') {
  return rpc(db,'logifa_issue_document',[kind,id,date]);
}
