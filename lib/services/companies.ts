import 'server-only';
import type { LocalCompany } from '../billing/company-import.ts';
import { companyImportPlan } from '../billing/company-import.ts';
import { databaseForAdmin } from '../supabase/server.ts';
import { requireAdmin } from '../auth/require-admin.ts';
import { checkedRpc } from './billing.ts';

// Preparation only: no route/UI calls this in lot 3A. Legal mapping is never inferred.
export async function importCompanyProfiles(companies: LocalCompany[]) {
  await requireAdmin(); const db = await databaseForAdmin();
  const plan = companyImportPlan(companies);
  let created = 0, preserved = 0;
  for (const row of plan) {
    const result = await checkedRpc(db,'logifa_workspace',{p_action:'import-profile',p_data:row});
    if (result.preserved === true) preserved++; else created++;
  }
  return { created, preserved, legalMappingsCreated: 0 };
}
