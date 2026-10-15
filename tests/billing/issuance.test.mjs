import test from 'node:test';
import assert from 'node:assert/strict';
import {loadService} from '../helpers/load-service.mjs';
async function fixture(){
 const state={events:[],lifecycle:'draft',pdfFailure:false,archiveFailure:false};
 const f=await loadService('lib/services/issuance.ts',state,{
 '/services/workspace':'export const scopedRecord=async()=>({lifecycle:state.lifecycle});',
 '/services/billing':'export const billingService={issue:async()=>{state.events.push("issue");return {number:"TEST-4419"};}};',
 '/services/managed-pdf':'export const managedInvoiceBytes=async()=>{state.events.push("preflight");if(state.pdfFailure)throw new Error("PDF_TEST_ERROR");return new Uint8Array();};export const archiveManagedInvoice=async()=>{state.events.push("archive");if(state.archiveFailure)throw new Error("PRIVATE_STORAGE_ERROR");};',
 });return {...f,state};
}
test('issuance checks PDF before consuming a number, then archives on the server',async()=>{
 const f=await fixture();try{
  f.state.pdfFailure=true;await assert.rejects(f.module.issueAndArchive('invoice','id','issuer','2026-10-15'),/PDF_TEST_ERROR/);
  assert.deepEqual(f.state.events,['preflight']);
  f.state.events=[];f.state.pdfFailure=false;
  const result=await f.module.issueAndArchive('invoice','id','issuer','2026-10-15');
  assert.deepEqual(f.state.events,['preflight','issue','archive']);assert.equal(result.archive.state,'archived');
 }finally{await f.cleanup();}
});
test('storage failure preserves the actual issued number and returns recoverable status',async()=>{
 const f=await fixture();try{
  f.state.archiveFailure=true;
  const result=await f.module.issueAndArchive('invoice','id','issuer','2026-10-15');
  assert.equal(result.number,'TEST-4419');assert.deepEqual(result.archive,{state:'pending',code:'ARCHIVE_PENDING'});
  f.state.lifecycle='issued';f.state.events=[];f.state.archiveFailure=false;
  await f.module.issueAndArchive('invoice','id','issuer','2026-10-15');
  assert.deepEqual(f.state.events,['issue','archive']);
 }finally{await f.cleanup();}
});
