# LOGIFA — dernière recette et préparation à l'utilisation réelle

État historique d'interruption, désormais remplacé par [le rapport de finalisation autonome](finalisation-autonome-2026-10-13.md). La revue d'autorisation a repris ; les changements de cette première phase sont conservés dans `c38d35e`.

Travail sur `develop/logifa`, après `8a2ff4a`. Cette phase est **partiellement validée, non commitée** : l'exécution finale et le commit sont bloqués par l'épuisement du quota de revue automatique d'autorisation. Aucune infrastructure payante créée, aucune migration distante exécutée, aucun push, e-mail réel ou appel OpenAI.

## Contrôles réellement effectués

| Contrôle | Résultat et portée |
| --- | --- |
| Véritable compte Clerk non administrateur | Réussi : compte temporaire créé dans Clerk Logifa, session émise par l'API officielle de développement ; jeton signé vérifié, issuer, subject et rôle natif conformes. Transport Bearer, aucun JWT inventé ou injecté dans un cookie. |
| Refus par Next.js | Cinq API (`workspace`, diagnostic de session, documents, mail, agent) : HTTP 403. `/`, `/devis`, `/facture` : redirection vers `/access-denied`. |
| Refus par Supabase réel | Le véritable jeton non administrateur est reconnu : `issuer_profiles` répond HTTP 200 avec zéro ligne, RPC `logifa_context` refusé HTTP 403. Ce contrôle ne repose pas sur des claims PostgreSQL simulés. |
| Nettoyage Clerk | Sessions temporaires révoquées avant suppression des comptes appartenant exclusivement à la recette ; administrateur et sa session non modifiés. |
| Cycle financier et documentaire local | PostgreSQL **17.11**, cluster éphémère, schéma initial et trois migrations. Devis émis et accepté, facture classique, paiement partiel puis complet, avoir documenté et remboursement, facture d'acompte, finale, paiements partiels puis complets. |
| Services PDF et archives locales | Les vrais services applicatifs et générateurs sont exécutés : huit PDF archivés sur disque via un adaptateur local, originaux et variantes ACQUITTÉ distincts, SHA-256 et taille contrôlés après relecture. Refus du tampon après paiement partiel et détection d'un fichier altéré. |
| Immutabilité | Refus des modifications et suppressions des documents émis ; DML direct sur les numéros refusé. Modifier l'émetteur ou le client conserve les snapshots des factures et leurs originaux archivés. |
| Émetteurs et carnets locaux | Deux émetteurs et clients homonymes distincts ; logos PNG existants, couleurs, coordonnées et nom client modifiés en base locale et relus. L'autre carnet ne change pas. Aucun profil métier historique fusionné ou réécrit. |
| Comptes Resend locaux | Vrais services de configuration/chiffrement et RPC locaux avec clés exclusivement fictives : configuration de deux comptes distincts, ciphertext stocké sans plaintext, état sans secret, rotation uniquement du compte A, version B inchangée. Aucun appel fournisseur dans ce cycle. |
| Fournisseurs simulés | 15 tests éditeur réussis, incluant le nouveau test OpenAI et celui des erreurs Resend. Requêtes Responses strictes, `store=false`, double activation, erreurs et plafond de dix propositions testés sans réseau. Resend : 401/429/500, état incertain, absence de relance automatique et erreur sans secret. |
| Projet Supabase principal | Contrôle final en lecture seule : un profil, zéro devis, facture, paiement et fichier documentaire ; huit objets Storage historiques ; toutes les tables publiques avec RLS, bucket documentaire privé. Aucun document fiscal de recette créé dans cette base. |

Le test du ticket de connexion dans un navigateur non administrateur a rencontré un délai d'activation et **n'est pas validé**. Les comptes de ces essais ont été nettoyés. Le contrôle réussi utilise ensuite une session réelle du même fournisseur et un jeton officiellement signé en Bearer : il valide les autorisations HTTP et RLS, mais ne remplace pas une connexion interactive de ce deuxième compte. Le parcours administrateur navigateur validé dans le rapport précédent reste distinct.

## Limites de l'archivage

Le cycle local utilise les services applicatifs réels, des transactions PostgreSQL réelles et des PDF réels, mais un adaptateur de transport SDK/Storage pour les fichiers locaux. Les signatures Clerk ne sont pas validées dans **ce** cluster local ; ses claims sont simulés. Il ne constitue pas une recette du serveur Supabase Storage ou de PostgREST.

Le script préparé `scripts/check-logifa-storage-isolated.mjs` couvre : upload et registre d'une preuve PDF non fiscale, téléchargement administrateur et SHA-256, refus anonyme et URL publique sur un objet existant, refus d'un véritable autre compte Clerk, refus d'overwrite et conservation après tentative de suppression. **Il n'a pas été exécuté**, faute de cible isolée. Il refuse la référence du projet principal avant tout appel réseau et exige une clé publiable, jamais service_role.

Créer `secrets/logifa-recipe.env` (ignoré par Git) seulement après autorisation de la cible isolée :

```dotenv
LOGIFA_RECIPE_ISOLATED=true
LOGIFA_RECIPE_PROJECT_REF=
LOGIFA_RECIPE_SUPABASE_URL=
LOGIFA_RECIPE_SUPABASE_PUBLISHABLE_KEY=
```

Le fournisseur Clerk natif, les migrations, le profil fictif de recette et la liaison administrateur doivent être configurés sur **cette cible** avant ce script. Ne pas copier de données clients réelles. Ne jamais fusionner la branche de recette vers la production. Le script laisse ses preuves sur la seule cible isolée afin de préserver l'immutabilité ; sa suppression finale relève de la fermeture contrôlée de l'environnement.

Aucune branche Supabase existante pour Logifa. Docker absent sur cette machine ; le runtime Supabase natif documenté concerne Linux/macOS, pas cette installation Windows. Une base PostgreSQL native seule ne fournit pas le service Storage. Voir [runtimes locaux officiels](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes).

Pour une branche temporaire Micro, le tarif public indicatif commence à **0,01344 USD/heure**, soit environ **0,081 USD pour six heures**, hors taxes et éventuels autres usages/prérequis du plan. Le prix exact doit être vérifié par `get_cost` avec l'organisation indiquée par l'utilisateur, puis soumis à son accord avant toute création. [Tarification officielle des branches](https://supabase.com/docs/guides/platform/manage-your-usage/branching).

## Préparation des vraies entreprises et des comptes e-mail

1. Examiner les neuf profils locaux préparés par `npm run prepare:companies`. L'import doit être explicite, sans fusion des identifiants dupliqués ni attribution juridique déduite automatiquement.
2. Configurer chaque entité juridique : identité et SIRET, régime/exigibilité TVA, mentions, modalités de paiement et séries devis/factures. Les émetteurs d'une même entité partagent sa numérotation ; des entités distinctes gardent leurs propres séries. Un préfixe déjà utilisé ne se change pas librement. Faire valider la reprise des séries réelles avant toute première émission.
3. Configurer les profils émetteurs : rattachement juridique, logo PNG, couleur, coordonnées. Créer les clients dans leur carnet propre ; une homonymie entre carnets ne signifie pas un client partagé.
4. Préparer la clé maître serveur par `node scripts/prepare-logifa-email-key.mjs --write`. Elle est générée uniquement si absente, jamais affichée ni remplacée si existante ; `.env.local` reste ignoré. **Cette commande n'a pas été exécutée** : rejet de la revue automatique pour quota épuisé. La clé maître reste donc à configurer et sauvegarder de façon sécurisée.
5. Pour chaque émetteur, conserver son compte Resend et son domaine vérifié existants. Paramétrer sa clé API, adresse d'expédition, nom et reply-to depuis ses paramètres privés. La clé API est chiffrée côté serveur et aucune API de lecture ne la restitue. Vérifier le domaine sur le compte sélectionné ; un domaine d'un autre compte ne suffit pas.
6. Garder `LOGIFA_EMAIL_ENABLED=false`. Avant activation : recette Storage réussie, restauration des secrets prévue, contrôle des domaines réels, prévisualisation des PDF et première livraison uniquement après confirmation explicite. Aucun compte client Resend déplacé ou centralisé.
7. Rotation d'une clé API : remplacer sur le seul émetteur concerné puis revérifier son domaine. Rotation de la clé maître : garder temporairement l'ancienne clé, réenregistrer explicitement les secrets sous la nouvelle, vérifier chaque compte avant retrait de l'ancienne. Un champ API vide conserve le ciphertext existant.

L'état contrôlé de `.env.local` reste : persistance active, e-mail et OpenAI désactivés, clé de chiffrement e-mail absente, clé/modèle OpenAI absents. Aucune valeur secrète n'est incluse dans ce rapport.

## Agent OpenAI

Contrat Responses à sorties structurées, schéma strict et validation d'exécution, application proposée dans les champs de l'éditeur existant, contrôle des valeurs client et preuves de quantité/prix. Aucun pouvoir d'émission, paiement, acquittement ou envoi. Les deux drapeaux `LOGIFA_OPENAI_ENABLED` et `LOGIFA_OPENAI_COSTS_APPROVED`, la clé serveur et le modèle doivent être configurés avant usage. Ils restent désactivés/absents. [Documentation officielle OpenAI des sorties structurées](https://developers.openai.com/api/docs/guides/structured-outputs).

Le plafond courant est en mémoire par processus : un redémarrage ou plusieurs processus ne constituent pas un quota global durable. Avant activation payante, ajouter un contrôle de dépense côté fournisseur et décider si un quota serveur persistant est nécessaire. Aucun appel payant effectué pour valider ces contrats.

## Résultats, fichiers et reprise

Résultats réellement obtenus cette phase : recette non administrateur HTTP/Supabase réussie ; cycle documentaire PostgreSQL avec services réels réussi ; 15 tests éditeur réussis. Les **94 tests**, TypeScript, build et 21 empreintes du rapport précédent ne doivent pas être présentés comme rejoués intégralement dans cette phase. Le nouveau test de garde de cible n'a pas encore été exécuté. Après son ajout, la suite attendue comporte 98 tests, à confirmer par exécution.

Nouveaux fichiers : `scripts/check-logifa-nonadmin.mjs`, `scripts/check-logifa-storage-isolated.mjs`, `scripts/recipe-target.mjs`, `scripts/prepare-logifa-email-key.mjs`, `tests/postgres/document-services.test.mjs`, `tests/editor/agent-provider.test.mjs`, `tests/editor/recipe-target.test.mjs`. Modifications : `package.json` et `tests/editor/mail.test.mjs`. Aucun éditeur, moteur PDF, CSS, logo, prestation ou profil métier modifié.

Traces privées exclues de Git : `tmp/final-recipe/nonadmin.json`, `document-cycle.json`, `document-cycle-test.log`, `editor-test.log`, PDF sous les clusters locaux de `tmp/lot3a2`. Les scripts ne journalisent pas les clés, tokens, mots de passe ou cookies.

Après rétablissement de la revue d'autorisation :

1. Vérifier Git et préserver les fichiers non commités ci-dessus.
2. Formater seulement les nouveaux scripts/tests ; lancer les trois contrôles TypeScript, toutes les suites de tests, le build de recette isolé du serveur actif et `test:auth:http`, puis les 21 empreintes historiques.
3. Vérifier le rapport et créer le commit local de cette phase. Aucun commit nouveau actuellement ; dernier commit `8a2ff4a`.
4. Demander l'organisation Supabase pour chiffrer précisément une branche temporaire, obtenir l'accord sur coût et durée, puis seulement créer/configurer la cible isolée et exécuter la recette Storage et financière fournisseur. Ne pas utiliser la base principale pour combler cette limite.

La recette de production reste incomplète tant que Storage réel et contrôles finaux de cette phase ne sont pas conclusifs.
