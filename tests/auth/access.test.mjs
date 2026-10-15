import test from 'node:test';
import assert from 'node:assert/strict';
import {accessStatus,isPublicPath,isApiPath} from '../../lib/auth/policy.ts';
test('admin identity fails closed without configuration, login or exact subject',()=>{
 assert.equal(accessStatus('user_admin',''),503);assert.equal(accessStatus(null,'user_admin'),401);
 assert.equal(accessStatus('user_other','user_admin'),403);assert.equal(accessStatus('user_admin','user_admin'),200);
});
test('only explicit public GET and HEAD paths bypass login',()=>{
 assert.equal(isPublicPath('/sign-in'),true);assert.equal(isPublicPath('/api/documents'),false);
 assert.equal(isPublicPath('/sign-in','POST'),false);assert.equal(isPublicPath('/sw.js','POST'),false);
 assert.equal(isApiPath('/api/invoices/id/pdf'),true);assert.equal(isApiPath('/api-malicious'),false);
});
