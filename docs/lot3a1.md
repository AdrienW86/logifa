# LOGIFA — lot 3A.1, revue et application contrôlée

> La recette PostgreSQL 17 avec connexions indépendantes est désormais documentée
> dans [lot3a2.md](lot3a2.md). Les tests réels de l'intégration Supabase/Clerk restent à effectuer.

Date : 12 octobre 2026. Base de travail : `c60409b`, branche `develop/logifa`.
Ce document remplace les règles concernées du rapport du lot 3A. Aucune migration
distante, donnée métier distante ou configuration Clerk/Supabase n'a été modifiée.

## Corrections

1. **Sécurité à chaque commit SQL.** La migration modèle active RLS sur ses douze
   nouvelles tables publiques et retire tous les privilèges de `PUBLIC`, `anon`
   et `authenticated`. La liaison privée est également fermée. La migration
   opérations retire tous les EXECUTE de ces rôles avant COMMIT. Les créations
   et révocations sont atomiques dans chaque fichier BEGIN/COMMIT : les objets
   intermédiaires ne sont jamais visibles à une autre transaction. Les privilèges
   par défaut de Supabase et ceux des autres schémas ne sont pas modifiés.
   La migration sécurité n'ouvre que SELECT/DML de référence autorisés et les RPC
   explicitement contrôlées. Aucun EXECUTE PUBLIC/anon sur les fonctions LOGIFA.
   Les fonctions privilégiées sont privées, avec `search_path=''` ; les commandes
   vérifient le sujet Clerk, son issuer exact, le rôle et l'activation administrative.
2. **Rattachement juridique.** Un chantier utilisé doit appartenir à la même
   entité juridique et au même client. Deux marques d'une même entité restent
   compatibles ; le client est partagé entre entreprises, sans devenir utilisateur.
   Les changements de rattachement d'un chantier/profil déjà référencé sont bloqués
   (y compris sur brouillon). Des triggers protègent aussi les écritures directes
   autorisées sur les référentiels et sérialisent ces écritures avec les RPC.
3. **Avoir historique.** L'archive sans facture source est conservée telle quelle,
   mais ne permet aucune imputation. `logifa_validate_historical_credit` nécessite
   une source explicite, un motif non vide attestant les justificatifs vérifiés,
   une même entreprise/client/contexte, et contrôle le cumul TTC/HT/TVA.
   La validation est append-only dans `historical_credit_validations` ; l'archive
   ne change pas. Même une source indiquée à l'import doit être explicitement validée.
   Les comparaisons sensibles à NULL utilisent IS DISTINCT FROM/IS NOT TRUE.
4. **Acompte crédité avant finale.** La déduction et sa ventilation TVA sont nettes
   des avoirs émis et imputés, et ne dépendent pas de l'encaissement bancaire.
   Acompte 360 €, avoir 120 € : déduction 240 €, jamais 360 €. Un acompte entièrement
   crédité a une déduction nulle. L'avoir peut précéder ou suivre le lien au brouillon.
   Un avoir encore non imputé bloque l'émission finale. La ventilation est figée
   à l'émission dans `tax_snapshot`, jamais recalculée sur un document émis.
   Les crédits historiques sans lignes TVA vérifiables bloquent cette déduction
   et l'émission de nouveaux avoirs sur la source : aucune ventilation n'est inventée.
5. **Finale unique.** Une seule finale native émise par devis, ou par chantier si
   aucun devis. Contrôle transactionnel plus index uniques partiels ; les historiques
   restent archivables. Une finale historique existante interdit une nouvelle finale
   native du même périmètre. L'idempotence de réémission du même document reste permise.
   Aucun remplacement ni seconde finale après avoir intégral n'est prévu implicitement.
   Un nouvel acompte sur un périmètre déjà finalisé est également refusé.
6. **Acquittement réel.** Les allocations moins reversals représentent le cash net.
   La finale contrôle ses encaissements et ceux des acomptes déduits, sans recompter
   ceux-ci comme paiement direct de la finale. Un acompte impayé/refondé empêche son
   acquittement, même si sa créance propre est zéro après déduction. Les avoirs en
   attente d'imputation bloquent également le tampon. `is_acquittable` et
   `settlement_basis` distinguent paiement réel/correction comptable ; une créance
   totalement annulée sans cash reste `credited`, jamais `paid`.
   Le contrôle d'archivage `paid_version` utilise explicitement `is_acquittable`.
   Le service vérifie également ce statut avant upload et avant téléchargement ou
   émission d'une URL signée d'une variante : un remboursement ultérieur interdit
   sa diffusion comme facture actuellement acquittée, tout en conservant l'archive.
   Original et variante sont toujours des objets distincts. Aucun tampon n'est
   rendu dans ce lot, aucun générateur PDF ni éditeur n'a changé.

## Règle métier V1 validée par l'administrateur

Le blocage existant `LOGIFA_DEDUCTED_DEPOSIT_CREDIT_REQUIRES_REVIEW` reste en place
pour un avoir sur acompte après émission de la finale. Il est maintenant limité à
une finale effectivement émise, et ne bloque plus une finale simplement en brouillon.
L'option 1 a été validée : la création automatique d'un brouillon d'avoir directement
sur l'acompte déduit est désormais également refusée. Un brouillon antérieur ne peut
pas être émis après la finale. Une correction portant sur la finale peut faire l'objet
d'un avoir lié à cette finale, avec un `credit_reason` explicite obligatoire, enregistré
dans le document immuable et l'audit. Les plafonds TTC et la ventilation TVA restent
contrôlés. Cet avoir ne déclenche aucun remboursement ni réaffectation de paiement.
Pour une correction spécifique de l'acompte, le service signale une **régularisation
comptable et fiscale coordonnée nécessaire**. Un avoir sur la finale ne suffit pas
automatiquement et n'est jamais créé en substitution. La validation financière d'un
avoir historique sur cet acompte est également refusée ; son archivage reste permis.
**Aucun recalcul rétroactif, nouvelle finale ou compensation automatique n'est autorisé.**
Les originaux, les liens, les snapshots de déduction et les encaissements sont
conservés ; seul l'avoir documenté et son imputation explicite ajoutent des écritures.

## Vérifications avant/après

Les six tests de `tests/billing/corrections.test.mjs` ont été exécutés sur les
migrations originales : **six échecs reproduits** (accès après M1, chantier externe,
avoir NULL imputable, avoir refusé après lien brouillon/déduction brute, deux finales,
acquittement sans cash). Après corrections : six tests réussis, avec cas additionnels
pour crédits partiels/intégraux, liens avant/après avoir, remboursements, alias,
conflits d'idempotence et requêtes simultanées.

| Contrôle local | Résultat |
| --- | --- |
| `npm.cmd run test:billing` | 34 tests réussis, dont 15 sous-tests existants |
| `npm.cmd run test:auth` | 9 tests réussis |
| `npm.cmd run test:auth:http` | 1 test Next réel réussi, configuration manquante fermée |
| `npm.cmd run typecheck:billing` | Réussi |
| `npm.cmd run build` | Next.js 16.4.0 réussi |
| `npm.cmd run test:baseline` | 21 empreintes identiques, 6 fixtures, 9 logos présents |

Les tests SQL reconstruisent les neuf tables du catalogue audité, conservent le
profil fictif et reproduisent les privilèges par défaut permissifs de Supabase.
Après CHAQUE migration : RLS et ACL de toutes les nouvelles tables ; EXECUTE
privés interdits pour les rôles non autorisés ; après M3, wrappers anon interdits.
Le sujet Clerk tiers et le mauvais issuer restent refusés. Les tests de services
exécutent les vrais guards avec Clerk/Supabase simulés, sans requêtes distantes.

**Limite de concurrence :** PGlite exécute un PostgreSQL réel en WASM mais avec
une connexion sérialisée. Promise.all vérifie le refus logique de la seconde finale
et huit numéros distincts ; il ne prouve pas le comportement de deux transactions
PostgreSQL réseau concurrentes. `psql`, `postgres` et Docker sont absents du PATH.
Le verrou singleton et les index uniques sont implémentés ; la validation avec
deux connexions indépendantes reste obligatoire sur une base de recette, avant
production. Aucun test réel du JWT Clerk/Storage distant n'a été exécuté.

## Ordre, dépendances et procédure

Les trois fichiers **non appliqués** ont été corrigés sur place. Leur ordre reste :

1. `supabase/migrations/20261012150837_logifa_lot3a_model.sql` : neuf tables existantes
   et contraintes du catalogue `supabase/audit/schema-2026-10-12.json`, rôles Supabase,
   `gen_random_uuid()`, propriétaire habilité à créer le schéma et révoquer les ACL.
2. `supabase/migrations/20261012150838_logifa_lot3a_operations.sql` : M1 ; `auth.jwt()`
   et types/colonnes exacts ; fonctions, triggers, contrôles transactionnels.
3. `supabase/migrations/20261012150839_logifa_lot3a_security.sql` : M1+M2 ; quatre
   politiques historiques nommées exactement ; Storage et bucket `logos` existants ;
   absence de bucket `logifa-documents` ; propriétaire pouvant créer les policies.

Procédure à exécuter uniquement après autorisation, d'abord sur une copie isolée :

1. Sauvegarder schéma ET données des neuf tables et Storage, vérifier restauration.
   Vérifier qu'aucune migration LOGIFA n'a déjà été appliquée. Si une version a été
   appliquée : STOP, ne pas rejouer ces fichiers ; préparer une migration additive
   spécifique après inventaire des données. Ne jamais supprimer les objets existants
   pour contourner une erreur de création ou d'index.
2. Maintenir `LOGIFA_PERSISTENCE_ENABLED=false`, liaison `enabled=false`, administration
   seule durant la procédure. Comparer le catalogue courant à l'audit/préflight.
   La suppression locale préexistante de `.env.example` reste hors commit ; récupérer
   sa référence Git au besoin sans recopier les secrets de `.env.local`.
3. Appliquer chaque fichier entier dans sa propre transaction, dans l'ordre ci-dessus.
   Après chacun, exécuter les SELECT pertinents de `supabase/operator/verify-lot3a1.sql`
   (les cinq derniers SELECT nécessitent M2). Aucune nouvelle table n'est accessible
   après M1/M2 ; aucun EXECUTE anonyme après M2/M3. Comparer les comptes des neuf
   tables et le contenu du profil à la sauvegarde, sans les publier dans les logs.
4. Après M3, vérifier que seule la lecture et le DML de référentiel prévu sont ouverts
   à `authenticated`, avec RLS administrative. Aucune écriture directe du ledger,
   aucun EXECUTE PUBLIC, aucune modification/suppression d'objets comptables Storage.
   Le bucket comptable doit être privé, PDF seulement, 25 Mio ; `logos` reste inchangé.
5. Sur recette seulement, créer les données synthétiques des tests. Configurer la
   liaison admin par `supabase/operator/bind-admin.sql.example` avec le véritable
   profil historique, le sujet et l'issuer Clerk vérifiés ; activer l'intégration
   native Clerk de ce projet Supabase. Vérifier les signatures JWT via les vrais
   appels Data API : visiteur/compte tiers/issuer différent/config absente refusés,
   administrateur seul autorisé. Ne pas simuler des JWT par SQL en production.
6. Tester deux connexions distinctes en READ COMMITTED sur recette : même devis,
   deux brouillons finaux, deux émissions simultanées ; une seule réussite, un seul
   compteur incrémenté. Répéter avec émissions de documents distincts, allocations
   consommant le même versement et remboursement concurrent. Attendre les deux
   commits, puis contrôler numéros uniques, disponible >=0 et chaîne d'acquittement.
   En REPEATABLE READ/SERIALIZABLE, un conflit peut exiger de rejouer la transaction
   entière avec la même clé d'idempotence, jamais avec une nouvelle clé.
7. Rejouer crédits avant/après lien brouillon, plein/partiel, refus après finale,
   paiements multiples/partiels et reversals ; vérifier original séparé de variante.
   Enregistrer/télécharger un PDF fictif dans Storage : refus anonyme/tiers, pas
   d'URL publique, URL signée courte uniquement via service admin, SHA-256 identique.
8. Faire valider les résultats de recette (la règle métier ci-dessus est déjà validée) ; seulement
   ensuite activer la persistance. Au moindre échec : désactiver la liaison et le
   flag, utiliser `supabase/rollback/freeze-lot3a.sql` pour fermer l'accès sans effacer
   les documents, versements ou archives. Ce freeze n'est pas un rollback de schéma.

## Fichiers et risques restants

Modifiés : trois migrations ; `lib/services/billing.ts` (validation historique
gardée côté serveur), `lib/services/archive.ts` (contrôle des variantes acquittées) ; `types/billing.ts` (validation et snapshot) ; tests financiers
et services ; ce rapport et lien depuis le rapport 3A. Ajout : SELECT de vérification.
Le test TVA existant utilise désormais son propre devis car émettre un nouvel
acompte après finale est interdit ; son contrôle TVA et compteur est conservé.

Aucune dépendance installée/modifiée, aucune donnée réelle en fixture. README,
éditeurs, entreprises locales, prestations, PDF/CSS/logos inchangés. `.env.example`
supprimé avant ce lot reste hors commit. `master` reste inchangé.
Les migrations ne sont pas idempotentes, ne doivent pas être appliquées en fragments.
Les historiques sans client/entreprise identifiables restent non imputables ; les
montants/TVA ne sont jamais reconstitués silencieusement. Les situations partielles
et remplacement de finales exigent un futur mécanisme métier formalisé.
Un compte SQL propriétaire/service_role conserve par conception le pouvoir de
contourner RLS : aucune clé privilégiée n'est utilisée par l'application.
Une URL signée déjà délivrée peut rester utilisable pendant ses 60 secondes de
validité après un remboursement. L'administrateur conserve l'accès aux artefacts
historiques via Storage ; ils ne sont ni supprimés ni réécrits. Un changement de
solde entre précontrôle et upload peut laisser un objet sans métadonnées, mais
la RPC refuse toujours l'enregistrement d'une variante non acquittable.
Les dépendances PDF et leurs vulnérabilités déjà signalées au lot 3A restent hors
périmètre ; le build ne constitue pas une validation fiscale ou visuelle nouvelle.

Références techniques vérifiées : [permissions des fonctions Supabase](https://supabase.com/docs/guides/database/functions),
[Clerk natif](https://supabase.com/docs/guides/auth/third-party/clerk),
[limites de PGlite](https://pglite.dev/docs/about).
