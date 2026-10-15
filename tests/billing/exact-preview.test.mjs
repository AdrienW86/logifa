import test from 'node:test';
import assert from 'node:assert/strict';
import {exactLineTotals,lineTotals} from '../../lib/billing/validation.ts';
import {totals,initialDraft,pdfPayload,documentErrors} from '../../lib/editor/model.ts';
const row=(price='2.01',quantity='0.50',tva='20')=>({key:'line',type:'normal',name:'Prestation test',unit:'forfait',price,quantity,tva});
test('preview and local PDF use server line rounding before VAT and aggregation',()=>{
 const lines=[row(),row('0.05','1','10')];
 assert.deepEqual(exactLineTotals('0.50','2.01','20'),{net:101n,vat:20n,gross:121n});
 assert.deepEqual(totals(lines),{totalHT:1.06,totalTVA:0.21,totalTTC:1.27});
 const server=lineTotals(lines);assert.equal(server.gross,127n);
 const d=initialDraft('facture');d.client.name='Client test';d.lines=lines;
 const pdf=pdfPayload(d,[{name:'Entreprise test'}]);assert.equal(pdf.prestations[0].totalNet,1.01);assert.equal(pdf.totalTTC,1.27);
});
test('incomplete or overprecise values never become accepted fiscal figures',()=>{
 const d=initialDraft('facture');d.client.name='Client test';d.lines=[row('1.005')];
 assert.ok(documentErrors(d,[{name:'Entreprise test'}]).length>0);
 assert.throws(()=>pdfPayload(d,[{name:'Entreprise test'}]));
 assert.deepEqual(totals([row('')]),{totalHT:0,totalTVA:0,totalTTC:0});
});
