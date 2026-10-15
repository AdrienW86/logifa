import 'server-only';
import { billingService } from './billing';
import { scopedRecord } from './workspace';
import { managedInvoiceBytes, archiveManagedInvoice } from './managed-pdf';

/** Storage cannot share a PostgreSQL transaction: return issued numbers even when archiving needs recovery. */
export async function issueAndArchive(kind: 'quote' | 'invoice', id: string, issuer: string, date: string) {
  const row = await scopedRecord(kind === 'quote' ? 'quotes' : 'invoices', id, issuer);
  if (row.lifecycle === 'draft') {
    // Fail on invalid logos, missing assets or PDF data before allocating a fiscal number.
    await managedInvoiceBytes(id, issuer, false, kind);
  }
  const issued = await billingService.issue(kind, id, date);
  try {
    await archiveManagedInvoice(id, issuer, false, kind);
    return { ...issued, archive: { state: 'archived' as const } };
  } catch {
    // The fiscal transaction is already committed. Never suggest reissuing or hide its number.
    return { ...issued, archive: { state: 'pending' as const, code: 'ARCHIVE_PENDING' } };
  }
}
