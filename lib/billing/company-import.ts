import { createHash } from 'node:crypto';

export type { Company as LocalCompany } from "../../types/editor";
import type { Company as LocalCompany } from "../../types/editor";
export function companyImportPlan(companies: LocalCompany[]) {
  return companies.map((company, index) => ({
    source_key: `local/company/position-${String(index+1).padStart(4,'0')}`,
    source_fingerprint: createHash('sha256').update(JSON.stringify(company)).digest('hex'),
    source_local_id: company.id, commercial_name: company.name, source_siret: company.siret,
    address: company.address, city_zip: company.cityZip, phone: company.phone, email: company.email,
    logo_path: company.logo, color: company.color, pdf_template: 'local-v1', legal_entity_id: null,
    metadata: { review_required: true, local_position: index + 1 },
  }));
}
