import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legalDetails, fieldValue } from '../../lib/workspace/legal-form.ts';

test('ordinary legal fields preserve historical aliases, extra keys, insurance and mentions', () => {
  const previous = { address: { line1: 'Ancienne rue', zip: '66000', extra: 'bâtiment B' }, contacts: { email: 'avant@example.test', fax: 'conservé' }, insurance: [{ insurer: 'Contrat historique', policy: '123' }], legal_mentions: { unknown: 'conservé', payment_terms: '30 jours' } };
  const form = new FormData();
  form.set('address_street', 'Nouvelle rue'); form.set('contacts_email', 'apres@example.test'); form.set('pdf_footer', 'Mentions relues');
  const result = legalDetails(form, previous);
  assert.deepEqual(result.address, { line1: 'Nouvelle rue', zip: '66000', extra: 'bâtiment B' });
  assert.deepEqual(result.contacts, { email: 'apres@example.test', fax: 'conservé' });
  assert.deepEqual(result.insurance, previous.insurance);
  assert.equal(result.legal_mentions.unknown, 'conservé');
  assert.equal(result.legal_mentions.payment_terms, '30 jours');
  assert.equal(previous.address.line1, 'Ancienne rue');
});
test('clearing a displayed field works without deleting other fields', () => {
  const form = new FormData(); form.set('address_street', '');
  assert.deepEqual(legalDetails(form, { address: { street: 'Rue', city: 'Ville' } }).address, { street: '', city: 'Ville' });
  assert.equal(fieldValue({ postcode: '66000' }, ['postal_code', 'zip', 'postcode']), '66000');
});
