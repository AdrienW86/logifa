# LOGIFA — Documents historiques, devis vers facture et tarifs

## Principes immuables
- Un devis PDF importé reste une archive originale signée/hachée; ne jamais le remplacer.
- Conversion = nouveau **brouillon** de facture lié au devis source, jamais facture émise automatiquement.
- Périmètre: même `issuer_profile_id`, même client. Numéros, dates, TVA, acomptes et règlement doivent être vérifiés.
- Un devis historique peut ne pas être accepté; état à vérifier. Une facture acquittée n'est autorisée que sur une facture **émise**, intégralement réglée selon `logifa_invoice_balance.is_acquittable`.
- Pas de double facture finale, ni de déduction d'acompte sans pièce justificative enregistrée.

## Pipeline conversion PDF (à réaliser)
1. Lire `document_files` lié à un devis et contrôler l'émetteur et le client via `scopedRecord`; télécharger le PDF avec `verifiedPdf` (SHA-256).
2. Extraire depuis le PDF les désignations, unités, quantités, prix, taux, totaux, référence et dates par modèle multimodal ou parseur; la réponse est non fiable.
3. Présenter **une étape de revue**, signaler les champs non trouvés, discordances de totaux et possibles doublons. Aucun comblement automatique.
4. Après confirmation de l'administrateur seulement, instancier un brouillon de facture avec le moteur de sauvegarde existant, sa provenance `quote_id`, l'émetteur et le client du devis. Les documents historiques restent intacts.
5. Tester avec PDF texte, PDF scanné, 0/10/20 % TVA, sections, montants incohérents, devis signé, devis déjà facturé, tentatives inter-émetteurs, PDF hostile, PDF volumineux, reprise de session.

## Grille tarifaire à partir des PDF (à réaliser)
- Suggestions **par émetteur uniquement**, jamais grille globale ni tarifs actifs sans validation.
- Conserver par référence : pièce d'origine, date, prestation normalisée, quantité, unité, prix HT, TVA déclarée, contexte et niveau d'incertitude.
- Mettre en quarantaine les écarts, variations de contexte, prestations forfaitaires et doublons; classement et consolidation validés par l'administrateur.
- Une facture historique fournit des prix passés, pas des tarifs garantis actuels.

## Factures acquittées (fonction existante, exposition UI)
- `GET /api/invoices/[id]/pdf?issuer=...&paid=1` appelle `managedInvoiceBytes`, qui exige `is_acquittable===true`.
- Le bouton UI n'est visible que si `lifecycle==='issued'` et le solde serveur confirme l'acquittement. Ne jamais marquer une facture acquittée depuis un simple libellé historique.
- La conservation en archive du PDF acquitté peut être déclenchée par l'action serveur `archiveManagedInvoice` avec confirmation.
