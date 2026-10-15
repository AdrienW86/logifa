import test from 'node:test';
import assert from 'node:assert/strict';
import { ResendAccount } from '../../lib/email/resend.ts';
const message = { from: 'sender@example.test', replyTo: 'reply@example.test', senderName: 'Entreprise test', to: 'client@example.test', subject: 'Facture TEST-1', body: 'Document test', bytes: new TextEncoder().encode('%PDF-test'), filename: 'test.pdf', key: 'issuer/key' };
test('Resend uses approved domain, PDF attachment and stable retry key with mocked HTTP only', async () => {
  const calls = [];
  const provider = new ResendAccount('fake-test-key', async (url, init) => {
    calls.push({ url, init });
    return Response.json(url.includes('/domains') ? { data: [{ name: 'example.test', status: 'verified' }] } : { id: 'test-message' });
  });
  assert.equal(await provider.send(message), 'test-message');
  assert.equal(calls.length, 2);
  const request = calls[1].init, body = JSON.parse(request.body);
  assert.equal(request.headers['Idempotency-Key'], 'issuer/key');
  assert.deepEqual(body.to, ['client@example.test']);
  assert.equal(body.attachments[0].content, Buffer.from(message.bytes).toString('base64'));
});
test('unverified domain blocks dispatch', async () => {
  let requests = 0;
  const provider = new ResendAccount('fake', async () => { requests++; return Response.json({ data: [] }); });
  await assert.rejects(provider.send(message), /DOMAIN_NOT_VERIFIED/); assert.equal(requests, 1);
});
test('ambiguous network failure and server failure remain uncertain', async () => {
  for (const failure of ['network', 'server']) {
    const provider = new ResendAccount('fake', async url => {
      if (url.includes('/domains')) return Response.json({ data: [{ name: 'example.test', status: 'verified' }] });
      if (failure === 'network') throw new Error('Private provider details');
      return new Response('unavailable', { status: 503 });
    });
    await assert.rejects(provider.send(message), /^Error: MAIL_DELIVERY_UNCERTAIN$/);
  }
});
