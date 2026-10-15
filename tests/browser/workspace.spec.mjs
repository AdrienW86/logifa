import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import os from 'node:os';
const issuer='00000000-0000-4000-8000-000000000001';
const company={id:issuer,commercial_name:'Entreprise synthétique',active:true};
const records=Array.from({length:51},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+2).padStart(12,'0')}`,issuer_profile_id:issuer,company_name:`Client synthétique ${i+1}`,client_kind:'individual'}));
test('workspace paginates beyond 50 and discards old-company data immediately',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'logifa-browser-'));
 let browser,server;
 try{
 await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Workspace from './components/Workspace/Workspace';createRoot(document.getElementById('root')).render(<Workspace section="clients"/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',outdir:dir,entryNames:'app',jsx:'automatic',plugins:[{name:'browser-test-mocks',setup(b){
 b.onResolve({filter:/^@clerk\/nextjs$|^next\/link$|^next\/navigation$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='@clerk/nextjs'?`const user={id:'user_browser'};export const useUser=()=>({user});`:a.path==='next/link'?`import React from 'react';export default function Link(p){return <a {...p}/>}`:`export const useRouter=()=>({push:()=>{}});`}));
 }}]});
 server=createServer(async(req,res)=>{try{const type=req.url?.endsWith('.css')?'text/css':'application/javascript';if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>');}else{res.setHeader('Content-Type',type);res.end(await readFile(path.join(dir,path.basename(req.url))));}}catch{res.statusCode=404;res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,...(process.env.LOGIFA_CHROMIUM_PATH?{executablePath:process.env.LOGIFA_CHROMIUM_PATH}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(issuer=>sessionStorage.setItem('logifa:issuer:user_browser',issuer),issuer);
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/workspace/list'){
   const p=Number(url.searchParams.get('page'));const matching=url.searchParams.get('client')?records.filter(row=>row.id===url.searchParams.get('client')):records;const different=url.searchParams.get('issuer')!==issuer;
   return route.fulfill({json:{items:different?[]:matching.slice(p*50,(p+1)*50),clients:[],balances:{},total:different?0:matching.length}});
  }
  return route.fulfill({json:{available:true,lists:{issuer_profiles:[company],legal_entities:[],clients:records.slice(0,50),projects:[],quotes:[],invoices:[],payments:[],document_files:[],document_workflow:[],document_events:[]},balances:{},truncated:[]}});
 });
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('status').filter({hasText:'51 résultat'}).waitFor();
 await page.getByRole('button',{name:'Suivant',exact:true}).click();
 await page.getByRole('status').filter({hasText:'page 2 / 2'}).waitFor();
 assert.equal(await page.getByText('Client synthétique 51',{exact:true}).count(),1);
 await page.getByText('Client synthétique 51',{exact:true}).click();
 await page.getByRole('button',{name:'← Tous les clients',exact:true}).waitFor();
 await page.evaluate(()=>{sessionStorage.setItem('logifa:issuer:user_browser','00000000-0000-4000-8000-000000000099');window.dispatchEvent(new Event('logifa:issuer'));});
 await page.getByRole('status').filter({hasText:'0 résultat'}).waitFor();
 assert.equal(await page.getByText('Client synthétique 51',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);
 }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
