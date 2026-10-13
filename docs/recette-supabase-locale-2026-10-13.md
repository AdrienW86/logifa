# LOGIFA — recette Supabase locale sans branche payante

## État de livraison

La cible de recette est désormais **locale**, sous `tmp/supabase-local`, avec identifiant Docker `logifa-local-recipe`, API `http://127.0.0.1:55321`, PostgreSQL 17 sur 55322 et serveur SMTP de capture sur 55324. Aucun passage Pro ni branche distante n'est nécessaire. La [CLI officielle](https://supabase.com/docs/guides/local-development/cli/getting-started) utilise un moteur de conteneurs pour fournir les vrais services.

CLI 2.120.0 déjà installée dans les dépendances du projet. Docker absent du PATH, de `C:/Program Files/Docker/Docker` et des emplacements Docker Desktop utilisateur examinés. `supabase status` lit la configuration mais échoue avec `docker: command not found (podman also not found)`. Le script de démarrage s'arrête avec `DOCKER_REQUIRED`, avant tout lancement de conteneur. **Aucun test sur les véritables services Supabase locaux n'est encore réussi ni déclaré exécuté.**

Intervention requise : installer puis démarrer Docker Desktop en moteur Linux selon [le guide Windows officiel](https://docs.docker.com/desktop/setup/install/windows-install/). Vérifier les prérequis WSL2/virtualisation ; une activation Windows ou un redémarrage peut être nécessaire. Aucun installateur système, changement WSL, téléchargement d'installateur ou modification système n'est lancé par l'agent. Supabase CLI n'a pas besoin d'être réinstallé.

## Reconstruction isolée

`scripts/prepare-supabase-local.mjs` génère une configuration dédiée, sans liaison distante, puis une baseline synthétique à partir du catalogue audité `supabase/audit/schema-2026-10-12.json`, via le même constructeur que les tests financiers. Elle reproduit les neuf tables, colonnes, contraintes, index, privilèges et politiques historiques ; seul un profil `user_legacy_fixture` est inséré. Elle exclut les substituts `auth` et `storage` des tests natifs : les conteneurs fourniront ces schémas et fonctions réels.

Le fichier `20000101000000_local_baseline.sql` est une fixture générée uniquement sous `tmp`, jamais une nouvelle migration de production. Après cette baseline, les cinq migrations existantes sont copiées **octet pour octet**, dans leur ordre :

1. `supabase/migrations/20261012150837_logifa_lot3a_model.sql`
2. `supabase/migrations/20261012150838_logifa_lot3a_operations.sql`
3. `supabase/migrations/20261012150839_logifa_lot3a_security.sql`
4. `supabase/migrations/20261013113847_logifa_client_lifecycle.sql`
5. `supabase/migrations/20261013115344_logifa_archive_intents.sql`

Le manifeste local conserve leurs SHA-256. Les deux dernières restent locales : ce travail n'autorise ni ne réalise leur application sur le projet hébergé.

La préparation refuse `.temp/project-ref`, retire les variables Supabase/Clerk/OpenAI/LOGIFA/S3 héritées des appels CLI et ne lit pas `.env.local`. Les clés de développement renvoyées par `status` restent en mémoire, sans impression ni commit. Pas de `link`, `push`, `--linked`, URL distante, service_role pour le SDK ni copie de données réelles. La configuration initiale autorise les inscriptions GoTrue fictives uniquement sur cette cible de recette ; elle n'est pas la configuration d'authentification de LOGIFA en production.

## Exécution une fois Docker prêt

Depuis le dossier LOGIFA :

```powershell
npm.cmd run recipe:supabase:prepare
npm.cmd run recipe:supabase:start
npm.cmd run recipe:supabase:test
```

Le premier démarrage initialise la base locale avec la baseline et les migrations copiées. Les images Docker nécessitent un téléchargement initial et du disque local. Les données fictives restent dans la cible dédiée pour diagnostic. Ne pas réutiliser un état déjà testé comme une nouvelle preuve de reconstruction : inspecter les versions appliquées et préparer un reset **local uniquement** avant une reprise complète. Aucun reset automatique n'est lancé par les scripts.

Pour arrêter uniquement cette pile, après la recette :

```powershell
node_modules/.bin/supabase.cmd stop --workdir tmp/supabase-local
```

Ne pas ajouter `--no-backup` : conserver la recette et ses volumes pour investigation. Les ports sont distincts des ports Supabase habituels ; protéger les services de développement avec le pare-feu local et ne pas exposer cette pile sur Internet.

## Parcours préparés, pas encore exécutés sur Supabase

`scripts/check-logifa-supabase-local.mjs` utilise le vrai SDK, REST/RPC et Storage locaux. Il crée deux identités fictives dans **GoTrue local**, contrôle leurs sessions via `getUser`, puis lie explicitement l'identité autorisée au profil fictif. Ce ne sont pas des jetons Clerk : ils ne valident pas l'intégration hébergée Clerk. Aucun JWT inventé n'est présenté comme une vraie session.

Le script prépare les contrôles suivants : refus anonyme et utilisateur tiers, RLS de lecture, isolation des clients par émetteur, devis émis/accepté, facture classique, paiements partiels/complets, facture d'acompte, déduction sur finale, avoir documenté sur finale, remboursement, refus d'avoir automatique sur l'acompte déduit, refus de seconde finale. Les services applicatifs réels produisent et archivent les PDF, originaux et variantes acquittées ; seul leur point d'entrée Next/Clerk est adapté au SDK de recette. Les guards de l'application sont inchangés.

Storage doit vérifier upload privé, enregistrement, téléchargement et SHA-256/taille, refus public/anonyme/tiers, refus d'upsert et suppression de l'original, refus d'un contenu dont l'empreinte enregistrée est incorrecte. Les factures émises doivent refuser édition, suppression et altération du numéro. Le rapport `tmp/supabase-local/result.json` distingue les contrôles terminés d'une exécution interrompue. Ce script reste à qualifier après démarrage Docker ; sa préparation n'est pas une preuve de passage.

Les courses transactionnelles avec deux connexions restent couvertes par la suite PostgreSQL 17 native. Elles devront aussi être rejouées sur la pile Docker après disponibilité de celle-ci ; leur passage natif n'est pas une preuve des services HTTP/Storage.

## Vérifications effectivement réalisées

- Trois tests supplémentaires : migrations copiées identiques, refus de liaison distante/environnement expurgé, exécution réelle de la baseline générée et des cinq migrations sur PostgreSQL 17 natif (Auth/Storage simulés). Les neuf tables initiales puis les 23 tables publiques finales sont présentes, toutes avec RLS.
- Une erreur de concaténation SQL entre deux index a été détectée par ce dernier test et corrigée : chaque instruction collectée reçoit maintenant son terminateur. Le DDL généré passe après correction ; aucun SQL de production n'est modifié.
- Les suites applicatives, financières et navigateur ont été relancées, ainsi que les trois contrôles TypeScript strict, le build et les 21 références historiques. Total final : **115 tests réussis**. Logs sous `tmp/local-supabase-*.log`.
- Une première exécution du scénario navigateur carnet a observé quantité `1` au lieu de `2` après saisie. Son rejeu isolé a réussi sans modification de l'éditeur ni du test. Cette variabilité de synchronisation reste consignée ; elle ne justifie pas une déclaration de réussite au premier essai.

Resend : chiffrement serveur existant, comptes séparés par émetteur, rotation et isolation vérifiés avec clés fictives dans les suites mail/financières. Pas de clé maître générée ou remplacée silencieusement dans `.env.local`, ni e-mail réel. OpenAI : contrats, validation, plafonds et erreurs testés avec réponses simulées, aucun appel fournisseur payant. PWA : sept contrôles locaux réussis, dont worker et mise à jour réels dans Chromium ; limites appareils/HTTPS/session réelle conservées dans [le rapport PWA](pwa-logifa-2026-10-13.md).

## Ce qui reste à valider

1. **Local, dès que Docker est installé** : démarrage réel, migrations dans les services officiels, HTTP Auth/REST/RPC/Storage, chaîne PDF/empreintes/immutabilité et courses sur le PostgreSQL du conteneur. Corriger et documenter tout échec de cette première exécution avant de déclarer la recette complète.
2. **Services hébergés** : configuration native Clerk (issuer/subject, administrateur et tiers, expiration/révocation), particularités de Storage/politiques hébergées et session navigateur. La recette GoTrue locale ne les remplace pas. Aucun document fiscal fictif ne doit être créé sur le principal.
3. **Configuration réelle** : clé maître de chiffrement et comptes Resend/domaine par émetteur, clé/modèle/activation OpenAI, publication HTTPS et essais PWA physiques. Toute livraison e-mail ou dépense fournisseur exige son autorisation distincte.

La demande de branche payante est abandonnée. Les anciens rapports restent des preuves historiques ; toute action ultérieure de recette utilise cette cible gratuite, sans projet Supabase distant de test.
