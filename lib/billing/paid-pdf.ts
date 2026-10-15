import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** Append a receipt to the actual archived PDF; never reconstruct fiscal pages. */
export async function appendPaymentReceipt(original: Uint8Array, receipt: {
  number: string; date: string; method: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28, 841.89]);
  page.drawText('ACQUITTÉE', { x: 45, y: 770, font: bold, size: 24, color: rgb(0.08, 0.25, 0.18) });
  const text = [
    `Facture : ${receipt.number}`,
    `Dernier règlement confirmé : ${receipt.date}`,
    `Moyen(s) de paiement : ${receipt.method}`,
    'Solde confirmé par le serveur : 0,00 EUR',
    'Les pages précédentes constituent la facture originale conservée.',
    'Cette annexe constate son règlement et ne crée aucune nouvelle facture.',
  ];
  let y = 725;
  for (const line of text) {
    // Standard PDF fonts cannot encode arbitrary Unicode supplied in labels.
    const safe = line.replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, ' ');
    const words = safe.split(/\s+/);
    let current = '';
    for (const word of words) {
      if (current && font.widthOfTextAtSize(`${current} ${word}`, 11) > 500) {
        page.drawText(current, { x: 45, y, font, size: 11 }); y -= 17; current = '';
      }
      current += `${current ? ' ' : ''}${word}`;
    }
    page.drawText(current, { x: 45, y, font, size: 11 }); y -= 30;
  }
  return pdf.save();
}
