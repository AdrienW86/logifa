import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import os from 'node:os';
const issuer='00000000-0000-4000-8000-000000000001',client='00000000-0000-4000-8000-000000000002',doc='00000000-0000-4000-8000-000000000003';
test('manual invoice entry survives lost issuance response without requesting another number',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'logifa-invoice-'));let browser,server;
 try {
 await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import ServerDocument from './components/Editor/ServerDocument';import{initialDraft}from'./lib/editor/model';const initial={...initialDraft('facture'),date:'2026-10-15',client:{name:'Client test',street:'Rue test',cityZip:'Ville',phone:'',email:'',workAddress:''},fiscal:{operationDate:'2026-10-15',dueDate:'2026-11-15',purchaseOrder:'',operationCategory:'services'},lines:[{key:'1',type:'normal',name:'Travaux',quantity:'1',unit:'forfait',price:'100',tva:'20'}]};window.fixture=initial;function App(){const[d,setD]=useState(initial);return <ServerDocument draft={d} userId="user_browser" onLoad={setD} onCompany={()=>{}} onLock={()=>{}}/>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',outdir:dir,entryNames:'app',jsx:'automatic'});
 server=createServer(async(req,res)=>{try{if(req.url?.split('?')[0]==='/'){res.setHeader('Content-Type','text/html');res.end('<link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>');}else{res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'application/javascript');res.end(await readFile(path.join(dir,path.basename(req.url))));}}catch{res.statusCode=404;res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,...(process.env.LOGIFA_CHROMIUM_PATH?{executablePath:process.env.LOGIFA_CHROMIUM_PATH}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844}});let issued=false,issueCalls=0,submitted;const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname==='/api/numbering')return route.fulfill({status:503,json:{error:'Prévision indisponible'}});
  if(req.method()==='POST'){
   const body=req.postDataJSON();
   if(body.action==='save')return route.fulfill({json:{id:doc,revision:2}});
   if(body.action==='issue'){issueCalls++;submitted=body.data;issued=true;return route.abort('failed');}
  }
  if(url.searchParams.has('document'))return route.fulfill({json:{row:{id:doc,client_id:client,document_kind:'classic',lifecycle:issued?'issued':'draft',invoice_number:issued?'D-20261015-0001':null},draft:{revision:1,payload:await page.evaluate(()=>window.fixture)}}});
  return route.fulfill({json:{available:true,lists:{issuer_profiles:[{id:issuer,legal_entity_id:'legal',commercial_name:'Entreprise test'}],legal_entities:[{id:'legal',reviewed:true,vat_regime:'standard'}],clients:[{id:client,company_name:'Client test'}],quotes:[],invoices:[],projects:[],document_files:[]},balances:{},truncated:[]}});
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/?issuer=${issuer}&document=${doc}`);
 await page.getByRole('status').filter({hasText:'Brouillon serveur réouvert'}).waitFor();
 await page.getByText('Numérotation et solutions de secours',{exact:true}).click();
 await page.getByLabel('Saisir le numéro manuellement').check();
 await page.getByLabel('Numéro de facture',{exact:true}).fill('D-20261015-0001');
 await page.getByLabel('Motif de la saisie manuelle',{exact:false}).fill('Proposition automatique indisponible');
 await page.getByRole('button',{name:'Émettre la facture définitive',exact:true}).click();
 await page.getByText('L’émission n’est pas confirmée.',{exact:false}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Émettre la facture définitive',exact:true}).isDisabled(),true);
 assert.equal(submitted.manual_number,'D-20261015-0001');assert.equal(issueCalls,1);
 await page.getByRole('button',{name:'Vérifier le résultat de l’émission'}).click();
 await page.getByRole('status').filter({hasText:'déjà émise'}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Document définitif',exact:true}).count(),1);
 assert.equal(issueCalls,1);assert.deepEqual(errors,[]);
 } finally {await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('unaccepted historical quote blocks invoice emission until explicit documented approval',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'logifa-quote-accept-'));let browser,server;
 const quote='00000000-0000-4000-8000-000000000004';
 try {
  await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import ServerDocument from './components/Editor/ServerDocument';import{initialDraft}from'./lib/editor/model';const initial={...initialDraft('facture'),date:'2026-10-15',client:{name:'Client test',street:'Rue test',cityZip:'Ville',phone:'',email:'',workAddress:''},fiscal:{operationDate:'2026-10-15',dueDate:'2026-11-15',purchaseOrder:'',operationCategory:'services'},lines:[{key:'1',type:'normal',name:'Travaux',quantity:'1',unit:'forfait',price:'100',tva:'0'}]};window.fixture=initial;function App(){const[d,setD]=useState(initial);return <ServerDocument draft={d} userId="user_browser" onLoad={setD} onCompany={()=>{}} onLock={()=>{}}/>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',outdir:dir,entryNames:'app',jsx:'automatic'});
  server=createServer(async(req,res)=>{try{if(req.url?.split('?')[0]==='/'){res.setHeader('Content-Type','text/html');res.end('<link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>');}else{res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'application/javascript');res.end(await readFile(path.join(dir,path.basename(req.url))));}}catch{res.statusCode=404;res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,...(process.env.LOGIFA_CHROMIUM_PATH?{executablePath:process.env.LOGIFA_CHROMIUM_PATH}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  let saves=0,issues=0,accepts=0;const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'Devis signé le 15 octobre 2026, document original vérifié':undefined));
  await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.pathname==='/api/numbering')return route.fulfill({json:{on_hold:false,next_value:4419}});
   if(url.pathname==='/api/quotes/accept-historical'){accepts++;return route.fulfill({json:{id:quote,status:'accepted'}});}
   if(req.method()==='POST'){const body=req.postDataJSON();if(body.action==='save')saves++;if(body.action==='issue')issues++;return route.fulfill({json:{error:'Unexpected mutation'}});}
   if(url.searchParams.has('document'))return route.fulfill({json:{row:{id:doc,client_id:client,quote_id:quote,document_kind:'final',lifecycle:'draft'},draft:{revision:1,payload:await page.evaluate(()=>window.fixture)}}});
   return route.fulfill({json:{available:true,lists:{issuer_profiles:[{id:issuer,legal_entity_id:'legal',commercial_name:'Entreprise test'}],legal_entities:[{id:'legal',reviewed:true,vat_regime:'exempt'}],clients:[{id:client,company_name:'Client test'}],quotes:[{id:quote,issuer_profile_id:issuer,quote_number:'DE-123',lifecycle:'historical',status:'sent'}],invoices:[],projects:[],document_files:[]},balances:{},truncated:[]}});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/?issuer=${issuer}&document=${doc}`);
  await page.getByRole('alert').filter({hasText:'Émission bloquée : le devis'}).waitFor();
  await page.getByRole('button',{name:'Émettre la facture définitive',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Brouillon serveur réouvert'}).count();
  assert.equal(saves,0);assert.equal(issues,0);
  await page.getByRole('button',{name:"Valider l'accord client vérifié"}).click();
  await page.getByRole('status').filter({hasText:'Accord du client vérifié et enregistré'}).waitFor();
  assert.equal(accepts,1);assert.equal(issues,0);assert.deepEqual(errors,[]);
 }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
