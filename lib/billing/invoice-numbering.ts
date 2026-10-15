/** Pure validation of the historical D-AAAAMJJ-XXXX series.
 * It is not a number allocator: only the locked server sequence assigns a fiscal number.
 */
export function formattedInvoiceNumber(isoDate: string, suffix: number): string {
  if (typeof isoDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate) ||
    !Number.isFinite(Date.parse(isoDate + "T00:00:00Z")) ||
    new Date(isoDate + "T00:00:00Z").toISOString().slice(0,10) !== isoDate)
    throw new Error("Date de facture invalide.");
  if (!Number.isSafeInteger(suffix) || suffix < 1 || suffix > 9999)
    throw new Error("Compteur de facture hors limites.");
  const [year,month,day] = isoDate.split("-");
  return "D-" + year + Number(month) + day + "-" + String(suffix).padStart(4,"0");
}

export function nextCounterFromExternalInvoice(reference: string, isoDate: string): number {
  if (typeof reference !== "string" || !/^D-\d{7,8}-\d{4}$/.test(reference))
    throw new Error("Référence attendue : D-AAAAMJJ-XXXX.");
  const suffix=Number(reference.slice(-4));
  if (formattedInvoiceNumber(isoDate,suffix) !== reference)
    throw new Error("Le numéro ne correspond pas à la date indiquée.");
  if (suffix >= 9999)
    throw new Error("La série à quatre chiffres est arrivée à sa limite.");
  return suffix+1;
}
