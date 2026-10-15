import test from 'node:test';
import assert from 'node:assert/strict';
import { loadService } from '../helpers/load-service.mjs';
test('email template uses actual fiscal invoice number', async () => {
  const state = { context: null };
  const f = await loadService('lib/services/mail.ts', state, {
    '/auth/require-admin': 'export const requireAdmin = async () => "test-admin";',
    '/supabase/server': `export const databaseForAdmin = async () => ({ from() { const q = { select:()=>q, eq:()=>q, maybeSingle:async()=>({data:{id:"file",role:"original",sha256:"hash",original_filename:"test.pdf"}}) };return q;} });`,
    '/services/workspace': 'export const scopedRecord = async () => ({lifecycle:"issued",invoice_number:"TEST-4419",total_gross:"120.00"});',
    '/services/billing': 'export const checkedRpc = async (db,name) => name === "logifa_mail" ? {configured:true,key_version:1} : {remaining_minor:"12000",is_acquittable:false};',
    '/services/archive': 'export const verifiedPdf=async()=>new Uint8Array();',
    '/services/email-templates': 'export const selectedTemplate = async () => ({id:"template",revision:1,kind:"invoice",design:{}});',
    '/email/templates': 'export const renderEmail = (d,context) => { state.context=context;return {subject:context["document.number"],body:"Test",text:"Test"}; };',
    '/email/crypto': 'export const masterKey=()=>"mock";export const signPreview=()=>"mock-preview";export const checkPreview=()=>{};export const sealKey=()=>{};export const unsealKey=()=>{};',
  });
  try {
    const result = await f.module.previewMail('issuer', {kind:'invoice',document_id:'00000000-0000-4000-8000-000000000001',to:'client@example.test',subject:'Test',body:'Test'});
    assert.equal(result.subject,'TEST-4419');assert.equal(state.context['document.number'],'TEST-4419');
  } finally { await f.cleanup(); }
});
