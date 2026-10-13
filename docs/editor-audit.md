# Refonte des éditeurs — audit avant développement

Référence : 38f3ea1, develop/logifa. Modification préexistante : suppression de
.env.example, conservée hors commit. README et rapports baseline/Clerk/3A lus.
Aucun AGENTS.md trouvé. Aucun code distant repris.

## Cartographie et contrat PDF

| Champ/état | Devis | Facture | Contrat |
| --- | --- | --- | --- |
| selectedCompany | 9 profils | 9 profils | Objet original complet, jamais fusionné par ID |
| client | name, street, cityZip, phone, email, workAddress | Identique | Chaînes, noms inchangés |
| prestations | Liste ordonnée | Liste ordonnée | title : name/type ; normal : name/type/quantity/unit/price/tva |
| unités | m², ml, unité, forfait | Identique | Chaînes exactes ; catalogue contient aussi m³ |
| totalHT/TVA/TTC | Sommes flottantes, arrondi seulement à l'affichage | Identique | Ne pas changer les arrondis transmis |
| invoiceNumber/formattedDate | D-date-millisecondes recalculé à chaque rendu | Idem | Référence locale, aucune émission serveur |
| showAcompte/acompte | Absent | Option + montant | PDF actuel ne les imprime pas |
| resteAPayer | Absent | Non défini dans aperçu | totalTTC-acompte dans appel PDF |
| isPaid/paymentDate/paymentMethod | Absent | Présents | Générateur sait tamponner ; contrôles serveur nécessaires |
| customInvoiceNumber/customInvoiceDate | Absent | Présents | Date ignorée par générateur ; numéro ne pilote pas l'en-tête |

Fonctions originales : ajouter, éditer, déplacer, supprimer, titres, export et
aperçu. Catalogue présent mais non branché. Aucun stockage de brouillon.
Titres devis non éditables ; unités non éditables dans les tableaux actuels.
Les PDF sont dessinés par jsPDF/AutoTable, sans capture DOM/CSS : styles UI isolables.

Anomalies conservées du moteur : facture TVA=0 et TTC=HT ; acompte non imprimé ;
conditions figées 30/30/40 ; dirigeant/assurance codés en dur ; placements hors
page possibles ; en-têtes multipages non répétés. Aucune correction de ces fichiers.
L'aperçu HTML facture plante lorsque l'acompte est activé (resteAPayer non défini).
Les références locales changent à chaque rendu et ne sont pas des numéros émis.

## Stratégie

Deux entrées de page légères, un éditeur partagé typé, un modèle de données pur
adapté au contrat original. Totaux inchangés. Aperçu généré par le moteur existant
dans un PDF réel, sans fabriquer un aperçu HTML différent. Catalogues et entreprises
importés directement. Aucun appel Supabase/IA tant que la recette d'intégration
n'est pas validée. Paiements locaux exclusivement déclaratifs.

Conflit d'empreintes explicite : la refonte autorise les deux pages à évoluer.
Le manifeste des 21 empreintes lot 1 reste inchangé ; deux copies historiques
exactes servent à conserver la référence, 19 fichiers sont vérifiés en place.
Les transformations vers les PDF seront testées contre les six fixtures.
La baseline avant changement n'a pas de test visuel navigateur authentifié ;
l'audit mobile du code constate table large, aperçu A4 fixe et champs sans labels.
Des tests navigateur isolés du composant, sans bypass Clerk de l'application,
vérifieront la refonte en desktop/mobile et sa navigation clavier.
