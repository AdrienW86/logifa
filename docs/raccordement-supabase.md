# LOGIFA — préflight distant et mise en service, 13 octobre 2026

**Mise à jour :** les trois migrations et la liaison ont désormais été appliquées après validation du jeton natif. La persistance a été redésactivée après un HTTP 401 du test Next isolé. Ce document conserve le préflight antérieur ; consulter [le rapport d'application](application-supabase-20261013.md) pour l'état courant et les versions distantes réellement enregistrées.

État : **autorisation conditionnelle reçue, migrations distantes non appliquées**. L'utilisateur a autorisé les trois migrations et la liaison historique, à condition de corriger et revérifier l'intégration native Clerk–Supabase, l'accès réel administrateur et le refus des autres comptes. Cette condition n'est pas satisfaite. Le raccordement authentifié n'est pas encore opérationnel. Projet consulté exclusivement : `bniitcbsaowwzkjdrqwz` (Logifa), branche locale `develop/logifa`, départ `936375c`. Aucun accès à CODE-V OS, aucun push, aucune nouvelle branche payante, aucun document fiscal de test distant, aucun e-mail réel et aucun appel OpenAI.

## Preuves et état réel

Le projet est `ACTIVE_HEALTHY`, PostgreSQL 17.6. L'historique des migrations est vide, revérifié en fin de préflight. Les neuf tables historiques sont présentes avec RLS. Effectifs : un profil, zéro client, chantier, devis, ligne de devis, facture, ligne de facture, facture fournisseur et ligne fournisseur. Aucun schéma `logifa_private`, aucune fonction publique personnalisée et aucun trigger utilisateur. Le bucket public historique `logos` contient huit PNG.

Comparaison au catalogue du 12 octobre : tables, colonnes, types, contraintes, index, politiques, configuration des buckets et droits des rôles API identiques. La capture récente inclut aussi les 63 privilèges du propriétaire `postgres`, exclus intentionnellement de la précédente requête ; cette différence de périmètre a été explicitement normalisée, pas ignorée. Les advisors signalent cinq tables historiques avec RLS sans politique : `clients`, `profiles`, `quote_items`, `invoice_items`, `supplier_invoice_items`. Elles sont fermées pour les utilisateurs ordinaires ; la migration 3 prépare leurs politiques administrateur. [Preuves sans secrets](../supabase/audit/preflight-2026-10-13.json).

Les migrations restent inchangées et leurs SHA-256 sont relevés dans cette preuve. Ordre soumis à validation :

1. `supabase/migrations/20261012150837_logifa_lot3a_model.sql`
2. `supabase/migrations/20261012150838_logifa_lot3a_operations.sql`
3. `supabase/migrations/20261012150839_logifa_lot3a_security.sql`

## Sauvegarde récupérable du périmètre métier

Répertoire privé ignoré par Git : `secrets/backups/logifa-preflight-20261013/`.

- `business-snapshot.dpapi` : catalogue, neuf tables et profil historique, métadonnées des buckets/objets.
- `business-with-storage.dpapi` : même capture complétée par les octets des huit PNG distants et leurs empreintes SHA-256.
- `manifest.json`, `manifest-business-with-storage.json` : empreintes et périmètre.
- `admin-binding-proposed.sql` : liaison préparée, **non exécutée**, avec l'ancien profil et le nouvel administrateur distincts. Aucun remplacement du profil.

Protection Windows DPAPI `CurrentUser`, sans clé de sauvegarde en clair ni dans Git. Le fichier chiffré et son déchiffrement ont été vérifiés. Restauration des neuf tables dans un PostgreSQL 17.11 neuf local : comparaison JSONB de chaque table, toutes les lignes identiques et profil conservé. Les huit PNG ont été récupérés sous chiffrement et tous leurs SHA-256 vérifiés après déchiffrement. Aucun fichier distant ou logo local remplacé. Les exports transitoires en clair ont été retirés après chiffrement.

Cette sauvegarde est **celle du périmètre modifié**, pas un `pg_dump` complet des schémas système Auth/Vault/extensions ni une sauvegarde gérée du service Supabase. DPAPI requiert le compte Windows et ses clés de protection pour récupérer les fichiers : copier le seul `.dpapi` vers une autre machine ne suffit pas. Les comptes/clés API Clerk ou Resend et `.env.local` n'y figurent pas. Conserver le compte Windows et organiser une copie sécurisée récupérable ; aucun changement de plan/PITR ou export de mot de passe PostgreSQL n'a été effectué.

Scripts reproductibles : `verify-logifa-backup.mjs` vérifie la capture existante et restaure uniquement dans une base locale neuve ; `backup-logifa-storage.mjs` télécharge exclusivement les PNG publics Logifa et refuse d'écraser une sauvegarde existante. Ne pas lancer directement `protect-logifa-backup.ps1 -Action read` dans un terminal : son flux déchiffré est réservé aux helpers de récupération qui le capturent en mémoire. Aucune donnée réelle de sauvegarde n'est utilisée comme fixture de test financier ou écrite dans `tests/`.

## Blocage réel Clerk/Supabase

Les clés publiable et secrète présentes correspondent cryptographiquement à la même instance Clerk de **développement**. L'administrateur configuré existe, n'est ni banni ni verrouillé et dispose d'une session active. Le vrai jeton de cette session a été obtenu pour le contrôle en mémoire seulement ; aucune session créée, aucun jeton sauvegardé ou affiché.

Issuer vérifié : `https://dear-buck-9396.clerk.accounts.dev`.

Résultats REST réels avant migration :

| Cas | Résultat | Interprétation |
| --- | --- | --- |
| Vrai jeton administrateur | HTTP 401 ; `role: authenticated` absent | Intégration non opérationnelle. Ne prouve pas un succès RLS administrateur. |
| Jeton invalide | HTTP 401 | Refus réel. |
| Clé publiable seule, sans session | HTTP 200, zéro ligne de profil | RLS ferme la lecture du profil historique. Ce contrôle porte sur `profiles`, pas sur toutes les futures RPC. |

L'issuer et le sujet du jeton concordent avec la configuration locale. Les outils connectés ne permettent pas de modifier la configuration Third-Party Auth ni les claims de session ; aucune manipulation SQL des catalogues Auth n'a été tentée pour contourner le dashboard.

**Revérification après autorisation, 13 octobre à 07:30:59 UTC :** le vrai jeton est signé RSA-SHA256 par une clé JWKS officielle de l'instance Clerk et n'est pas expiré. Issuer et subject concordent avec les valeurs attendues ; aucun jeton ou subject n'a été affiché. `role: authenticated` reste absent. Supabase renvoie **HTTP 401, `PGRST301`, clé de signature JWT non reconnue**. L'historique des migrations est toujours vide. Le rôle manquant et la non-reconnaissance de la clé sont deux observations distinctes ; ce diagnostic ne prétend pas avoir lu les paramètres internes Third-Party Auth de Supabase.

L'API officielle de gestion Supabase permet de créer une intégration Third-Party Auth, mais cette opération n'est pas exposée par le connecteur disponible. Aucun `SUPABASE_ACCESS_TOKEN` n'est disponible dans l'environnement ou `.env.local`. Le Backend SDK Clerk installé ne propose pas de méthode d'activation de l'intégration native Supabase. Aucun outil de navigation authentifiée aux dashboards n'est disponible. Il s'agit d'un manque d'accès technique, pas d'un refus d'autorisation de l'utilisateur. Ne pas utiliser la clé publiable comme clé de gestion, modifier artificiellement le JWT, remplacer les politiques ou recourir à une clé service_role pour contourner ce blocage.

Le contrôle du compte tiers réel reste non effectué ; aucun compte de recette non autorisé n'est disponible. Les tests locaux précédents ne le remplacent pas. Les migrations, la liaison et les tests réels des nouvelles RPC/du bucket privé sont donc suspendus. Aucun développement de formulaire/PDF/CSS ou données historiques modifié pendant cette revérification.

Action indispensable dans les dashboards :

1. Dans **l'instance Clerk Logifa**, activer *Connect with Supabase* ; s'assurer que les nouveaux jetons de session portent `"role": "authenticated"`. Conserver toute autre personnalisation de claims existante.
2. Dans [Supabase Logifa → Auth → Third-Party](https://supabase.com/dashboard/project/bniitcbsaowwzkjdrqwz/auth/third-party), ajouter/activer Clerk avec le domaine exact ci-dessus, sans toucher un autre projet.
3. Confirmer la désactivation de l'inscription publique dans Clerk et renouveler la session de l'administrateur. Ce paramètre n'a pas pu être confirmé par l'API disponible ; la garde applicative refuse néanmoins tout autre identifiant.

Référence officielle : [intégration native Clerk](https://supabase.com/docs/guides/auth/third-party/clerk). Ne pas utiliser l'ancien template JWT Supabase ni partager un secret JWT de projet.

## Configuration locale préparée

`.env.local` conserve les valeurs Clerk ; seules les variables absentes ont été ajoutées : URL exacte Logifa, référence du projet, clé **publiable** lue depuis ce projet et drapeaux `LOGIFA_PERSISTENCE_ENABLED=false`, `LOGIFA_OPENAI_ENABLED=false`, `LOGIFA_OPENAI_COSTS_APPROVED=false`, `LOGIFA_EMAIL_ENABLED=false`. Aucune clé `service_role`, aucune valeur secrète affichée, fichier toujours ignoré par Git.

Restent à renseigner, sans les transmettre dans le chat :

- `LOGIFA_EMAIL_ENCRYPTION_KEY` : secret serveur 32 octets aléatoires/base64, sauvegardé séparément de la base ; aucune clé n'a été inventée ou remplacée.
- Paramètres **de chaque compte Resend existant**, depuis l'émetteur : clé API propre, expéditeur, reply-to, domaine vérifié, signature/templates. Ils ne sont pas centralisés. Aucun envoi réel tant que l'activation et la confirmation ne sont pas autorisées.
- `OPENAI_API_KEY`, `OPENAI_MODEL`, puis double activation après accord sur données/coûts. En attendant, l'agent est désactivé ; les contrats et la revue des propositions restent prêts.

`LOGIFA_EMAIL_PREVIOUS_ENCRYPTION_KEY` est facultative, réservée à une rotation contrôlée. Les variables exactes et les parcours se trouvent aussi dans [le guide de configuration](deploiement-controle.md).

## Contrôles locaux rejoués

Succès : les trois contrôles TypeScript strict et build Next.js ; 34 tests financiers, 24 tests PostgreSQL natif, 9 tests Clerk locaux, 1 test de routes, 13 tests de contrats/PDF/IA/mail, 8 tests navigateur éditeurs, 3 tests navigateur gestion et 1 test HTTP fail-closed : **93 tests**. Les 21 empreintes historiques restent conservées, dont neuf logos et six scénarios PDF. Références PDF classiques et nouvelles variantes disponibles dans `tmp/editor-ui/references/` et `tmp/managed-pdf/`.

La recette entreprises/clients, numérotation, acomptes, finales, paiements partiels/complets, avoirs, remboursements, concurrence, acquittement et suppression des brouillons est locale PostgreSQL et/ou navigateur avec API fictive, **pas une recette Supabase distante réussie**. Aucun Docker disponible détecté ; aucun environnement Supabase isolé créé. La véritable recette financière distante demande un environnement isolé autorisé, jamais des factures de test dans le carnet réel. Les jetons Clerk tiers/expirés/issuer incorrect, les RPC après migration et le Storage privé HTTP restent à tester dans cet environnement. Un HTTP 401 sur un jeton déjà non reconnu ne prouve pas spécifiquement la vérification de son expiration.

## Autorisation conditionnelle enregistrée

Le préflight du schéma et la restauration du périmètre sauvegardé sont conformes. L'accord a désormais été donné pour **les trois fichiers identiques aux empreintes relevées, dans l'ordre, puis la liaison préparée au profil historique conservé**, sous condition de résolution/revérification de l'intégration native et des accès. Aucun nouvel accord identique ne sera demandé une fois cette condition satisfaite. Aucun import d'entreprise, aucune modification des données historiques, aucun test fiscal, aucun envoi et aucun appel payant n'est inclus dans ce point.

Avant exécution, revérifier l'absence de dérive et de migration ajoutée depuis la capture ; si les données ont changé, préparer une nouvelle sauvegarde et arrêter en cas de divergence. Après chaque migration, vérifier catalogues, contraintes, privilèges `anon/authenticated/PUBLIC`, RLS et EXECUTE. Après la troisième, vérifier bucket privé et wrappers ; ne pas poursuivre après une erreur. La liaison doit référencer exactement l'ancien profil, sans mettre à jour sa clé primaire. Si déjà activée autrement, le SQL proposé refuse d'écraser la configuration.

La persistance reste désactivée jusqu'à validation d'un vrai jeton accepté, de la garde administrateur/RLS/RPC et des accès Storage. Même après autorisation SQL, la mise en service ne sera pas annoncée tant que ces preuves manquent. La configuration dashboard bloquante ci-dessus reste nécessaire ; aucun contournement.

## Démarrage simple

Depuis ce dossier : `npm run dev`, ouvrir l'adresse locale indiquée et se connecter à Clerk Logifa. L'édition manuelle et les PDF classiques fonctionnent localement ; la gestion serveur reste fermée tant que les migrations et l'intégration ne sont pas validées. Après mise en service vérifiée : activer explicitement la persistance, redémarrer Next, qualifier/importer les émetteurs sans fusion et configurer les entités fiscales avant toute émission réelle. Resend et OpenAI restent désactivés jusqu'à leur configuration et autorisation propres.
