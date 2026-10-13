# LOGIFA — authentification et persistance, 13 octobre 2026

Branche locale `develop/logifa`, projet exclusivement `bniitcbsaowwzkjdrqwz`.

La persistance est activée dans `.env.local` (`LOGIFA_PERSISTENCE_ENABLED=true`). La connexion administrateur fonctionne dans Edge avec une session établie par le formulaire officiel Clerk, après vérification d'appareil. Aucun secret de navigateur n'a été lu, copié ou exporté. Le profil de recette sous `tmp/browser-recipe/profile` est privé et exclu de Git ; il contient les données normales du navigateur et doit être protégé comme tel.

## Cause du premier HTTP 401

Le précédent test injectait seulement un JWT dans `__session` sur un serveur distinct : il ne reproduisait pas la session navigateur Clerk. Dans le SDK installé, l'authentification par cookies en instance de développement nécessite aussi le contexte de navigateur de développement et le client UAT, avec sélection des cookies d'instance. Leur absence déclenche le handshake avant la validation habituelle du JWT. Le jeton était accepté par Supabase, mais cela ne prouvait pas une session Next.js. Aucun contrôle de sécurité n'a été désactivé.

`scripts/check-logifa-http.mjs` utilise désormais le navigateur connecté, sans création de jeton ni injection de cookie. Le proxy Next.js 16 et `requireAdmin` restent actifs. La nouvelle API privée `/api/session-health` confirme `auth()`, `currentUser()`, le rôle natif et le drapeau de persistance, sans restituer d'identité ni de secret.

Lors du passage développement → production, le serveur lancé sur `127.0.0.1` avec un navigateur sur `localhost` a provoqué une réécriture vers le serveur lui-même. Le serveur de production a été relancé avec `--hostname localhost`, identique à l'origine du navigateur : le problème a disparu. Le lanceur de recette utilise cette même origine. Les builds de vérification peuvent utiliser `LOGIFA_LOCAL_RECIPE_BUILD=true` pour écrire dans `tmp/next-recipe-build`, sans remplacer `.next` pendant une session de développement.

## Vérifications réelles

Sur serveur de développement puis sur le build de production local :

- `/`, `/devis`, `/facture`, `/gestion/clients`, `/gestion/entreprises` : HTTP 200 pour l'administrateur.
- `/api/workspace` : HTTP 200, `available=true`, services serveur connectés à Supabase.
- `/api/session-health` : HTTP 200 ; utilisateur serveur vérifié, rôle natif `authenticated`, persistance active.
- Rechargement : session conservée et API toujours accessibles.
- Contexte navigateur anonyme indépendant : page privée redirigée vers connexion ; workspace, agent, diagnostic, mail et documents refusés HTTP 401.
- Agent désactivé ; aucune requête OpenAI ni livraison Resend.

La recette métier a créé deux carnets distincts avec clients homonymes et deux brouillons non fiscaux : création et lecture des entreprises/clients, sauvegarde, modification manuelle, réouverture dans l'éditeur, recherche client. Un client ou document de l'autre émetteur est refusé HTTP 422. Le PDF de brouillon est téléchargé via le service serveur et son en-tête PDF contrôlé ; référence locale `tmp/browser-recipe/draft-preview.pdf`, SHA-256 `47c6e093e26a6b3519604b637d6d594f2d2fe82a5f57db6d0cae84854637897d`.

Une première exécution de recette avait échoué ; le jeu de données ne configurait notamment pas les mentions requises pour un PDF géré. Les fixtures ont été complétées et l'exécution suivante a réussi. Les nettoyages des deux exécutions ont réussi : quatre clients de recette archivés, quatre émetteurs désactivés, quatre entités juridiques de recette conservées pour la traçabilité. Les quatre brouillons ont été supprimés par le RPC prévu. Aucune facture définitive, aucun encaissement et aucun numéro fiscal n'ont été créés.

L'archivage d'un brouillon est désormais refusé **avant** tout upload Storage (`ARCHIVE_EMITTED_DOCUMENT_REQUIRED`), au lieu de laisser le RPC refuser après un upload susceptible de devenir orphelin. Test unitaire dédié et refus réel HTTP 422. Aucun moteur PDF, éditeur, CSS ou logo modifié.

## Base et Storage

Les trois migrations étaient déjà appliquées ; aucune migration rejouée :

| Fichier local | Version distante |
| --- | --- |
| `20261012150837_logifa_lot3a_model.sql` | `20261013074607` |
| `20261012150838_logifa_lot3a_operations.sql` | `20261013074811` |
| `20261012150839_logifa_lot3a_security.sql` | `20261013074900` |

La liaison historique reste en place. Contrôle final : un profil, zéro devis, facture, paiement ou fichier documentaire ; huit objets Storage historiques inchangés en nombre ; aucun client ni émetteur de recette actif. Toutes les tables publiques ont RLS activé ; 23 politiques publiques. Bucket `logifa-documents` privé, PDF uniquement, 25 MiB. La politique restrictive administrateur s'applique aux objets ; les politiques historiques publiques sont limitées au bucket `logos`. L'expression **réellement enregistrée** accepte le chemin PDF normal : un premier essai reproduisait incorrectement son échappement, sans anomalie du SQL réel.

Les précédents contrôles de catalogue et privilèges figurent dans `supabase/audit/rollout-2026-10-13.json`. Les listes Storage administrateur et anonyme étaient vides sous RLS ; une liste vide n'est pas un test d'upload/download d'un document émis.

## Contrôles automatisés

Tous réussis : trois contrôles TypeScript strict, build Next.js, 21 empreintes historiques, 9 tests auth, 35 tests billing, 24 tests PostgreSQL 17 isolé, 13 tests modèle éditeur, 8 tests navigateur éditeur, 1 test sécurité workspace, 3 tests navigateur workspace, 1 test HTTP réel fail-closed sans configuration : **94 tests**, aucun échec. Les tests PostgreSQL incluent deux connexions indépendantes, concurrence et intégrité financière ; leurs identités PostgreSQL simulées ne remplacent pas de vrais comptes Clerk.

Résultats locaux exclus de Git : `tmp/check-*.log`, `tmp/raccordement/live-next.json`, `tmp/browser-recipe/*-result.json`, `draft-cleanup.json`. Les résultats ne contiennent ni jeton ni clé.

## Conditions restantes

- Aucun compte Clerk non administrateur réel n'était disponible. Les refus sont testés par politique, services et PostgreSQL simulé, mais le parcours réel avec ce deuxième compte reste à effectuer. Idem jetons invalides/expirés et mauvais issuer de bout en bout : ne pas assimiler les tests simulés à une validation fournisseur complète.
- Aucun document émis n'existe actuellement en base. Upload immuable, empreinte après téléchargement de l'original, variante acquittée et refus d'accès sur un objet existant doivent encore être testés sur un environnement isolé. Ne pas émettre de fausse facture dans ce projet pour combler cette limite.
- Configurer/importer explicitement les véritables émetteurs, leurs mentions fiscales et leurs carnets avant utilisation métier. Les émetteurs locaux existants ne sont pas automatiquement importés ou fusionnés.
- Resend et OpenAI restent désactivés ; aucune configuration payante ou livraison effectuée.
- L'instance Clerk est une instance de développement : une publication externe demandera une configuration de production et une recette distincte.

La connexion et la persistance des référentiels/brouillons sont réellement validées localement. La recette financière et documentaire de production n'est pas déclarée complète.

## Reproduire la recette navigateur

1. Lancer `node scripts/logifa-browser-recipe.mjs` ; connexion humaine dans la fenêtre Edge dédiée, sans transmettre de secrets.
2. Lancer `node scripts/check-logifa-http.mjs` pour les contrôles non destructifs administrateur/anonyme.
3. Le contrôleur local dispose d'une recette `/drafts`, exclusivement en POST : elle écrit des fixtures non fiscales et nettoie les brouillons, archive les clients et désactive les émetteurs. Ne la relancer que pour une recette explicitement autorisée ; les traces ne sont pas effacées.
4. Pour tester le build local : `LOGIFA_LOCAL_RECIPE_BUILD=true npm run build`, puis le même drapeau avec `npm run start -- --hostname localhost --port 3000` (syntaxe de variable adaptée à PowerShell). Ne pas lancer deux serveurs sur ce port.

Ne pas utiliser `supabase db push` pour rejouer les trois fichiers : les versions distantes diffèrent des horodatages locaux. Aucun push GitHub effectué.
