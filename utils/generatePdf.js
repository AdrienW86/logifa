import { pdfAccentRgb } from "./pdf-accent";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const generatePdf = ({ client, prestations, selectedCompany, invoiceNumber, formattedDate, totalHT, totalTVA, totalTTC }) => {
  const pdf = new jsPDF("p", "mm", "a4");
  const accentRgb = pdfAccentRgb(selectedCompany.color);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;

  // Fonction pour dessiner le logo + titre sur chaque page
  const drawHeader = () => {
    const img = new Image();
    img.src = selectedCompany.logo;
    pdf.addImage(img, "PNG", margin, 10, 35, 35);

    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...accentRgb);
    pdf.text(selectedCompany.name, margin + 45, 18);

    pdf.setFontSize(9);
    pdf.setTextColor(0);

    
    //pdf.text("Dirigeant: Roblès Gregory ", margin + 45, 24);
    pdf.text(selectedCompany.address, margin + 45, 29);
    pdf.text(selectedCompany.cityZip, margin + 45, 34);

   // pdf.text("Police d'assurance n° 00/S.10001.019032 ", margin + 45, 39);


    pdf.text(`Tel : ${selectedCompany.phone}`, margin + 45, 44);
    pdf.text(selectedCompany.email, margin + 45, 49);
    pdf.text(`SIRET : ${selectedCompany.siret}`, margin + 45, 54);

    pdf.setFontSize(18);
    pdf.setTextColor(...accentRgb);
    pdf.text("DEVIS", pageWidth - margin, 20, { align: "right" });

    pdf.setFontSize(10);
    pdf.setTextColor(0);
    pdf.text(`N° : ${invoiceNumber}`, pageWidth - margin, 27, { align: "right" });
    pdf.text(`Date : ${formattedDate}`, pageWidth - margin, 33, { align: "right" });
  };

  drawHeader();

  // =========================
  // BLOC CLIENT
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
    { label: "Lieu de l'intervention :", value: client.workAddress }
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
  clientInfo.forEach(info => {
    pdf.setFont("helvetica", "bold");
    pdf.text(info.label, margin + 5, clientY);
    pdf.setFont("helvetica", "normal");
    pdf.text(info.value || "-", margin + 50, clientY);
    clientY += lineSpacing;
  });

  // =========================
  // TABLEAU PRESTATIONS (autoTable multi-page)
  // =========================
  const usableWidth = pageWidth - margin * 2;
  const body = prestations.map(p => {
    if (p.type === "title") {
      return [{
        content: p.name,
        colSpan: 5,
        styles: { fillColor: [245, 245, 245], textColor: accentRgb, fontStyle: "bold" }
      }];
    }
    return [
      p.name,
      `${p.quantity} ${p.unit}`,
      `${p.price.toFixed(2)} €`,
      `${p.tva}%`,
      `${(p.totalNet ?? p.price * p.quantity).toFixed(2)} €`
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
      4: { cellWidth: usableWidth * 0.2, halign: "center" }
    },
    headStyles: { fillColor: accentRgb, textColor: 255, halign: "center" },
    styles: { fontSize: 9, cellPadding: 3 },
    // didDrawPage: (data) => {
    //   if (data.pageNumber > 1) drawHeader(); // répéter logo/titre sur chaque page
    // }
  });

  // =========================
  // BLOC TOTAL + CONDITIONS
  // =========================
  let finalY = pdf.lastAutoTable.finalY + 10;
  const boxHeight = 30;

  if (finalY + boxHeight > pageHeight - margin) {
    pdf.addPage();
    finalY = margin;
  }

  const totalX = pageWidth - margin - 70; // largeur bloc total 70
  pdf.setDrawColor(...accentRgb);
  pdf.rect(totalX, finalY, 70, boxHeight);

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  pdf.text(`Total HT : ${totalHT.toFixed(2)} €`, totalX + 70 - 2, finalY + 8, { align: "right" });
  pdf.text(`TVA : ${totalTVA.toFixed(2)} €`, totalX + 70 - 2, finalY + 15, { align: "right" });
  pdf.setFontSize(12);
  pdf.setTextColor(...accentRgb);
  //pdf.text("Remise exceptionnelle : -500€", totalX + 70 - 2, finalY + 24, { align: "right" });

  pdf.text(`TOTAL TTC : ${totalTTC.toFixed(2)} €`, totalX + 70 - 2, finalY + 24, { align: "right" });

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
  pdf.text("• 30% à la signature", condTextX, condY);
  condY += 5;
  pdf.text("• 30% au début des travaux", condTextX, condY);
  condY += 5;
  pdf.text("• 40% à la fin des travaux", condTextX, condY);

  // Bon pour accord
  const bonY = finalY + boxHeight + 5;
  pdf.setFont("helvetica", "bold");
  pdf.text('Signature précédée de la mention manuscrite :', condX, bonY + 6);
  pdf.text('" Bon pour accord, lu et approuvé "', condX, bonY + 12);
  pdf.setFont("helvetica", "normal");
  pdf.text("Fait à ___________________, le ____/____/__________", condX, bonY + 24);
  pdf.text("Signature du client :", condX, bonY + 32);

pdf.setFontSize(6);
  if (selectedCompany.vatRegime === "exempt") {
    pdf.text("TVA non applicable, art. 293 B du Code Général des Impôts (CGI)", condX + 60, bonY + 225);
  }
  // =========================
  // Sauvegarde
  // =========================
  pdf.save(`Devis_${invoiceNumber}.pdf`);
};