import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {pageInput,searchPattern} from '../../lib/workspace/pagination.ts';
import {loadService} from '../helpers/load-service.mjs';
test('pagination only accepts known lists and bounded search/page input',()=>{
 assert.equal(pageInput(new URLSearchParams('section=factures&page=2')).page,2);
 for(const section of ['toString','__proto__','document_events']) assert.throws(()=>pageInput(new URLSearchParams({section})),/INPUT_SECTION/);
 for(const page of ['-1','1.2','1e6','1000000']) assert.throws(()=>pageInput(new URLSearchParams({section:'clients',page})),/INPUT_PAGE/);
 assert.equal(searchPattern('10%_test'),'%'+'10\\%\\_test'+'%');
});
test('Supabase list query scopes issuer before applying page/filter and fetches 50 rows',async()=>{
 const requests=[];const issuer='00000000-0000-4000-8000-000000000001';
 const db=createClient('https://database.example.test','fake-test-key',{auth:{persistSession:false},global:{fetch:async(url,options)=>{
   requests.push(String(url));return Response.json([],{headers:{'content-range':'100-149/150'}});
 }}});
 const f=await loadService('lib/services/workspace-page.ts',{db},{
  '/auth/require-admin':'export const requireAdmin=async()=>"test-admin";',
  '/supabase/server':'export const databaseForAdmin=async()=>state.db;',
  '/services/billing':'export const persistenceError=e=>new Error(e.message);export const checkedRpc=async()=>({});',
 });
 try{
 const result=await f.module.workspacePage(issuer,pageInput(new URLSearchParams('section=clients&page=2&search=Test')));
 assert.equal(result.total,150);assert.equal(requests.length,1);
 const query=new URL(requests[0]).searchParams;
 assert.equal(query.get('issuer_profile_id'),'eq.'+issuer);assert.equal(query.get('offset'),'100');assert.equal(query.get('limit'),'50');
 assert.equal(query.get('order'),'created_at.desc,id.desc');assert.equal(query.get('company_name'),'ilike.%Test%');
 }finally{await f.cleanup();}
});
