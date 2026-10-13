# Correction du préremplissage OpenAI

## Diagnostic

Le premier script réel avait masqué l’exception sous `LIVE_VALIDATION_FAILED`
et n’avait pas enregistré la réponse. Sa cause exacte ne peut donc pas être
prouvée rétrospectivement. Un seul nouvel appel réel, explicitement autorisé,
a reproduit l’échec et conservé uniquement une consigne et une réponse fictives.

La réponse respecte le JSON Schema, mais utilise `price: "10 euros"`,
`tva: "20 %"` et des preuves comme `« quantité 2 »`. L’adaptateur attendait des
chaînes numériques et une preuve littéralement incluse dans la consigne.
Il écartait donc la ligne avec « Justifier les mesures et tarifs ». La proposition
contenait zéro ligne et l’assertion de recette `0 !== 1` échouait. Il n’y a pas de
validation Zod dans ce chemin : JSON Schema fournisseur puis validation maison.

Une seconde lacune empêchait une revue détaillée des nouveaux postes : seul le
nombre de prestations ajoutées apparaissait, sans leurs valeurs individuelles.

## Correction

Dans l’adaptateur uniquement : normalisation ancrée des formats numériques
connus (décimale virgule/point, suffixe euro pour prix, pourcentage pour TVA),
et retrait d’une paire de guillemets de citation. Aucun calcul, estimation ou
remplacement de valeur absente. Toute preuve normalisée doit toujours être
exactement présente dans la consigne et justifier le nombre proposé ; la TVA
doit toujours être explicitement indiquée. Les mêmes contrôles s’appliquent
aux ajouts et aux modifications des lignes existantes.

L’éditeur affiche maintenant désignation, unité, quantité, prix HT et TVA de
chaque nouveau poste dans la revue, avant toute application. Ses contrôles de
confirmation, de brouillon modifié entre-temps et de document immuable restent
en place. Aucun changement des générateurs PDF, CSS, logos ou de `.env.local`.

## Résultats

- Réponse réelle fictive enregistrée : `tests/fixtures/openai-structured-response.json`.
  Elle ne contient ni identifiant personnel, ni clé, ni données clients réelles.
- Rejeu local : une ligne normalisée, 2 forfaits à 10 EUR HT, TVA 20 % ;
  valeurs absentes et prix non justifié toujours écartés et signalés.
- Chromium : consigne → réponse réelle rejouée via API simulée → deux lignes
  et dix champs détaillés dans la revue → aucune mutation avant confirmation →
  préremplissage après clic humain. Aucun brouillon serveur ni document fiscal créé.
- 22 tests éditeur/agent et 9 tests navigateur/PDF passent ; les trois contrôles
  TypeScript strict, le build Next.js isolé et les 21 empreintes historiques passent.
- Les 9 tests d’authentification et 35 tests financiers passent également,
  soit 75 tests exécutés et réussis pour cette correction.

L’unique nouvel appel a été effectué avant le diagnostic complet ; sa réponse
enregistrée a ensuite servi à toutes les vérifications après correction, sans
nouvelle dépense. La correction du transport réel vers l’éditeur est donc
vérifiée par rejeu de cette réponse, pas par un second appel après correction.
Le test navigateur isole les API et n’est pas une nouvelle validation de session
Clerk réelle. Les permissions serveur existantes n’ont pas été modifiées.

Le premier devis peut être préparé dans Logifa par « Demander une proposition IA »
puis « Confirmer ces modifications ». Fournir explicitement quantités, prix et TVA
ou compléter manuellement les éléments signalés. Préparation et émission restent
des opérations distinctes ; aucune émission ou action financière automatique.
