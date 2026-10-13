# Agent : conservation des prestations à compléter

## Cause vérifiée

L’adaptateur supprimait toute une ligne si quantité, prix ou TVA était `null`,
ou si une preuve financière manquait. Le contrat de proposition exigeait ensuite
des valeurs complètes. Pourtant la réponse OpenAI autorisait explicitement `null`
pour les données inconnues. Cette contradiction faisait disparaître les postes
techniques pertinents d’une demande sans tarif ni TVA.

Une liste vide produisait également un changement artificiel « 0 postes conservés

- 0 proposés », ce qui permettait une confirmation vide. Les corrections
  précédentes ne couvraient que des prestations entièrement chiffrées.

Les deux réponses payantes de l’utilisateur n’ayant pas été enregistrées, leur
nombre réel de lignes ne peut pas être reconstitué. Aucun nouveau appel OpenAI
n’a été effectué pour cette correction. Les chiffres ci-dessous proviennent
des réponses contrôlées, clairement identifiées dans `tests/fixtures/agent-roofing.mjs`.

## Parcours vérifié

Chromium remplit la consigne, sélectionne Couverture Catalane et clique les
boutons réels. « Préparer la consigne » ne déclenche aucun appel. « Demander une
proposition IA » envoie un POST avec la consigne exacte et le brouillon courant.
La recette exécute le vrai handler `/api/agent`, le constructeur de contexte,
le validateur et l’adaptateur ; seules l’authentification, la lecture serveur du
profil et la réponse fournisseur sont simulées. Le contexte comporte le nom
de Couverture Catalane, le nom du client saisi, les lignes existantes et le
catalogue. Les coordonnées et paiements ne sont pas transmis au fournisseur.

| Consigne de recette                                                                                                     | Lignes contrôlées reçues | Écartées avant correction | Retenues après | Écartées après | Incomplètes |
| ----------------------------------------------------------------------------------------------------------------------- | -----------------------: | ------------------------: | -------------: | -------------: | ----------: |
| Prépare un devis pour un remplacement de toiture.                                                                       |                        5 |                         5 |              5 |              0 |           5 |
| Prépare un devis de remplacement de toiture de 100 m², avec dépose, écran sous-toiture, liteaunage, tuiles et faîtages. |                        5 |                         5 |              5 |              0 |           5 |

La seconde formulation est une reconstruction du descriptif fourni, pas une
copie prétendue de la consigne détaillée envoyée précédemment. Avant correction,
les cinq lignes étaient écartées pour prix et TVA inconnus, avec quantités
également inconnues selon les postes.

## Correction et diagnostics

- Les nouvelles lignes de brouillon acceptent des chaînes vides pour unité,
  quantité, prix et TVA inconnus. Il n’y a aucune conversion de `null` en 0 ou 1.
  Les données manquantes sont visibles comme « À compléter » dans la revue.
- Une valeur financière non prouvée est retirée du champ concerné, sans supprimer
  la désignation ni les autres champs justifiés. Les preuves et taux explicites
  restent obligatoires pour conserver une valeur. Les erreurs structurelles,
  identités inventées et pouvoirs financiers restent refusés.
  Une preuve de surface en m² ne peut pas justifier une quantité en ml : le test
  de propagation des 100 m² au faîtage conserve sa désignation mais vide la quantité.
- Les instructions distinguent suggestions techniques à confirmer et faits
  chiffrés explicitement fournis. Une surface globale ne doit pas être propagée
  à des longueurs de faîtage ou à tous les postes par supposition.
- Le handler retourne des diagnostics réservés à l’administrateur : lignes
  reçues/acceptées/rejetées/incomplètes et motifs par index/champ. Codes :
  `UNKNOWN`, `INVALID_NUMBER`, `UNSUPPORTED_VALUE`, `UNKNOWN_OR_INVALID`.
  Le résumé de requête contient seulement des compteurs et booléens (taille de
  consigne, présence émetteur/client, nombre de lignes et entrées catalogue).
  Aucun prompt, nom, clé, jeton ou coordonnées n’est journalisé. Les compteurs
  sont également affichés dans le statut du formulaire pour le diagnostic.
- Sans ligne ni modification de ligne exploitable : HTTP 422 `AGENT_NO_LINES`,
  message explicite et aucune fenêtre de confirmation vide. Une proposition
  de liste vide n’engendre plus un faux changement dans le modèle.
- Les contrôles PDF et fiscaux exigent toujours des données complètes et valides.
  Aucun générateur PDF, CSS, logo ou paramètre de clé n’est modifié.

## Résultats

Les deux scénarios Chromium montrent 5 prestations, 25 champs détaillés dans la
revue et aucune mutation avant clic humain ; après confirmation, les 5 lignes
sont présentes. Les prix et TVA restent vides ; le faîtage n’a pas de quantité
fictive. Un troisième scénario vérifie le refus explicite d’une réponse sans poste.

24 tests éditeur/agent, 12 tests Chromium/PDF, 9 tests d’authentification et
35 tests financiers passent (80 tests). TypeScript strict dans les trois
configurations, build Next.js isolé et 21 empreintes historiques vérifiés.
Un premier passage du scénario manuel existant a échoué sur la saisie de quantité
(1 au lieu de 2) ; le rejeu complet est passé sans modification de ce scénario.
Cette intermittence de recette manuelle est documentée séparément du défaut IA.

L’aperçu et l’application des demandes testées sont vérifiés avec réponses
contrôlées. La qualité d’une prochaine réponse réelle au prompt général reste
un comportement du fournisseur à observer ; les nouveaux diagnostics donneront
ses nombres exacts sans devoir deviner les rejets. Aucun document fiscal n’a été
enregistré, aucun e-mail envoyé, aucun appel payant ou changement distant effectué.
