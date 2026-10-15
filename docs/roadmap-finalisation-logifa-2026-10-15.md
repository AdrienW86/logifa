# LOGIFA — Plan complet de finalisation
_Date : 15 octobre 2026. Document de pilotage ; non équivalent à une mise en production validée._

## Journal de livraison — suite du 15 octobre 2026

**État constaté** : corrections poussées directement sur `master`. Les derniers commits ont passé le job GitHub Actions `validate` et le build Vercel `Ready`. Cela ne constitue **pas** une recette complète en situation réelle avec envoi fiscal.

| Périmètre | État vérifié | Reste à valider |
| --- | --- | --- |
| Acomptes successifs 30 % / 30 % / solde | Moteur déterministe en centimes, montant et pourcentage libres, propositions dans l'éditeur | Scénarios comptables/TVA multiples et vrais PDF émis |
| Rattachement à une facture finale | RPC transactionnelle `logifa_link_all_deposits` et bouton final lié à l'entreprise/devis/chantier | Recette avec deux acomptes réellement émis |
| Affichage et performance des soldes | RPC `logifa_invoice_balances` en une requête sécurisée par émetteur | Mesure de latence avec grand volume et pagination serveur |
| Reprise de numérotation | Journal privé de réconciliation, endpoint admin et écran de confirmation, contrôles de référence `D-AAAAMJJ-XXXX` | Réconciliation **effective** de la série Couverture Catalane et vérification des archives |
| Devis historiques signés | Action de vérification humaine de l'accord et contrôle du PDF, audit privé, lien vers le moteur de facturation | Vérification sur un vrai document et pièce d'accord adaptée |
| PDF factures | Pagination des mentions et récapitulatifs d'acompte sans ajout systématique d'une page | Recette visuelle PDF 1–3 pages, remise, décimales, TVA et acquittement |
| Mail | Branchements d'envoi et transfert chiffré déjà présents | Essai d'envoi réellement reçu et contrôle d'expéditeur |
| Tarifs IA | Préparation de suggestions de tarifs par émetteur et validation manuelle existantes | Corpus approuvé, évaluations métier, cas de remises négatives |

**Mesures de prudence** : dans Supabase production, le verrou `invoice_numbering_hold` de Couverture Catalane demeure actif ; aucune facture réelle n'a été émise, aucun règlement n'a été fabriqué, aucune ancienne référence n'a été renumérotée et aucun mail client n'a été envoyé par ces travaux. Les comptes e-mail anciens ont été préservés.

**Exigences réglementaires de référence** :
- [Mentions obligatoires sur une facture, Entreprendre Service Public (vérifié août 2026)](https://entreprendre.service-public.gouv.fr/vosdroits/F31808), notamment date de versement d'acompte, numéro unique et continu, taux TVA, remises, échéance et mentions de pénalités.
- [Devis et acceptation, Entreprendre Service Public](https://entreprendre.service-public.gouv.fr/vosdroits/F31144) : ne pas inférer l'accord du client d'un statut importé.
- [BOFiP TVA services et encaissement des acomptes](https://bofip.impots.gouv.fr/bofip/283-PGP.html) : distinguer facture d'acompte, TVA exigible et paiement réellement encaissé.

**Étapes prioritaires suivantes** : recette réelle d'acompte n°1/n°2/finale, remises négatives sans distortion des totaux, mentions fiscales et archivage automatique sûr, traitement des paiements et version acquittée, envoi Resend de test, agent de devis V2 et grilles tarifaires.

## Objectif produit
Logifa est réservé à un seul administrateur. Chaque entreprise est un **émetteur juridiquement distinct**, possédant son carnet, ses devis, factures, règlements, archives, paramètres fiscaux, modèles, couleurs, clés d'envoi et catalogues tarifaires. Aucun compte client. Interface enterprise-first, mobile et PWA, sans exposition de données entre émetteurs.

**Règle UX retenue** : la saisie en cours est sauvegardée automatiquement ou explicitement comme travail non émis, mais le bouton principal **« Enregistrer la facture »** confirme l'émission définitive, attribue immédiatement le numéro fiscal et archive le PDF. Après cette opération, le PDF n'affiche jamais « BROUILLON ». Une facture émise ne peut être modifiée librement. Devis et factures n'ont pas nécessairement la même transition ; un devis peut être révisé avant acceptation, et son numéro doit suivre des règles distinctes.

**Alerte prioritaire** : le compteur de factures **déjà configuré en production** sur la principale entité émettrice n'est pas cohérent avec la dernière facture externe transmise par l'utilisateur. Aucune émission réelle ne doit être lancée avant réconciliation documentée. Ne pas déduire automatiquement la suite à partir d'un seul PDF ; vérifier les archives, les dates d'émission et les séries existantes. La revue de l'identité fiscale de cette entité est actuellement non validée.

## 0. Critères transversaux de livraison (chaque lot)
- [ ] Relire état réel `master`, schéma et migrations de la **bonne** base Supabase, pas seulement le code.
- [ ] Migration additive et idempotente, contrôles de préconditions, rollback et sauvegarde vérifiée.
- [ ] TypeScript, lint/build Vercel, tests unitaires, intégration SQL, tests navigateur mobile/desktop, cas de non-admin et inter-émetteurs.
- [ ] Essais métier sur véritables exemples fournis par l'utilisateur, sans créer de fausses factures fiscales en production.
- [ ] Aucun fichier client, PDF, coordonnées privées ou secret ajouté au dépôt public.
- [ ] Tests et recette de déploiement, mention explicite « non testé » si non vérifié.
- [ ] Journal d'audit et trace des opérations critiques (émission, paiement, avoir, envoi, export).

## LOT 1 — Numérotation et émission (P0, avant première facture)
- [ ] Réconcilier l'ensemble des factures historiques de chaque émetteur : numéro, date, type (acompte, solde, avoir), état émis, séquences indépendantes.
- [ ] Corriger le compteur de production après contrôle de la série, sans en changer arbitrairement le format, sans doublon ni trou inexpliqué.
- [ ] Vérifier les contraintes de numérotation unique, continue et chronologique, concurrence, changement d'année/date, limites, idempotence et isolation entre entités.
- [ ] Repenser le parcours : édition simple → aperçu → contrôle récapitulatif → « Enregistrer et émettre » → numéro attribué + PDF archivé + facture consultable.
- [ ] Mettre un enregistrement automatique fiable de la saisie en préparation ; reprise après fermeture, conflit d'onglets, réseau coupé, sans réserver de numéro fiscal.
- [ ] Afficher clairement la différence « en préparation / émise / à envoyer / envoyée / partiellement réglée / acquittée / en retard / rectifiée » ; ne plus laisser un PDF BROUILLON après émission.
- [ ] Intégrer confirmation avant émission : client, SIRET/SIREN si requis, coordonnées, adresse chantier, dates, catégorie d'opération, TVA, conditions et total dû.
- [ ] Enregistrer numéro, date d'émission, snapshots juridiques et PDF dans un parcours transactionnel et récupérable ; vérifier les erreurs après allocation de numéro.
- [ ] Bloquer la modification et suppression des factures émises ; correction uniquement selon règles fiscales via avoir / nouvelle facture.
- [ ] Ne pas confondre « enregistrement » et « envoi » ; l'envoi reste un second acte indépendant.

## LOT 2 — PDFs professionnels et paramétrage émetteur (P0)
- [ ] Auditer devis / facture / facture d'acompte / facture finale / avoir / version acquittée sur vraies pièces (visuels et montants).
- [ ] Rendre fiables les couleurs, logos, typographies, pied de page, formats et mentions issus de la **bonne** entreprise, côté aperçu et côté PDF serveur.
- [ ] Maintenir la pagination et la lisibilité des longues prestations, titres de section, totaux et annexes sur plusieurs pages.
- [ ] Corriger la reprise d'adresse client : numéro et rue séparés du code postal et de la ville, éviter la ville incluse dans le champ rue.
- [ ] Contrôler les champs obligatoires, les régimes TVA, mentions de non-assujettissement/franchise, assurance/décennale, échéance, bon de commande, escomptes/pénalités selon cas.
- [ ] Rendre explicites les remises et postes négatifs dans le modèle financier, sans provoquer une fausse TVA ni des totaux inexacts.
- [ ] Adapter le PDF facture d'acompte : montant réellement facturé, paiements précédents, reste dû, référence de devis, éviter de présenter la totalité des travaux comme montant facturé de l'acompte.
- [ ] Tests de non-régression visuels : identité, couleur RGB, entête autoTable, calcul et pagination, toutes les entreprises.

## LOT 3 — Cycle des devis et factures (P0/P1)
- [ ] Devis : création libre, dupliquer, versionner, imprimer, envoyer, statut envoyé/accepté/refusé/expiré, date d'acceptation et pièce justificative.
- [ ] Signature électronique optionnelle avec fournisseur (pas de signature prétendue ou inventée), devis signé conservé en archive.
- [ ] Transformer un devis accepté en facture classique ou facture d'acompte / finale en conservant le lien et les montants vérifiés.
- [ ] Bloquer les factures finales en double et contrôler les acomptes déjà émis.
- [ ] Factures d'acompte successives : montants/%, TVA et bases, échéanciers, arrondis, cumul et solde.
- [ ] Facture finale : déduction exacte des acomptes déjà facturés et appliqués, pas de double déduction.
- [ ] Avoir partiel/total, remboursements, annulations, corrections, références croisées et limites sur acomptes/finales.
- [ ] Dupliquer un document sans recopier numéro/date/stamp fiscal, avec émetteur et client conservés dans le bon périmètre.

## LOT 4 — Envoi et communications (P0/P1)
- [ ] Raccorder correctement la configuration Resend/chiffrement et les modèles e-mail de l'ancien émetteur inactif au nouvel émetteur principal **sans recopier le ciphertext brut** ; vérification de domaine et expéditeur.
- [ ] Terminer le parcours « Envoyer par e-mail » depuis une facture émise archivée : destinataire, objet, modèle, aperçu, pièce jointe PDF original SHA-256.
- [ ] Réaliser une **véritable** recette d'envoi autorisé : réception boîte mail, affichage Gmail/Outlook/mobile, pièces jointes et état envoyé/échec/incertain.
- [ ] Historique d'envoi horodaté par document, adresse utilisée, fournisseur, ID message, tentative, état.
- [ ] Prévenir les doubles envois au retry, aucun envoi automatique lors de la sauvegarde/émission.
- [ ] Modèles par émetteur : devis, facture, acompte, acquittée, relance, personnalisables et versionnés.
- [ ] Relances manuelles puis éventuellement planifiées uniquement après validation explicite et limites raisonnables.
- [ ] Bouton télécharger/copier le lien sécurisé si utile, en gardant les PDF privés et les permissions.

## LOT 5 — Paiements et factures acquittées (P0/P1)
- [ ] Enregistrer règlements manuels : date, montant, mode, référence, justificatif, statut à contrôler.
- [ ] Gérer paiement partiel, plusieurs paiements, trop-perçu, remboursement, acompte à allouer et rapprochement.
- [ ] Calculer état et solde exact d'après écritures, sans inférer « payé » de la mention sur un PDF historique.
- [ ] Produire version PDF « ACQUITTÉE » **uniquement** si solde serveur nul et paiement validé, avec date et preuve des règlements.
- [ ] Archiver original et variante acquittée distinctement ; récupérer l'une ou l'autre et envoyer la bonne variante.
- [ ] Tableau factures impayées/en retard/payées + exports de règlements.

## LOT 6 — IA Devis & Factures V2 (P1)
- [ ] Agent conversationnel à partir d'une consigne : identifier émetteur, client, chantier et travaux ; demander seulement les informations indispensables.
- [ ] Produire un **vrai devis professionnel détaillé** avec sections de travaux, matériaux, métrés et prestations attestées, depuis sources fournies.
- [ ] Réutiliser uniquement le catalogue et les tarifs approuvés de l'émetteur ; jamais de quantité, tarif, TVA ou travaux inventés.
- [ ] Séparer rédaction, planification des postes, rapprochement de références tarifaires et contrôle des calculs monétaires côté serveur.
- [ ] Comparaison avant/après, zones incertaines, ajustements interactifs, validation humaine avant application ; aucun numéro/emission/envoi/paiement déclenché par IA.
- [ ] Agent facture : générer depuis devis accepté/chantier ou historique, respecter acompte/finale/avoirs et références.
- [ ] Gestion sécurisée des appels OpenAI : modèles paramétrables, plafonds budget, quotas persistants, erreurs, journal sans données sensibles, prompts PDF hostiles.
- [ ] Corpus de modèles métier anonymisés et approuvés ; évaluations comparatives sur devis complexes (sans entrainement automatique sur dossiers privés).

## LOT 7 — Archives historiques et grille de tarifs (P1)
- [ ] Import PDF robuste pour devis, factures, règlements historiques, statuts et originaux/signes ; reprise idempotente et sans doublon.
- [ ] Extraction multimodale PDF texte/scans, sections, quantités, remises, TVA et montants ; détection incohérences et revue obligatoire.
- [ ] Conversion devis historique -> facture en une seule action fluide ; client/adresses/lignes cohérentes, acceptation et pièces originales vérifiées.
- [ ] **Grille tarifaire par émetteur** issue des anciens devis et factures : suggestions avec provenance et date, validation tarif par tarif, prix historiques non considérés automatiquement comme prix actuels.
- [ ] Catalogue manuel avec familles, unités, TVA autorisée, prix HT, favoris, recherche, mises à jour de prix et version.
- [ ] Archivage SHA-256, immutabilité des documents émis/importés et variantes, recherche full-text et export ZIP sécurisé par entreprise.
- [ ] Sauvegarde et restauration contrôlée des documents et métadonnées.

## LOT 8 — Espace entreprise, clients, tableaux de bord (P1)
- [ ] Accueil : une carte par entreprise **active**, sans anciennes entrées de démonstration ni doublons.
- [ ] Espaces dédiés : accueil, clients, devis, factures, encaissements, documents, modèles et réglages, sans navigation hors périmètre.
- [ ] Client : créer/éditer/archiver/réactiver, coordonnées, adresses de chantier, historique devis/factures/paiements.
- [ ] Interface réduisant drastiquement les formulaires longs : étapes dédiées, états évidents, boutons d'action visibles, confirmation avant émission.
- [ ] Éliminer les formulations fausses (« persistance désactivée », « clients uniquement manuels » quand serveur actif) et les messages techniques incompréhensibles.
- [ ] Recherche/filtres/pagination côté serveur, pas de chargement de toutes les tables et tous les soldes à chaque navigation.
- [ ] Tableau de bord par entreprise : chiffre d'affaires réellement émis, facturé, payé, restes dus, retards, devis en attente ; distinction des indicateurs.
- [ ] Responsive mobile/tablette et PWA, versions obsolètes, erreurs réseau, protection d'une session privée.

## LOT 9 — Fiscalité et facturation électronique (P0 sécurité juridique / P2 connexion)
- [ ] Revue de chaque entité juridique : identité, régime TVA, coordonnées, mentions PDF, assurance et séparation juridico-comptable.
- [ ] Contrôles des mentions obligatoires des factures françaises applicables à chaque client/opération.
- [ ] Factur-X (PDF/A-3 + XML structuré conforme) avec validations automatisées, sans prétendre qu'un simple PDF est une facture électronique transmise.
- [ ] Intégration ultérieure avec une **plateforme agréée** pour e-invoicing/e-reporting, récupération des statuts et réception factures selon réglementation.
- [ ] Identifier les obligations calendrier : réception pour les entreprises assujetties depuis sept. 2026, émission PME/TPE/micro au plus tard sept. 2027, selon cas.
- [ ] Journal d'audit, conservation des pièces, export comptable et restitution complète par émetteur.
- [ ] Aucun envoi réglementaire simulé, connexion PA uniquement après choix et autorisation.

## LOT 10 — Qualité, exploitation et recette finale (P0 continu)
- [ ] Préproduction isolée et fixtures anonymisées ; jeu de tests d'acompte/solde/remises/avoirs/TVA.
- [ ] Recette d'émission en conditions contrôlées et avec approbation explicite : numéro, archivage, téléchargement, PDF immuable, reprise après panne.
- [ ] Recette mailing de bout en bout et facture acquittée, uniquement avec données de test autorisées.
- [ ] Tests charge/temps de chargement DB, pagination, index, quotas OpenAI et protection contre la double soumission.
- [ ] Tests de sécurité : administrateur unique Clerk, RLS Supabase, isolement émetteurs, JWT expirés, Storage, secrets e-mail, RGPD.
- [ ] Logs exploitables, surveillance erreurs et alertes, sauvegardes et restauration, limitations de coûts.
- [ ] Vérifier `npm run typecheck`, les suites de tests pertinentes et le **déploiement Vercel Ready** ; test navigateur réel de la production avant annonce de livraison.
- [ ] Guide d'utilisation clair et procédure de récupération en cas d'import ou d'envoi interrompu.

## Ordre de livraison recommandé
1. **Blocage numérotation + émission, état et PDF** (lots 1, 2, prérequis fiscal 9).
2. **E-mails et factures acquittées** (lots 4, 5) avec vrai test contrôlé.
3. **Devis, acomptes, finales, avoirs, acceptation** (lot 3).
4. **IA V2, catalogues tarifs, import historique** (lots 6, 7).
5. **Ergonomie, performances, reporting, conformité Factur-X/PA** (lots 8, 9).
6. **Recette intégrale et déploiement final** (lot 10).

## État connu / à ne pas confondre
- **Déjà codé en partie** : auth admin Clerk, isolations DB, éditeurs, PDF, import de PDF, extraction multimodale, génération structurée OpenAI, propositions avec validation, moteur d'acomptes/avoirs/paiements, génération de PDF acquitté conditionnelle, UI e-mail/modèles Resend, PWA.
- **Partiellement validé** : PDF couleurs/format en usage réel, transfert du compte e-mail de l'ancien profil, conversion devis historique, factures acquittées réelles, calculs d'acompte complexes.
- **Planifié, pas livré** : nouvelle UX d'enregistrement = émission immédiate avec numéro, IA Devis V2 complète, grille tarifaire dérivée des archives, Factur-X/connexion PA, signature électronique.
- **Ne pas prétendre testé** : envoi e-mail réel, facture fiscale émise de bout en bout, paiement réel, conformité réglementaire auditée. Les anciens rapports de recette sont datés et beaucoup documentent des tests locaux.

## Décision importante
Pour supprimer le mot « BROUILLON » **après** sauvegarde, ne jamais distribuer à l'avance des numéros à des documents librement éditables : automatiser la préparation, puis faire de « Enregistrer » une action explicite et définitive qui prend un numéro fiscal atomiquement, affiche le PDF et permet l'envoi. Une facture non émise reste un simple travail préparatoire, non une facture fiscale.



## Journal d'avancement — première session de la mission nocturne

**Livré sur `master` :**
- Module `lib/billing/deposit-schedule.ts` (centimes et demi-up) pour premier acompte 30 %, second 30 %, solde 40 % réellement restant, montant et taux libres ; tests `tests/billing/deposit-schedule.test.mjs` basés sur le PDF du 30/09/2026 (9 904,04 € → 2 971,21 € + 2 971,21 € + 3 961,62 €).
- UI de création d'acompte libre **sans devis**, exigeant une description réelle, un montant HT et un taux de TVA choisi explicitement ; aide à la ventilation depuis un devis et rappels des acomptes déjà émis.
- Nouveau parcours facture « Enregistrer et numéroter » distinct de « conserver ma saisie sans numéro » : sauvegarde serveur → émission contrôlée/numérotation → verrouillage → tentative d'archivage du PDF, avec message de reprise si la dernière étape échoue. Aucun envoi automatique.
- PDF serveur des acomptes liés à un devis : montant initial TTC, acompte(s) déjà facturé(s), montant de la pièce, reste **à facturer** (ne pas confondre avec dette exigible), avec contrôle de dépassement.
- Contrôle serveur des acomptes : interdiction de dépasser le montant du devis ; autorisation d'un acompte sans devis, mais la facture finale reste obligatoirement liée à un chantier ou devis ; refus d'émettre une finale tant que les acomptes de ce dossier ne sont pas associés pour déduction ; bouton de rattachement multiple idempotent.
- Verrou explicite de numérotation en base pour Couverture Catalane : impossible d'émettre une facture de cette société avec l'ancien compteur non vérifié. Réconciliation des pièces manquante.
- Fonction Supabase et route administrateur de **copie**, et non déplacement, du compte Resend source inactif avec rechiffrement AES-GCM sur la destination, plus duplication des modèles ; action déclenchée uniquement sur validation humaine dans Paramètres e-mail. Configuration source conservée jusqu'à essai d'envoi.
- CI GitHub Actions TypeScript + tests de facturation sur `master`.

**Migrations Supabase appliquées sur le projet `bniitcbsaowwzkjdrqwz` :**
- `hold_unreconciled_invoices_and_allow_manual_deposits_20261015` : blocage de numérotation litigieuse, acomptes libres et limite au montant du devis ;
- `require_all_issued_deposits_linked_before_final_invoice` : vérification de toutes les déductions avant finale ;
- `secure_copied_mail_setup_between_same_issuer_profiles` : RPC protégée pour copie mail entre profils identiques en SIRET/nom et statut actif/inactif.

**Limitations et travaux indispensables :**
- Aucun numéro réel n'a été attribué, aucune facture envoyée, aucun paiement ni accord client créé ou supposé.
- La numérotation doit être justifiée par l'historique réel et le statut fiscal `reviewed` de l'émetteur doit être confirmé par l'administrateur avant de déverrouiller l'émission.
- Les remises négatives de la facture externe, la TVA multi-taux, les acomptes historiques sans lignes et la représentation des avoirs nécessitent des recettes financières approfondies avant émission.
- Le transfert Resend est développé, **mais pas exécuté ni testé en envoi réel**.
- La sauvegarde/émission/archivage se compose encore de plusieurs requêtes : vérifier systématiquement la reprise si l'archivage échoue après l'émission.
- La numérotation et les documents originaux restent immuables ; aucun test réel de facture émise en production.
- Aucun connecteur facturation électronique PA, aucune IA V2 autonome complète, aucun catalogue tarifaire historique validé livré à ce stade.
- CI/vérification Vercel : consulter leurs états **sur le dernier SHA**, ne pas déduire la réussite des commits précédents.

**Références juridiques consultées en octobre 2026** :
- Mentions obligatoires sur les factures et date des acomptes : https://entreprendre.service-public.gouv.fr/vosdroits/F31808
- Exigibilité de la TVA et acomptes : https://entreprendre.service-public.gouv.fr/vosdroits/F31412
- Franchise en base (mention art. 293 B) : https://bofip.impots.gouv.fr/bofip/1079-PGP.html/identifiant=BOI-TVA-DECLA-40-10-20-20260701
- Facturation électronique et échéances : https://entreprendre.service-public.gouv.fr/actualites/A15683



### Complément — catalogue tarifaire et agent IA

- Table privée et RPC `logifa_private.issuer_tariffs` / `public.logifa_issuer_tariffs` en base de production, réservées à l'administrateur et contrôlant l'émetteur.
- Un devis PDF **historique archivé** peut proposer ses lignes prouvées et ses prix dans un catalogue **en attente** ; pas d'approbation automatique, pas d'utilisation de prix à 0 € comme tarif de référence.
- Dans **Réglages → Tarifs de l'entreprise**, chaque suggestion peut être approuvée ou archivée par l'administrateur. L'approbation d'un tarif historique comme prix actuel est une décision manuelle explicite.
- L'agent OpenAI reçoit seulement les tarifs **approuvés de l'émetteur actuellement sélectionné**. L'ancien catalogue statique global est désormais exclu du contexte et de la preuve de prix pour toute entreprise rattachée à Supabase.
- Le catalogue initial est vide ; aucune valeur n'a été présumée ni récupérée d'une autre entreprise. Tests réels d'extraction → approbation → devis professionnel encore à effectuer. IA V2 (planification, métrés, contrôle sémantique) reste non achevée.

**Acceptation historique** : un ancien statut « signé » déclaré ne constitue pas à lui seul une preuve suffisante d'acceptation. Avant une facture de solde liée à un devis historique, vérifier le PDF signé ou un document d'acceptation explicite et relier cette preuve. Ne pas changer automatiquement le statut d'un devis historique sur la base d'une déclaration non vérifiée.

### Bilan de la première livraison, contrôles réels

Dernier commit fonctionnel : `5ebea43b3372917be1be02be3d519a54d47cf219`.
GitHub Actions (typecheck et tests de facturation) **SUCCESS** et Vercel **READY** sur ce SHA.

- `61ad20bd7dca546aa77e4cd25d615c4fecd92126` : correction du PDF classique pour respecter montants de TVA/TTC et n'afficher la mention de franchise (art. 293 B) que si le régime fiscal déclaré est `exempt` ; sécurité des aperçus marqués non émis.
- `7c4a111149c176cf520127fc169e331bbc9c6d85` puis `1d7088a9e3b66e6a6a5b53e3aab337cdde0ca54e` : recherche ciblée des doublons d'archives historiques, par numéro et par entité juridique au lieu de scanner les 500 premiers documents. Le premier commit a échoué à la compilation ; le second a réparé le problème et passé CI/Vercel.
- `5ebea43b3372917be1be02be3d519a54d47cf219` : les factures d'acompte sur devis historique PDF peuvent utiliser les lignes extraites après validation et comparaison au total TTC du devis, sans inventer de taxes ni de prix.
- Vraie émission, vraie livraison de mail, vrai acquittement, transfert Resend **non déclenchés** ; l'utilisateur doit valider les données comptables et fiscales. Le système de numérotation reste volontairement bloqué pour Couverture Catalane.
- Le traitement fiscal des **remises négatives** de la facture de référence de 9 904,04 € reste à implémenter via un modèle explicitement dédié aux remises, avec ventilation correcte par taux et base de TVA. Ne pas forcer des prix négatifs dans le validateur financier actuel.
- La validation de l'acceptation d'un devis historique, les tests bout-en-bout des paiements, les modèles d'avoirs, le vrai cycle d'email et la conformité aux plateformes agréées restent au programme.

Aucune tâche nocturne récurrente n'a pu être créée dans ce fil, le compte ayant atteint sa limite de cinq automatisations actives. Les travaux effectués ici ont eu lieu pendant l'exécution de cette conversation ; ne pas présenter cette limitation comme un travail continu programmé.

## Reprise vérifiée du 15 octobre — interface fiscale

Voir [l'audit de reprise](audit-reprise-2026-10-15.md). La base réelle utilise désormais 4419 ; ne pas appliquer les anciens exemples de reprise à 22. Aucun compteur modifié.

Livré : retrait des quatre éditeurs JSON fiscaux, champs adresse/coordonnées, conservation des clés historiques et assurances, affichage local des erreurs, séparation rue/code postal-ville client. TypeScript et deux tests de compatibilité exécutés. Recette métier authentifiée non effectuée.

## Lot conservation des PDF et e-mails

Les consultations servent l'original archivé et vérifié SHA-256. La variante acquittée exige un document émis, un original archivé et un solde serveur acquittable ; elle ajoute une annexe aux pages originales inchangées. Les calculs de cumul des acomptes du PDF utilisent désormais des centimes BigInt. Les modèles e-mail reprennent `invoice_number`.

Validation locale : TypeScript, build Next.js et 20 tests unitaires/services (dont conservation des flux des pages PDF, rejet d'une variante non réglée, original manquant, domaine d'envoi et idempotency key sur HTTP simulé). Aucun appel Resend réel. Le premier lot `8577be4` est marqué déployé par le statut Vercel publié sur GitHub.

## Lot moteur SQL reproductible et limites IA

Les quatre migrations de socle appliquées ont été récupérées en lecture seule dans `supabase/baseline/`, hors du répertoire des migrations à appliquer. La recette PGlite utilise exclusivement des schémas et identités synthétiques. Elle teste acomptes 30/30/finale 40, règlements partiels/multiples, remboursement, avoir sans faux encaissement, numérotation/idempotence/antériorité, RLS et client hors entreprise.

Migration **appliquée à Supabase Logifa** : `20261015094131_logifa_persistent_agent_limits`. Table privée RLS sans accès direct, wrapper authentifié et garde administrateur. Dix requêtes/heure et cinquante/jour partagées entre PDF et propositions. Compteurs en production vides après application ; aucun appel IA effectué. L'outil CLI migration échouant sur son répertoire utilisateur en lecture seule, le fichier a été préparé localement puis aligné sur la version réellement attribuée par Supabase.

Validation exécutée : **33 tests**, lint de correction/sécurité JavaScript-TypeScript, TypeScript strict et build Next.js. Les commandes de test qui pointaient vers des fichiers absents ont été remplacées par les commandes exécutables ; CI étendue aux mêmes contrôles. Les tests ne remplacent pas une recette JWT Clerk/Storage distante ni la concurrence entre plusieurs connexions PostgreSQL. Budget en euros à configurer aussi côté projet OpenAI ; le quota d'appels ne constitue pas un plafond monétaire.

## Lot pagination et changement d'entreprise

Clients, devis, factures et règlements : pages de 50, ordre stable date/id, recherche serveur, filtre client et filtre d'émetteur systématique. Les soldes sont récupérés pour les seules factures de la page. Les réponses tardives sont abandonnées ; le changement d'entreprise efface immédiatement les anciennes listes. Une fiche client hors du chargement initial reste consultable.

Validation : 35 tests unitaires et SQL, une recette Chromium mobile avec 51 clients synthétiques (page 2, ouverture d'une fiche absente du chargement initial, changement d'entreprise, aucune erreur JavaScript), TypeScript, lint et build. Le navigateur simule Clerk et les API ; il ne prouve pas l'intégration distante. CI inclut désormais cette recette. Le chargement de référence initial et les indicateurs restent plafonnés à 500, signalés comme partiels : optimisation complémentaire nécessaire pour très gros volumes. Recherche des documents par numéro et des règlements par référence bancaire.

## Lot arrondis, émission et remboursement

Calculs d'aperçu et montants des lignes PDF locaux alignés sur les arrondis serveur par ligne, en centimes BigInt. L'émission teste la génération PDF avant allocation du numéro et archive côté serveur ; une erreur Storage conserve le numéro émis et retourne un état de récupération explicite. Le remboursement propose les factures et leurs affectations nettes, sans saisie d'identifiant technique ; il reste une opération humaine confirmée et contrôlée par le moteur existant.

Validation : 41 tests unitaires/SQL, recette Chromium mobile étendue au choix d'une affectation de remboursement, TypeScript, lint, build. `npm audit --omit=dev` exécuté : zéro vulnérabilité signalée. Aucun remboursement ni émission réelle effectué. La réaffectation d'un règlement sans remboursement n'est pas encore ajoutée.

## Remises en attente et recette complète

La [migration des remises](remises-migration-en-attente.md) est publiée pour revue, mais **non appliquée** à Supabase : accord explicite demandé après refus de la revue automatique. Les adaptations applicatives correspondantes restent locales et ne sont pas livrées en production.

La [procédure de recette complète](recette-complete-2026-10-15.md) décrit le parcours, les preuves disponibles et les travaux restants. L'accueil masque désormais les entreprises désactivées ; contrôle Chromium effectué sur données synthétiques.
