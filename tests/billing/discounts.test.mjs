import test from 'node:test';
import assert from 'node:assert/strict';
import {lineTotals,exactLineTotals} from '../../lib/billing/validation.ts';
import {totals} from '../../lib/editor/model.ts';
import {validatedHistoricalPdf} from '../../lib/agent/historical-pdf.ts';
const line=(price,tva='20')=>({type:'normal',key:'test',name:'Travaux ou remise attestés',unit:'forfait',quantity:'1',price,tva});
test('signed discounts use exact cent arithmetic and matching VAT base',()=>{
 const lines=[line('100'),line('-10')];
 assert.equal(lineTotals(lines).gross,10800n);assert.equal(totals(lines).totalTTC,108);
 assert.deepEqual(exactLineTotals('0.50','-2.01','20'),{net:-101n,vat:-20n,gross:-121n});
 assert.throws(()=>lineTotals([line('100'),line('-10','10')]),/DISCOUNT_EXCEEDS_RATE_BASE/);
 assert.throws(()=>lineTotals([line('100'),line('-101')]),/DISCOUNT_EXCEEDS_RATE_BASE/);
});
test('explicit negative price in historical PDF is retained for review',()=>{
 const result=validatedHistoricalPdf({lines:[{type:'normal',name:'Remise écrite',quantity:'1',unit:'forfait',price:'-10',vat_rate:'20',evidence:'Remise -10'}],total_net:null,total_vat:null,total_gross:null,warnings:[]});
 assert.equal(result.lines[0].price,'-10');
});
