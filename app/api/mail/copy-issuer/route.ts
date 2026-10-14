import { requireAdmin } from "@/lib/auth/require-admin";
import { databaseForAdmin } from "@/lib/supabase/server";
import { checkedRpc } from "@/lib/services/billing";
import { masterKey, sealKey, unsealKey } from "@/lib/email/crypto";
import { isRecord } from "@/lib/editor/contracts";
import { uuid } from "@/lib/billing/validation";
import { errorResponse, mutationOrigin, privateJson } from "@/lib/workspace/http";

/**
 * Copy a mail setup from an unused legacy issuer to the active issuer.
 * The source remains untouched, and the Resend key is re-sealed with the
 * destination issuer as authenticated encryption associated data.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
    mutationOrigin(request);
    if (Number(request.headers.get("content-length") ?? 0) > 4096)
      throw new Error("INPUT_SIZE");
    const data: unknown = await request.json();
    if (!isRecord(data) || data.confirmed !== true ||
      data.confirmation !== "COPIER LA CONFIGURATION")
      throw new Error("HUMAN_CONFIRMATION_REQUIRED");
    const source = uuid(data.source_issuer);
    const destination = uuid(data.destination_issuer);
    if (source === destination) throw new Error("MAIL_TRANSFER_SCOPE");
    const db = await databaseForAdmin();
    const profiles = await db.from("issuer_profiles")
      .select("id,active,source_siret,commercial_name,legal_entity_id")
      .in("id", [source,destination]);
    if (profiles.error || !Array.isArray(profiles.data)) throw new Error("MAIL_TRANSFER_SCOPE");
    const from = profiles.data.find((p)=>p.id===source);
    const to = profiles.data.find((p)=>p.id===destination);
    const sir = (v: unknown) => typeof v === "string" ? v.replace(/\D/g,"") : "";
    if (!from || !to || from.active !== false || to.active !== true ||
      !sir(from.source_siret) || sir(from.source_siret)!==sir(to.source_siret) ||
      String(from.commercial_name).trim().toLowerCase() !==
      String(to.commercial_name).trim().toLowerCase() ||
      from.legal_entity_id !== null || !to.legal_entity_id)
      throw new Error("MAIL_TRANSFER_COMPANY_MISMATCH");
    const credentials = await checkedRpc(db,"logifa_mail",{
      p_action:"credentials",p_issuer:source,p_data:{},
    });
    const keys = [masterKey(process.env.LOGIFA_EMAIL_ENCRYPTION_KEY)];
    if (process.env.LOGIFA_EMAIL_PREVIOUS_ENCRYPTION_KEY)
      keys.push(masterKey(process.env.LOGIFA_EMAIL_PREVIOUS_ENCRYPTION_KEY));
    const plaintext = unsealKey(credentials.encrypted_key,source,keys);
    const encrypted = sealKey(plaintext,destination,keys[0]);
    const result = await checkedRpc(db,"logifa_copy_mail_setup",{
      p_from:source,p_to:destination,p_encrypted:encrypted,
    });
    return privateJson({ copied: result.copied === true,
      template_count: result.template_count,
      message:"Configuration copiée sans suppression de la source. Vérifiez l'expéditeur et effectuez un envoi de test avant de désactiver l'ancien profil.",
    });
  } catch (error) { return errorResponse(error); }
}
