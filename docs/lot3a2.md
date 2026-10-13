# LOGIFA — lot 3A.2 : recette PostgreSQL locale

12 octobre 2026, branche `develop/logifa`, référence applicative `d41235e`.

**Résultat : recette PostgreSQL native réussie, intégration Supabase/Clerk restant
à effectuer. Ce résultat n'est pas une validation complète de production.**

L'administrateur a demandé de poursuivre exclusivement les tests locaux, sans
branche Supabase payante. Aucun projet de recette ni compte Clerk non autorisé
n'était disponible. Aucun objet, migration ou donnée du projet principal n'a été
modifié. Seule une liste de branches en lecture seule a été consultée avant cette
précision (aucune branche existante) ; aucun nouvel accès distant ensuite.

## Environnement et reproduction

PostgreSQL **17.11 natif Windows**, issu de l'archive EDB référencée par le site
PostgreSQL. Aucun PGlite pour les tests de concurrence. Aucun service Windows,
Docker, dépendance npm nouvelle ou modification de l'installation système.

Les binaires, clusters et logs restent exclusivement sous `tmp/lot3a2/`, ignoré
par Git. Chaque exécution crée un cluster neuf, une base au nom aléatoire
`logifa_recipe_*`, et un port disponible sur **127.0.0.1 uniquement**. La version
17, la base, le propriétaire fictif et l'adresse locale sont vérifiés avant les
tests. Aucune URL/DSN Supabase, variable PG de l'utilisateur, `.env.local` ou
configuration persistante de psql n'est utilisée par ce harnais.

La connexion locale utilise `trust` pour des fixtures sans secret : ce réglage
ne convient pas à un serveur de production. Le processus est arrêté par `pg_ctl`
à la fin, y compris quand un sous-test échoue. Les dossiers temporaires ne sont
pas supprimés automatiquement ; aucun fichier métier n'est effacé.

Depuis la racine de LOGIFA :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-postgres-recipe.ps1
npm.cmd run test:postgres
```

Le téléchargement est HTTPS depuis EDB, environ 325 Mio compressés. L'extraction
ne conserve que `bin`, `lib`, `share` et contrôle les chemins. L'empreinte de
l'archive observée pendant cette recette est :

```text
6eabdf00d2893713b75db4336a23c3fdf505f056e217ec6e2e95d901750cfea3
```

Cette empreinte verrouille la reproduction ; elle n'est pas présentée comme une
signature ou un checksum publié par EDB. Un changement d'archive exige une revue.

## Reconstruction et migrations

`tests/billing/bootstrap.mjs` reconstruit les neuf tables publiques à partir de
`supabase/audit/schema-2026-10-12.json` : types et précisions, nullabilité/defaults,
contraintes, FK, index, privilèges et politiques historiques. Un seul profil
**fictif** est inséré (`user_legacy_fixture`). Aucune ligne personnelle distante
n'est copiée. Les types, définitions des contraintes et index, ainsi que les noms
des politiques public/Storage, sont comparés au catalogue audité.

Les schémas auxiliaires `auth` et `storage` sont des **reproductions minimales**
pour exercer les règles SQL : `auth.jwt()` lit des claims injectés, aucun JWT
n'est signé/vérifié ; `storage.objects`/`buckets` ne sont pas le service Storage.
Les cinq anciennes politiques Storage sont reprises de l'audit.

Avant M1, les privilèges par défaut permissifs sont reproduits, et renforcés
pour le test : ALL sur les futures tables publiques pour `PUBLIC`, `anon`,
`authenticated`, `service_role` ; EXECUTE sur les futures fonctions pour les
rôles applicatifs. Les révocations doivent donc fonctionner malgré ces grants.

Ordre réellement appliqué sur la base locale neuve, chaque fichier BEGIN/COMMIT entier :

1. `supabase/migrations/20261012150837_logifa_lot3a_model.sql`
2. `supabase/migrations/20261012150838_logifa_lot3a_operations.sql`
3. `supabase/migrations/20261012150839_logifa_lot3a_security.sql`

| Après COMMIT | Tables publiques | Index valides | Fonctions LOGIFA privées + wrappers | Résultat |
| --- | ---: | ---: | ---: | --- |
| M1 | 21 | 81 | 0 | RLS active, aucune nouvelle table accessible aux rôles applicatifs |
| M2 | 21 | 81 | 30 | Aucun EXECUTE PUBLIC/anon/authenticated sur les fonctions privées |
| M3 | 21 | 81 | 48 | Lecture/DML de référence et RPC contrôlés, aucun EXECUTE PUBLIC/anon |

La table privée de liaison administrative reste séparée. Les FK sont validées,
les index prêts/valides, les fonctions ont `search_path=''`. Les grants
authenticated après M3 ne concernent que `is_admin`, les commandes API et leurs
wrappers pour les fonctions. Les 21 politiques RLS publiques administratives sont
présentes. L'insertion non autorisée est testée entre chaque migration ; l'ancien
profil reste présent. La chronologie n'expose pas les nouvelles tables entre les
commits. Le propriétaire SQL/service_role reste privilégié par conception.

## Concurrence réellement observée

Deux processus `psql` créent deux **backend PIDs différents**, dans deux transactions
READ COMMITTED. A exécute sa commande et garde sa transaction ouverte ; B tente sa
commande avant le COMMIT de A. Une troisième connexion observe que
`pg_blocking_pids(pidB)` contient `pidA`. Alors seulement A commit, B reprend et son
résultat est vérifié. Il s'agit de transactions réellement chevauchantes, avec
ordre de verrouillage déterministe, et non de requêtes sur une connexion sérialisée.

**15 chevauchements prouvés** :

| Scénario | Résultat attendu et observé |
| --- | --- |
| 4 paires d'émissions pour une entité | 8 numéros distincts, successifs, sans trou |
| 2 affectations totales du même versement | Première réussie, seconde refusée, montant consommé une seule fois |
| 2 affectations partielles sur une facture | Deux succès, somme exacte, pas de réemploi du cash |
| 2 finales du même devis | Une seule émission, seconde refusée, un seul numéro consommé |
| 2 liens du même acompte à la même finale | Même identifiant retourné, une seule déduction |
| 1 acompte lié à deux finales différentes | Second lien refusé par contrainte unique |
| 2 avoirs dépassant ensemble leur source | Un seul émis, second refusé, plafond source préservé |
| 2 imputations totales d'un même avoir | Une seule réussie, pas de double crédit |
| 2 remboursements partiels | Somme exacte, reversals exacts, net disponible jamais négatif |
| Avoir + imputation concurrents avec remboursement | Net encaissé et créance concordants, original inchangé |
| 2 enregistrements de variante acquittée au même chemin | Reprise idempotente, une seule métadonnée |
| Remboursement concurrent avant variante acquittée | Variante refusée après reprise du verrou ; ancien original/variante conservés |

La déduction fiscale d'un acompte non encaissé ne permet pas l'acquittement de la
finale. Les invariants finaux contrôlent la série complète des numéros émis,
l'absence de doublons et les disponibles non négatifs. Les preuves de PIDs et de
verrous sont dans `tmp/lot3a2/evidence.json`, hors Git et sans jeton ou secret.
Une copie des preuves de la dernière exécution réussie est conservée dans
`docs/lot3a2-evidence.json` pour la revue, avec uniquement des métadonnées de recette.

Un ROLLBACK explicite annule ensemble l'émission, le compteur, le versement et
l'audit. Une collision de numéro provoquée **après réservation du compteur**
annule le compteur, la facture et les événements ; la série est ensuite restaurée
dans la fixture et contrôlée sans trou. Aucun changement du métier principal.

## Sécurité et archivage : portée exacte des résultats

| Vérification | Résultat / portée |
| --- | --- |
| anon SQL et absence de claims | Refus des RPC/données privées |
| Autre sujet Clerk injecté | RPC refusée, tables privées filtrées à zéro ligne |
| Issuer injecté incorrect | RPC refusée |
| Sujet/issuer admin injectés | RPC et accès permis |
| Liaison désactivée | Accès refusé |
| DML direct sur paiements | Refus par privilèges |
| Lecture catalogue Storage privée, anon/tiers | Zéro objet visible |
| UPDATE/DELETE d'objets comptables par admin | Zéro ligne affectée, objets inchangés |
| Bucket comptable | `public=false`, règles SQL distinctes du bucket logos |
| SHA-256, originaux, reprise et variantes | Tests du service réel avec backend Storage simulé réussis |
| Tampon après remboursement | Service refuse téléchargement/nouvelle URL ; registre SQL refuse une nouvelle variante |

**NON TESTÉS ici : signature JWT Clerk, token réellement expiré/invalide, JWKS,
authentification HTTP Supabase/PostgREST, URLs publiques/signées réelles, persistance
des octets dans le service Storage et règles MIME/taille appliquées par celui-ci.**
Les claims injectés ne testent que l'autorisation SQL après authentification. La
vérification cryptographique et l'expiration doivent être vérifiées avant l'entrée
dans PostgreSQL via les services réels. La RLS tourne réellement dans PostgreSQL,
mais la propagation de l'identité Clerk par Supabase reste à vérifier.

Les fichiers PDF/CSS/éditeurs ne sont pas modifiés ni régénérés par ce lot. Les
tests de hash de l'archive utilisent uniquement des octets fictifs ; le contrôle
visuel des documents existants n'est pas une nouvelle preuve de stockage HTTP.

## Résultats et problèmes découverts

| Commande | Résultat |
| --- | --- |
| `npm.cmd run test:postgres` | 17 tests réussis (16 sous-tests + scénario parent), 15 chevauchements prouvés |
| `npm.cmd run test:billing` | 34 tests réussis |
| `npm.cmd run test:auth` | 9 tests réussis |
| `npm.cmd run test:auth:http` | 1 test serveur Next local réussi, sans configuration |
| `npm.cmd run typecheck:billing` | Réussi |
| `npm.cmd run build` | Next.js 16.4.0 réussi |
| `npm.cmd run test:baseline` | 21 empreintes identiques, 6 fixtures cohérentes, 9 logos présents |

Aucun défaut des migrations ou des règles financières découvert dans les cas
exercés. **Aucune correction applicative/SQL nécessaire**. Les ajustements ont
uniquement concerné le harnais : attendre PostgreSQL prêt plutôt que le seul port
TCP, normaliser l'adresse inet, comparer les politiques des deux schémas, vérifier
le refus UPDATE/DELETE RLS par zéro ligne affectée plutôt que par exception.
Les échecs de mise au point du harnais ne sont pas des anomalies métier.

Fichiers ajoutés : `scripts/prepare-postgres-recipe.ps1`,
`tests/postgres/native.mjs`, `tests/postgres/recipe.test.mjs`, ce rapport et
`docs/lot3a2-evidence.json`.
Modifications : un script `test:postgres` dans `package.json`, lien depuis le
rapport précédent. Aucune dépendance ni lockfile modifié ; migrations inchangées
depuis `d41235e`. La suppression préexistante de `.env.example` reste hors commit.

## Conditions restantes avant production

1. Faire autoriser un environnement Supabase temporaire isolé, sans données
   personnelles et sans intégration GitHub automatique. Si une branche est retenue,
   chiffrer son coût pour l'organisation et obtenir l'accord **avant création**.
   Tarif public indicatif Micro : à partir de 0,01344 USD/h (0,32256 USD/24 h),
   plus les autres usages. Aucun coût Supabase de recette engagé dans ce lot.
2. Reproduire le schéma existant et appliquer les trois fichiers sur cet
   environnement seulement, avec contrôle des versions PostgreSQL/extensions,
   vrais grants et catalogues Auth/Storage. La base principale reste interdite.
3. Configurer l'intégration native Clerk et la liaison administrateur vérifiée.
   Fournir des sessions de test admin et compte tiers dans un mécanisme local
   ignoré/session navigateur, jamais dans les fixtures Git, le chat ou les logs.
4. Tester via Data API/RPC et Storage HTTP : aucun token, admin, tiers, issuer
   erroné, véritable token expiré et signature invalide. Un refus de token valide
   admin doit être distingué du refus attendu d'un token tiers. Tester également
   que le compte tiers ne peut obtenir aucune URL signée ni lire directement un
   objet comptable via une politique historique permissive.
5. Charger seulement des PDF fictifs ; téléchargement privé et SHA-256 exact,
   accès public interdit, original jamais écrasé, variante séparée et contrôle
   d'acquittement après remboursement. Tester les limites MIME/taille et la courte
   expiration des URLs. Une URL déjà signée conserve potentiellement sa validité
   pendant ses 60 secondes même si un remboursement survient ensuite.
6. Rejouer la concurrence sur les connexions/pool et niveaux d'isolation réels.
   Ce lot prouve READ COMMITTED et des ordres déterministes ; il n'est ni un test
   de charge ni une preuve exhaustive de tous les entrelacements. En isolation
   supérieure, vérifier les erreurs de sérialisation et les reprises avec la même
   clé d'idempotence. Le verrou global est cohérent avec un administrateur unique,
   mais sérialise aussi les lectures RPC et devra être mesuré si le volume augmente.
7. Faire valider le rapport d'intégration et les sauvegardes/restauration avant
   toute décision sur le projet principal. Ne pas fusionner automatiquement une
   branche de recette dans le principal. Le lot 3B n'est pas commencé.

Références : [binaires Windows PostgreSQL](https://www.postgresql.org/download/windows/),
[archives EDB](https://www.enterprisedb.com/download-postgresql-binaries),
[pg_ctl 17](https://www.postgresql.org/docs/17/app-pg-ctl.html),
[intégration Clerk native](https://supabase.com/docs/guides/auth/third-party/clerk),
[coûts des branches Supabase](https://supabase.com/docs/guides/platform/manage-your-usage/branching).
