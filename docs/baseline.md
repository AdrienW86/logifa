# LOGIFA — référence fonctionnelle locale, lot 1

> Après la refonte UX autorisée, 19 fichiers de cette référence restent identiques
> en place ; les deux pages historiques sont archivées et vérifiées par leurs
> empreintes originales. Voir [editor-ux.md](editor-ux.md), sans changement des PDF.

Date : 12 octobre 2026. Le code local est la référence. Aucun code distant n'a été repris.

## Périmètre conservé

- Next.js 16.1.6, React/React DOM 19.2.3, jsPDF 4.2.0, AutoTable 5.0.7, html2canvas 1.4.1.
- Aucun changement dans les éditeurs, les générateurs PDF, les CSS, les logos ou le README existant.
- Aucun ajout de Clerk, Supabase ou OpenAI ; aucune migration ni publication distante.
- L'accueil `/` est vide. Le bandeau permet de naviguer vers `/devis` et `/facture`.

## Inventaire : devis

Fichiers : `app/devis/page.js`, `app/devis/devis.module.css`, `utils/generatePdf.js`.

- Choix parmi neuf profils émetteurs : identité, coordonnées, SIRET, couleur et logo.
- Saisie client : nom, rue, code postal/ville, téléphone, email et adresse des travaux.
- Ajout d'une prestation : désignation, quantité, unité (m², ml, unité, forfait), prix unitaire et TVA.
- Ajout de titres de section, exclus des calculs.
- Modification des lignes de prestation : désignation, quantité, prix et TVA ; bouton Enregistrer.
- Suppression et déplacement haut/bas des lignes et titres.
- Calcul HT, TVA et TTC ; aperçu HTML A4 avec entreprise, client, tableau, totaux, conditions et accord.
- Téléchargement du devis PDF A4 avec tableau AutoTable pouvant occuper plusieurs pages.
- Conditions 30 % / 30 % / 40 %, zone de signature et mention de TVA dans le générateur.

## Inventaire : factures

Fichiers : `app/facture/page.js`, `app/facture/facture.module.css`, `utils/generateFacture.js`.

- Même choix d'émetteur, champs client et saisie des prestations que le devis.
- Titres, modification, suppression, déplacement et calculs HT/TVA/TTC.
- Option acompte versé et champ montant.
- Option acquittée : date de paiement, moyen (espèces, carte, virement, chèque), numéro initial et date d'émission.
- Aperçu HTML avec conditions de paiement ou informations de règlement.
- Export PDF A4 ; tampon diagonal ACQUITTÉE sur chaque page et informations de paiement quand l'option est active.
- Certaines options de l'interface ne sont pas reflétées dans le PDF : voir les anomalies ci-dessous.

## Données et ressources

`app/company.js` contient neuf profils. `app/prestations.js` contient un catalogue non branché aux pages.
Les onze PNG de `public/` et `app/favicon.ico` font partie de la référence Git, y compris les images non actuellement utilisées.
Les PDF sont dessinés par jsPDF : ils ne sont pas une capture des aperçus HTML. html2canvas n'a aucun usage trouvé.
Les données des éditeurs sont uniquement en mémoire React ; il n'existe ni sauvegarde, ni historique, ni authentification.

## Anomalies observées dans le code — non corrigées

1. Les ID 6 et 7 des entreprises sont dupliqués ; plusieurs profils ont un SIRET commun.
2. Le numéro est recalculé à chaque rendu avec Date.now(), sans garantie d'unicité. Les factures ont également le préfixe D-.
3. Le PDF facture force la TVA des lignes et du total à zéro, et affiche le HT comme TTC, même si l'interface calcule une TVA.
4. Le PDF facture ne restitue pas l'acompte et le reste à payer. Les références initiales et la date personnalisée ne pilotent pas son en-tête.
5. L'aperçu facture utilise `resteAPayer` sans déclaration : activer l'acompte expose une ReferenceError au rendu. L'expression calculée dans l'appel PDF ne définit pas cette variable pour l'aperçu.
6. Le PDF facture contient un dirigeant et une assurance codés en dur, indépendants de l'émetteur sélectionné.
7. La répétition de l'en-tête PDF sur les pages suivantes est commentée. Certains placements de mentions et signatures peuvent dépasser la page ; vérification visuelle nécessaire.
8. Les logos sont insérés via une Image sans attente explicite de chargement : vérifier le premier export à froid.
9. Dans le devis, une saisie numérique vide en modification peut devenir NaN. Le prix zéro numérique est rejeté par la condition d'ajout alors que la chaîne "0" est acceptée.
10. Le reset après ajout d'une prestation omet `type` ; les générateurs traitent néanmoins les lignes non-title comme des prestations normales.
11. Le CSS facture ne définit pas toutes les classes utilisées, notamment `mentions` et `titleRow`.

Ces observations proviennent de la lecture du code. Aucun parcours navigateur ni contrôle visuel PDF n'est présenté comme effectué.

## Références de contrôle

Voir `tests/fixtures/documents.json` et `tests/fixtures/README.md`. Six scénarios fictifs sont préparés : devis standard/multipage, facture standard/multipage, acompte, acquittée.
Ils ne contiennent aucun client réel, émetteur réel, SIRET réel ou référence personnelle. Aucun PDF binaire n'est produit dans ce lot.
Un outil local de préparation fournit les données au format attendu par les générateurs, sans les modifier.
Le cas acompte est conservé comme reproduction d'une anomalie existante, pas comme parcours réussi.

## Vérification de préservation

`tests/fixtures/source-hashes.json` conserve les SHA-256 bruts du README, des éditeurs, des générateurs, des CSS et des PNG.
Commande : `node tests/fixtures/verify.mjs`. Elle contrôle les empreintes, les scénarios, les calculs attendus et les chemins de logos existants.
Les octets locaux peuvent différer des blobs Git par la conversion LF/CRLF ; les empreintes brutes contrôlent le dossier local actuel.
Le build n'a pas été lancé : ce lot prépare une référence et ne certifie pas une exécution navigateur réussie.

## Référence Git fixée

- Commit `f35906f` sur `master` : projet local complet, 32 fichiers suivis, README actuel inclus sans modification de ses octets.
- Branche `develop/logifa` créée après ce commit pour la suite du développement.
- Un second commit sur cette branche ajoute uniquement ce document et les quatre fichiers de préparation sous `tests/fixtures/` (37 fichiers suivis au total).
- Exclusions vérifiées : `.env`, `.env.local`, `node_modules/`, `.next/`, `scratch.tmp`, `secrets/test.key`. Les fichiers `.DS_Store` restent ignorés.
- Recherche ciblée de signatures de clés privées et de jetons OpenAI/AWS/GitHub : aucune correspondance dans les fichiers préparés pour Git. Ce contrôle ne prétend pas détecter tous les formats de secrets possibles.
- Les coordonnées métier déjà présentes dans le code restent dans la référence, conformément à la conservation du projet. Elles ne sont pas copiées dans les fixtures.
- Résultat du contrôle local : 21 empreintes inchangées, six scénarios cohérents et neuf chemins de logos émetteurs présents (onze PNG conservés).
- Aucun push, aucune installation de dépendance, aucun changement de code métier.
