import { pdfAccentRgb } from "./pdf-accent";
import type { PdfPayload } from "../types/editor";
import type { RowInput, Table } from "jspdf-autotable";
declare module "jspdf" {
  interface jsPDF {
    lastAutoTable: Table;
  }
}
export interface ManagedPayload extends PdfPayload {
  prestations: (PdfPayload["prestations"][number] & { totalNet?: number })[];
  logoBytes: Uint8Array;
  documentTitle: string;
  manager: string;
  insuranceLabel: string;
  paymentTerms: string;
  legalFooter: string[];
  deductions: { label: string; amount: number }[];
  netDue: number;
  contract?: { reference: string; totalGross: number; previousIssuedGross: number; remainingToInvoice: number };
}
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

export const generateManagedInvoice = (
  {
    client,
    prestations,
    selectedCompany,
    invoiceNumber,
    formattedDate,
    totalHT,
    totalTVA,
    totalTTC,
    showAcompte,
    acompte,
    resteAPayer,
    isPaid,
    paymentDate,
    paymentMethod,
    customInvoiceNumber,
    logoBytes,
    documentTitle,
    manager,
    insuranceLabel,
    paymentTerms,
    legalFooter,
    deductions,
    netDue,
    contract,
  }: ManagedPayload,
  reference?: { creationDate: string; fileId: string },
) => {
  const pdf = new jsPDF("p", "mm", "a4");
  const accentRgb = pdfAccentRgb(selectedCompany.color);
  if (reference) {
    pdf.setCreationDate(reference.creationDate);
    pdf.setFileId(reference.fileId);
  }
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;

  // =========================
  // Header
  // =========================
  const drawHeader = () => {
    const img = logoBytes;
    pdf.addImage(img, "PNG", margin, 10, 35, 35);

    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...accentRgb);
    pdf.text(selectedCompany.name, margin + 45, 18);

    pdf.setFontSize(9);
    pdf.setTextColor(0);

    pdf.text(manager, margin + 45, 24);
    pdf.text(selectedCompany.address, margin + 45, 29);
    pdf.text(selectedCompany.cityZip, margin + 45, 34);

    pdf.text(insuranceLabel, margin + 45, 39);

    pdf.text(`Tel : ${selectedCompany.phone}`, margin + 45, 44);
    pdf.text(selectedCompany.email, margin + 45, 49);
    pdf.text(`SIRET : ${selectedCompany.siret}`, margin + 45, 54);

    pdf.setFontSize(18);
    pdf.setTextColor(...accentRgb);
    pdf.text(documentTitle, pageWidth - margin, 20, { align: "right" });

    pdf.setFontSize(10);
    pdf.setTextColor(0);
    pdf.text(`N° : ${invoiceNumber}`, pageWidth - margin, 27, {
      align: "right",
    });
    pdf.text(`Date : ${formattedDate}`, pageWidth - margin, 33, {
      align: "right",
    });
  };

  drawHeader();

  // =========================
  // Bloc client
  // =========================
  const startY = 60;
  const padding = 5;
  const lineSpacing = 7;

  const clientInfo = [
    { label: "Nom :", value: client.name },
    { label: "Adresse :", value: client.street },
    { label: "Code postal et ville :", value: client.cityZip },
    { label: "Téléphone :", value: client.phone },
    { label: "Email :", value: client.email },
    { label: "Lieu de l'intervention :", value: client.workAddress },
  ];

  const clientHeight = clientInfo.length * lineSpacing + padding * 2;

  pdf.setDrawColor(200);
  pdf.rect(margin, startY, pageWidth - margin * 2, clientHeight);

  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...accentRgb);
  pdf.text("CLIENT", margin + 5, startY + padding);

  pdf.setTextColor(0);
  let clientY = startY + padding + lineSpacing;
  clientInfo.forEach((info) => {
    pdf.setFont("helvetica", "bold");
    pdf.text(info.label, margin + 5, clientY);
    pdf.setFont("helvetica", "normal");
    pdf.text(info.value || "-", margin + 50, clientY);
    clientY += lineSpacing;
  });

  // =========================
  // Tableau prestations
  // =========================
  const usableWidth = pageWidth - margin * 2;
  const body: RowInput[] = prestations.map((p) => {
    if (p.type === "title") {
      return [
        {
          content: p.name,
          colSpan: 5,
          styles: {
            fillColor: [245, 245, 245],
            textColor: accentRgb,
            fontStyle: "bold",
          },
        },
      ];
    }
    return [
      p.name,
      `${p.quantity} ${p.unit}`,
      `${p.price.toFixed(2)} €`,
      `${p.tva}%`,
      `${(p.totalNet ?? p.price * p.quantity).toFixed(2)} €`,
    ];
  });

  autoTable(pdf, {
    startY: startY + clientHeight + 10,
    head: [["Désignation", "Quantité", "PU", "TVA", "Montant HT"]],
    body: body,
    theme: "grid",
    tableWidth: usableWidth,
    columnStyles: {
      0: { cellWidth: usableWidth * 0.4, halign: "left" },
      1: { cellWidth: usableWidth * 0.15, halign: "center" },
      2: { cellWidth: usableWidth * 0.15, halign: "center" },
      3: { cellWidth: usableWidth * 0.1, halign: "center" },
      4: { cellWidth: usableWidth * 0.2, halign: "center" },
    },
    headStyles: {
      fillColor: accentRgb,
      textColor: 255,
      halign: "center",
    },
    styles: { fontSize: 9, cellPadding: 3 },
    // didDrawPage: (data) => {
    //   if (data.pageNumber > 1) drawHeader();
    // }
  });

  // =========================
  // Bloc total et conditions
  // =========================
  const lastY = pdf.lastAutoTable.finalY;
  if (lastY === undefined) throw new Error("PDF_TABLE_REQUIRED");
  let finalY = lastY + 10;
  const boxHeight = 30;

  if (finalY + boxHeight > pageHeight - margin) {
    pdf.addPage();
    finalY = margin;
  }

  // Bloc total
  const totalX = pageWidth - margin - 70;
  pdf.setDrawColor(...accentRgb);
  pdf.rect(totalX, finalY, 70, boxHeight);

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  pdf.text(`Total HT : ${totalHT.toFixed(2)} €`, totalX + 70 - 2, finalY + 6, {
    align: "right",
  });
  pdf.text(`TVA : ${totalTVA.toFixed(2)} €`, totalX + 70 - 2, finalY + 13, {
    align: "right",
  });

  //pdf.setFontSize(12);
  pdf.setTextColor(...accentRgb);
  pdf.text(
    `TOTAL TTC : ${totalTTC.toFixed(2)} €`,
    totalX + 70 - 2,
    finalY + 20,
    { align: "right" },
  );

  pdf.setTextColor(0, 0, 0);
  if (contract) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(`Reste à facturer : ${contract.remainingToInvoice.toFixed(2)} €`,
      totalX + 70 - 2, finalY + 27, { align: "right" });
    pdf.setFontSize(10);
  }

  //pdf.text(`ACOMPTE 30% : 2971,21 €`, totalX + 70 - 2, finalY + 27, { align: "right" });

  pdf.setTextColor(...accentRgb);
  //pdf.text(`Net à payer: 2971,21 €`, totalX + 70 - 2, finalY + 34, { align: "right" });

  //pdf.setTextColor(0,0,0);

  //pdf.text(`Reste à payer: 6932,83 € TTC`, totalX + 70 - 2, finalY + 41, { align: "right" });

  pdf.setFontSize(12);
  pdf.setTextColor(0, 0, 0);

  // Bloc conditions
  const condX = margin;
  pdf.setDrawColor(...accentRgb);
  pdf.rect(condX, finalY, 90, boxHeight);

  pdf.setFontSize(10);
  pdf.setTextColor(0);
  const condPadding = 8;
  let condY = finalY + condPadding;
  const condTextX = condX + condPadding;

  pdf.setFont("helvetica", "bold");
  pdf.text("Conditions de paiement :", condTextX, condY);
  condY += 6;
  pdf.setFont("helvetica", "normal");
  pdf.text(pdf.splitTextToSize(paymentTerms, 74), condTextX, condY);

  if (isPaid) {
    condY += 5;
    pdf.setFont("helvetica", "bold");
    condY += 6;

    pdf.text(
      `Facture payée le : ${paymentDate ? paymentDate.slice(0, 10).split("-").reverse().join("/") : "—"}`,
      condTextX,
      condY,
    );
    condY += 5;
    pdf.text(`Moyen de paiement : ${paymentMethod || "—"}`, condTextX, condY);
    pdf.setFontSize(6);
  } else {
    // Bon pour accord
    const bonY = finalY + boxHeight + 5;
    pdf.setFont("helvetica", "bold");
    pdf.text(`Facture émise le : ${formattedDate}`, condX, bonY + 5);
    pdf.text(pdf.splitTextToSize(paymentTerms, 180), condX, bonY + 10);
  }

  if (deductions.length || legalFooter.length) {
    pdf.addPage();
    pdf.setFontSize(11);
    pdf.setTextColor(0);
    let annexY = 20;
    pdf.text("Details et mentions complementaires", 15, annexY);
    annexY += 10;
    if (contract) {
      pdf.setFontSize(10);
      pdf.text(`Reference du devis : ${contract.reference}`, 15, annexY);
      annexY += 7;
      pdf.text(`Montant total contractuel TTC : ${contract.totalGross.toFixed(2)} EUR`, 15, annexY);
      annexY += 7;
      pdf.text(`Acomptes deja factures : ${contract.previousIssuedGross.toFixed(2)} EUR`, 15, annexY);
      annexY += 7;
      pdf.text(`Montant facture sur cette piece : ${totalTTC.toFixed(2)} EUR`, 15, annexY);
      annexY += 7;
      pdf.text(`Reste a facturer (non assimilable a une dette exigible) : ${contract.remainingToInvoice.toFixed(2)} EUR`, 15, annexY);
      annexY += 12;
    }
    for (const row of deductions) {
      pdf.text(`${row.label} : ${row.amount.toFixed(2)} EUR`, 15, annexY);
      annexY += 7;
    }
    pdf.text(`Net fiscal a payer : ${netDue.toFixed(2)} EUR`, 15, annexY);
    annexY += 12;
    for (const mention of legalFooter) {
      const lines = pdf.splitTextToSize(mention, 180);
      if (annexY + lines.length * 5 > 275) {
        pdf.addPage();
        annexY = 20;
      }
      pdf.text(lines, 15, annexY);
      annexY += lines.length * 5 + 5;
    }
  }
  // =========================
  // Sauvegarde
  // =========================
  if (isPaid) {
    const stampText = "ACQUITTÉ";
    const fontSize = 50;

    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const x = pageWidth / 2;
      const y = pageHeight / 2;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(fontSize);

      // Opacité
      pdf.setGState(pdf.GState({ opacity: 0.2 }));

      // Rouge
      pdf.setTextColor(255, 0, 0);

      // Diagonale
      pdf.text(stampText, x, y, {
        align: "center",
        baseline: "middle",
        angle: -45,
      });

      // Remettre les paramètres par défaut
      pdf.setGState(pdf.GState({ opacity: 1 }));
      pdf.setTextColor(0);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
    }
  }
  return new Uint8Array(pdf.output("arraybuffer"));
};
