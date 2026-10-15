import test from 'node:test';
import assert from 'node:assert/strict';
import {loadService} from '../helpers/load-service.mjs';
import {validatedHistoricalPdf} from '../../lib/agent/historical-pdf.ts';
test('PDF extraction keeps absent figures empty and requires human review of mismatches',()=>{
 const result=validatedHistoricalPdf({lines:[{type:'normal',name:'Prestation attestée',quantity:null,unit:null,price:null,vat_rate:null,evidence:'Prestation attestée'}],total_net:'100',total_vat:null,total_gross:null,warnings:[]},{net:100,vat:20,gross:120});
 assert.equal(result.lines[0].quantity,'');assert.equal(result.lines[0].price,'');assert.equal(result.lines[0].tva,'');
 assert.ok(result.warnings.length>=3);
});
test('OpenAI consumes persistent quota before HTTP and never calls provider when refused',async()=>{
 const state={quotas:0,refuse:false};
 const f=await loadService('lib/agent/openai.ts',state,{'/agent/quota':'export const consumeAgentRequest=async()=>{state.quotas++;if(state.refuse)throw new Error("LOGIFA_AGENT_RATE_LIMIT");};'});
 const keys=['LOGIFA_OPENAI_ENABLED','LOGIFA_OPENAI_COSTS_APPROVED','OPENAI_API_KEY','OPENAI_MODEL'];const previous=keys.map(k=>process.env[k]);
 Object.assign(process.env,{LOGIFA_OPENAI_ENABLED:'true',LOGIFA_OPENAI_COSTS_APPROVED:'true',OPENAI_API_KEY:'fake-test-only',OPENAI_MODEL:'mock-model'});
 try{
 let calls=0;
 const request=async(url,init)=>{calls++;const body=JSON.parse(init.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{"lines":[]}'}]}]});};
 assert.deepEqual(await f.module.proposeWithOpenAI('admin','Test',{},request),{lines:[]});assert.equal(state.quotas,1);
 state.refuse=true;await assert.rejects(f.module.proposeWithOpenAI('admin','Test',{},request),/RATE_LIMIT/);assert.equal(calls,1);
 await assert.rejects(f.module.proposeWithOpenAI('admin','',{},request),/PROMPT_REQUIRED/);assert.equal(state.quotas,2);
 }finally{keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});await f.cleanup();}
});
