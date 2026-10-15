type Row = Record<string, unknown>;
export function allocationChoices(allocations: Row[], reversals: Row[], invoices: Row[]) {
  return allocations.map(row => {
    const invoice = invoices.find(invoice => invoice.id === row.invoice_id);
    if (!invoice) throw new Error('LOGIFA_SCOPE_NOT_FOUND');
    const remaining = BigInt(String(row.amount_minor)) - reversals.filter(reverse => reverse.allocation_id === row.id)
      .reduce((sum,reverse)=>sum+BigInt(String(reverse.amount_minor)),0n);
    if (remaining < 0n) throw new Error('PERSISTENCE_ALLOCATION_INVALID');
    return {id:row.id,invoice_number:invoice.invoice_number,remaining_minor:remaining.toString()};
  }).filter(row=>BigInt(row.remaining_minor)>0n);
}
