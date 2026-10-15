type Fields = Record<string, unknown>;
const record = (v: unknown): Fields => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Fields : {};
export const addressFields = [
  ['street', 'Adresse', ['street', 'line1', 'address']],
  ['postal_code', 'Code postal', ['postal_code', 'zip', 'postcode']],
  ['city', 'Ville', ['city', 'town']],
  ['country', 'Pays', ['country']],
] as const;
export const contactFields = [
  ['email', 'E-mail', ['email']], ['phone', 'Téléphone', ['phone', 'telephone']],
] as const;
export function existingField(source: unknown, aliases: readonly string[]) {
  const row = record(source);
  return aliases.find(key => typeof row[key] === 'string') ?? aliases[0];
}
export function fieldValue(source: unknown, aliases: readonly string[]) {
  const row = record(source), value = row[existingField(source, aliases)];
  return typeof value === 'string' ? value : '';
}
// Preserve unknown historical keys and shapes; update only the fields displayed.
export function legalDetails(form: FormData, previous: Fields) {
  const merge = (group: string, fields: readonly (readonly [string, string, readonly string[]])[]) => {
    const source = previous[group], result = { ...record(source) };
    for (const [name, , aliases] of fields) {
      const key = `${group}_${name}`;
      if (form.has(key)) result[existingField(source, aliases)] = String(form.get(key) ?? '').trim();
    }
    return result;
  };
  const mentions = { ...record(previous.legal_mentions) };
  for (const key of ['payment_terms', 'pdf_footer', 'manager', 'insurance_label'])
    if (form.has(key)) mentions[key] = String(form.get(key) ?? '').trim();
  return {
    address: merge('address', addressFields), contacts: merge('contacts', contactFields),
    insurance: Array.isArray(previous.insurance) ? previous.insurance : [],
    legal_mentions: mentions,
  };
}
