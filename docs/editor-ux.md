# LOGIFA — refonte des éditeurs et préparation de l’agent

12 octobre 2026. Branche `develop/logifa`, base `38f3ea1`.
Audit préalable : [editor-audit.md](editor-audit.md).

## Disponible dans l’application

Les pages `/devis` et `/facture` utilisent un même éditeur typé avec leurs options
propres. Le mode manuel reste complet. Les anciens états sont cartographiés dans
l’audit ; leur contrat PDF est maintenu par `lib/editor/model.ts`.

- Sept sections accessibles directement, sans étapes obligatoires : émetteur,
  client/chantier, document, prestations, montants/règlements, conditions/notes,
  aperçu/PDF. Navigation latérale et résumé persistant sur desktop ; progression
  verticale et commandes accessibles sur mobile.
- Palette claire végétale, typographie du projet, focus visible, libellés explicites,
  contrastes de saisie confortables, fenêtres clavier confinées, Échap et retour
  du focus. La réduction des animations est respectée par les styles.
- Recherche dans les neuf profils avec logos et contexte. Identité locale par
  position, jamais par `id` dupliqué, jamais par fusion de SIRET. Changer l’émetteur
  conserve client et lignes et demande confirmation si le document est chiffré.
- Saisie de tous les champs client existants. Reprise, sur confirmation, du client
  du dernier brouillon local du même utilisateur/document. Aucune recherche serveur
  simulée ; la saisie manuelle reste disponible.
- Lignes et titres éditables directement, descriptions multilignes, unités, prix,
  quantités et TVA ; déplacement, duplication, suppression et annulation de la
  dernière suppression. Sous-totaux de section et récapitulatif immédiats.
  Les lignes ont des clés stables et sont mémorisées : l’édition d’un poste ne
  reconstruit pas les autres. Le scénario navigateur couvre 300 postes.
- Catalogue réel `app/prestations.js`, recherche et catégories. Les prix sont
  repris du catalogue sans invention ; la quantité est obligatoire à l’insertion,
  jamais supposée. Tout reste modifiable ensuite. Une ligne libre reprend le
  défaut manuel existant de quantité 1, prix vide et TVA 0.
- Ctrl/⌘ + Entrée ajoute une prestation ; Ctrl/⌘ + S sauvegarde localement.
  Ces raccourcis de formulaire sont suspendus dans les fenêtres de revue/catalogue.
- Export et aperçu du **véritable PDF**, plutôt qu’un aperçu HTML aux règles
  différentes. Relecture dans le navigateur et ouverture du PDF dans un onglet.
  Un aperçu devient explicitement obsolète quand la saisie change.
- Sauvegarde manuelle locale, restauration volontaire, import/export JSON de
  brouillon, effacement volontaire de la seule copie locale. Erreurs de quota ou
  d’import signalées sans remplacer les données présentes.
- Avertissement avant fermeture et avant clic sur un lien quittant l’éditeur.
  Cache en mémoire de l’onglet pour proposer une récupération après navigation
  douce. Il n’écrit rien sur disque automatiquement.

Les références ne constituent pas une émission serveur. La facture démarre avec
`BROUILLON` ; le devis utilise une référence locale stabilisée à la création du
brouillon. Aucune nouvelle numérotation définitive n’est produite depuis le front.
Le numéro final restera soumis à l’émission transactionnelle du service existant.

## Règlements : déclaratif et préparation uniquement

La facture conserve les champs d’acompte et le calcul théorique TTC-acompte ; le
plantage de l’ancien aperçu avec `resteAPayer` absent n’existe plus. Des notes
locales d’acompte reçu peuvent être saisies avant toute facture (montant, date,
moyen). Les informations historiques de paiement et références initiales restent
éditables, mais ne prouvent aucun encaissement.

Il n’y a aucune écriture Supabase, aucun faux historique, aucun faux statut payé.
Le résumé indique que les règlements ne sont pas vérifiés. La génération d’une
version acquittée est **bloquée en mode local**, même si l’option historique est
cochée. Elle ne sera raccordée qu’après la recette Supabase/Clerk, une émission
réelle, et `is_acquittable` fourni par les services serveur et la chaîne financière.
Les services 3A, leurs règles, leurs gardes et leurs migrations n’ont pas changé.

## Agent : interface préparée, aucun appel IA

`PromptComposer` est partagé entre devis et factures. Consigne libre, exemples,
état « En préparation », indication qu’aucune donnée n’est envoyée. Le bouton
prépare une consigne locale ; il ne prétend pas avoir généré un document.

`AgentProposal` et `prepareProposal` définissent la future intégration :

```json
{
  "version": 1,
  "kind": "devis",
  "client": { "name": "Client fictif" },
  "lines": [
    { "type": "normal", "name": "Travaux fictifs", "quantity": "2", "unit": "m²", "price": "20", "tva": "0" }
  ],
  "lineMode": "append"
}
```

Seuls des champs connus et validés sont acceptés. Aucun prix/quantité manquant
n’est inventé ; mauvaise date, type, unité ou entreprise sont refusés. L’append
est le défaut, le remplacement de lignes doit être explicitement proposé et
confirmé. Les autres champs manuels sont conservés. La revue montre avant/après
avec des libellés compréhensibles et oblige à confirmer avant application. Une
proposition préparée sur une ancienne saisie est refusée si celle-ci a changé.

Sur une facture, `acompte` (chaîne décimale) et `showAcompte` (booléen) peuvent
être proposés **comme déclaration locale non vérifiée**, jamais comme paiement.
`isPaid`, les mouvements bancaires et les pouvoirs serveur ne sont pas acceptés.
Le panneau avancé accepte un JSON structuré pour examiner ce contrat ; aucun
endpoint, réponse simulée permanente, SDK OpenAI ou second éditeur n’est ajouté.

## PDF strictement conservé

`utils/generatePdf.js`, `utils/generateFacture.js`, les logos, les données
d’entreprises/catalogue, les anciens CSS et les migrations sont intacts.
L’aperçu intercepte temporairement `pdf.save`, récupère le blob de la même instance,
puis restaure immédiatement l’API. Aucun autre paramètre de dessin n’est modifié.
Le téléchargement utilise le même moteur. Les images sont préchargées avant génération.

Les calculs sont les mêmes sommes flottantes que dans les anciens formulaires,
pas ceux du ledger serveur : aucune modification d’arrondi par ligne. L’affichage
monétaire applique le même `toFixed(2)` avant mise en forme française. Titres,
ordre et noms de propriétés du payload restent identiques.

Les six fixtures historiques produisent **les mêmes instructions PDF** avec le
payload adapté et l’ancien payload. Le test utilise jsPDF/AutoTable réels dans
Edge ; seules date de création et ID PDF variables sont stabilisés/normalisés.
Le cas acquitté historique vérifie le moteur sans autoriser ce pouvoir dans l’UI.
Ce n’est pas une comparaison binaire des métadonnées temporelles de tous les
exports possibles, ni une correction des anomalies de mise en page anciennes.

Anomalies du moteur conservées et signalées : facture TVA toujours 0 et TTC=HT,
acomptes non imprimés, conditions fixes, références initiales/date personnalisée
non utilisées dans l’en-tête, dirigeant/assurance codés en dur, placements de
mentions/signatures potentiellement hors page et en-tête multipage non répété.
Les notes internes sont explicitement non imprimées. Aucun nouveau tampon ajouté.

### Empreintes

Le manifeste original des **21 empreintes n’a pas été réécrit**. Une refonte de
pages ne peut pas conserver leurs empreintes en place : 19 fichiers restent
identiques, les deux pages originales sont conservées exactement sous
`tests/fixtures/legacy-editors/`. Le contrôle baseline vérifie cette distinction,
sans prétendre que les nouveaux éditeurs ont les anciennes empreintes.
Les huit enregistrements de dépendances PDF/React du lockfile ont été comparés
à `38f3ea1` et sont identiques. Les nouvelles dépendances sont exclusivement de
développement (Playwright, esbuild, types React, Prettier).

## Vérifications

| Contrôle | Résultat |
| --- | --- |
| `test:editor` | 5 tests : contrats, mapping IA, acompte déclaratif, restauration, validation |
| `test:editor:browser` | 7 tests : devis/factures 1440 et 390 px, PDF six fixtures, 300 postes/récupération |
| `test:billing` | 34 tests réussis |
| `test:postgres` | 17 tests natifs PostgreSQL 17 réussis, 15 chevauchements transactionnels prouvés |
| `test:auth` / `test:auth:http` | 9 tests de gardes + 1 test HTTP de fermeture sécurisée réussis |
| `typecheck:billing` / `typecheck:editor` | Réussis |
| `build` | Next.js 16.4.0 réussi |
| `test:baseline` | 21 références conservées, dont 19 fichiers protégés en place |

La recette UI lance un **serveur de composant isolé sur localhost**, avec Edge
headless installé sur ce poste, jamais une route de bypass d’authentification.
La production conserve les layouts/guards Clerk. Ce test ne remplace pas une
session Clerk réelle ni la recette Supabase Storage/JWT encore à faire.
Les captures montrent le composant réel et des clients entièrement fictifs ;
le bandeau serveur Clerk n’est pas monté dans ce harnais.

Captures dans `docs/screenshots/editors/` : vues desktop/mobile de chaque éditeur,
avec pages complètes pour le devis desktop et la facture mobile.
Les PDF de test, bundles, logs et autres artefacts temporaires restent dans `tmp/`.

## Confidentialité et limites

Une sauvegarde locale est manuelle et séparée par identifiant Clerk et type de
document. Elle demeure non chiffrée, conservée après déconnexion et accessible
aux personnes utilisant ce profil navigateur. Aucun TTL ni backup serveur n’est
promis. Les notes et la consigne IA font partie du brouillon si vous le sauvegardez.
Effacer la copie locale conserve la saisie React actuelle. Le fichier exporté
contient les informations client ; protégez-le comme tout document de travail.

Une saisie jamais sauvegardée ne résiste pas à un crash du navigateur/ordinateur.
La récupération en mémoire couvre les remontages dans le même onglet, pas un
rechargement complet. L’import limite la taille de fichier à 2 Mo ; une sauvegarde
locale peut échouer selon les quotas et réglages du navigateur. Les erreurs restent
visibles et ne provoquent pas d’écrasement silencieux.

Les vulnérabilités npm antérieures du moteur PDF restent hors périmètre. Aucun
audit fix, changement de moteur, prestataire de signature, migration distante,
connexion Supabase factice ou push GitHub. `.env.example` reste supprimé hors commit.
