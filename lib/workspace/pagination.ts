export const pageKinds = {
  clients: { table: 'clients', search: 'company_name' },
  devis: { table: 'quotes', search: 'quote_number' },
  factures: { table: 'invoices', search: 'invoice_number' },
  paiements: { table: 'payments', search: 'bank_reference' },
} as const;
export function pageInput(query: URLSearchParams) {
  const kind = query.get('section') ?? '';
  if (!Object.hasOwn(pageKinds, kind)) throw new Error('INPUT_SECTION');
  const raw = query.get('page') ?? '0';
  if (!/^\d{1,6}$/.test(raw)) throw new Error('INPUT_PAGE');
  const search = (query.get('search') ?? '').trim();
  if (search.length > 100) throw new Error('INPUT_SEARCH');
  return { kind: kind as keyof typeof pageKinds, page: Number(raw), size: 50, search,
    client: query.get('client') || undefined };
}
export function searchPattern(search: string) {
  return '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
}
