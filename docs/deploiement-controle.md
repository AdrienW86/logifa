# LOGIFA — configuration et application contrôlée

État au 13 octobre 2026 : les trois migrations sont appliquées, la liaison historique est effectuée et la persistance locale est activée après recette navigateur réelle. Voir [le rapport final et ses limites](finalisation-autonome-2026-10-13.md), notamment les deux migrations additives clients/archives préparées mais non appliquées. Sans la réservation SQL, les nouveaux uploads refusent d'écrire Storage. Les instructions ci-dessous pour une base initiale ne doivent pas être rejouées sur ce projet déjà migré.

Les trois migrations et la liaison ont été appliquées au projet Logifa le 13 octobre 2026, sous autorisation explicite. **Ne pas les rejouer.** Voir [le rapport d'application](application-supabase-20261013.md) pour les versions distantes et l'arrêt de recette Next ; la persistance locale reste désactivée. Les instructions suivantes décrivent la préparation initiale et la recette d'un environnement neuf isolé. La création d'une branche payante exige un chiffrage et l'accord préalable ; aucun tarif historique ne constitue un devis actuel.

## Trois SQL corrigés et dépendances

Appliquer **dans cet ordre**, un fichier entier à la fois :

1. `supabase/migrations/20261012150837_logifa_lot3a_model.sql` : modèle, rattachement clients, intégrité composite, drafts/workflow, comptes mail privés ; fermeture immédiate des accès.
2. `supabase/migrations/20261012150838_logifa_lot3a_operations.sql` : gardes, finance, numérotation, périmètres clients/chantiers, workspace et mail transactionnels ; fonctions privées inaccessibles hors droits prévus.
3. `supabase/migrations/20261012150839_logifa_lot3a_security.sql` : wrappers RPC, SELECT administrateur, politiques RLS et bucket privé immuable. Aucun DML direct des données métier pour les clients API.

Prérequis : les **neuf tables initiales** (`profiles`, `clients`, `projects`, `quotes`, `quote_items`, `invoices`, `invoice_items`, `supplier_invoices`, `supplier_invoice_items`), leurs colonnes/index/contraintes/politiques tels que capturés sous `supabase/audit`, l'identifiant historique dans `profiles`, rôles Supabase `anon/authenticated`, `auth.jwt()` et catalogues Storage. PostgreSQL 17 est la version de recette. Vérifier réellement le schéma cible et ses données ; la migration réutilise notamment l'échéance existante des factures.

Les scripts sont transactionnels et destinés à un schéma initial non encore migré. Ils ne sont pas des scripts idempotents à rejouer sur une base déjà migrée. La migration 3 remplace les politiques historiques explicitement nommées et refuse un bucket `logifa-documents` déjà présent : investiguer plutôt que supprimer. Aucun document, client ou profil historique n'est supprimé. L'ajout de contraintes/index peut verrouiller les tables ; prévoir maintenance et sauvegarde restaurable. Les droits historiques changent volontairement : ancien client direct et ancienne authentification UUID ne constituent plus un accès supporté.

Le plan initial de quatrième migration a été remplacé par consolidation avant toute application distante. Si une ancienne variante a été appliquée ailleurs, arrêter : établir le diff réel et une migration corrective dédiée, sans rejouer les trois fichiers ni modifier artificiellement l'historique.

## Configuration serveur

Usage local après installation des dépendances : `npm run dev`, puis connexion Clerk LOGIFA. Tant que la persistance est désactivée, les éditeurs manuels, catalogue, sauvegardes locales et PDF classiques restent disponibles ; la gestion affiche un état non connecté et ne fabrique pas de chiffres. Après recette isolée autorisée, activer la persistance, importer explicitement les profils et configurer les entités avant d'émettre.

Parcours conseillé : choisir l'émetteur → créer/reprendre sa fiche client → saisir le devis dans le formulaire existant → sauvegarder le brouillon serveur → relire son PDF de brouillon → émettre explicitement → archiver l'original → marquer l'acceptation réelle → enregistrer les encaissements et leurs affectations → préparer acompte/finale ou avoir documenté → relire/émettre/archiver → proposer une variante acquittée uniquement lorsque les encaissements nets contrôlés l'autorisent. L'envoi éventuel utilise toujours le compte Resend de cet émetteur après aperçu et confirmation.

Copier `.env.example` vers `.env.local` sans commiter les valeurs. Une seule variable publique : la clé publiable Clerk.

| Variable exacte | Usage |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Instance Clerk LOGIFA choisie explicitement. |
| `CLERK_SECRET_KEY` | Secret Clerk serveur. |
| `LOGIFA_ADMIN_CLERK_USER_ID` | Unique administrateur, sujet `user_…`, serveur uniquement. |
| `LOGIFA_PERSISTENCE_ENABLED` | `false` avant recette ; `true` seulement sur cible approuvée. |
| `SUPABASE_URL` | URL exacte `https://<ref>.supabase.co`. |
| `SUPABASE_PUBLISHABLE_KEY` | Clé `sb_publishable_…` ; aucune clé `service_role`. |
| `LOGIFA_SUPABASE_PROJECT_REF` | Référence cible 20 caractères, concordant exactement avec l'URL. La renseigner explicitement pour la recette isolée. |
| `LOGIFA_OPENAI_ENABLED` | `false` par défaut. |
| `LOGIFA_OPENAI_COSTS_APPROVED` | `false` ; accord sur coûts et données requis avant activation. |
| `OPENAI_API_KEY` | Secret serveur, jamais transmis au navigateur. |
| `OPENAI_MODEL` | Modèle compatible Responses/sorties structurées choisi explicitement. |
| `LOGIFA_EMAIL_ENCRYPTION_KEY` | 32 octets aléatoires encodés base64, secret serveur sauvegardé séparément de la base. |
| `LOGIFA_EMAIL_PREVIOUS_ENCRYPTION_KEY` | Facultative pour déchiffrer pendant une rotation contrôlée. |
| `LOGIFA_EMAIL_ENABLED` | `false` par défaut ; activation des envois réels après recette et autorisation. |

Clerk : conserver l'instance LOGIFA indépendante, désactiver l'inscription publique dans le dashboard, créer/identifier l'administrateur et garder les destinations de retour locales prévues. Configurer [l'intégration native Clerk dans Supabase](https://supabase.com/docs/guides/auth/third-party/clerk), avec l'issuer exact et les claims requis. Pas d'organisations ni de rôles multi-utilisateurs.

Après les trois migrations, établir la liaison **une fois les valeurs vérifiées**, depuis un accès SQL propriétaire ; exemple à remplacer, ne pas exécuter tel quel :

```sql
begin;
update logifa_private.admin_binding
set clerk_subject = '<identifiant administrateur Clerk vérifié>',
    clerk_issuer = '<issuer https Clerk exact vérifié>',
    legacy_profile_id = '<identifiant profiles historique conservé>',
    enabled = true
where singleton;
commit;
```

Sans liaison complète/activée, les fonctions restent fermées. Le profil historique est référencé, pas renommé/remplacé. Ne jamais renseigner les valeurs fictives de tests en production.

Resend : dans Gestion → entreprises/paramètres, sélectionner un émetteur et son **compte existant**, saisir sa clé API, son domaine déjà vérifié, son expéditeur et reply-to. Le domaine doit correspondre à l'expéditeur. Vérifier avec ce compte ; les DNS exacts viennent du dashboard de cette entreprise. Aucune centralisation. [API domaines](https://resend.com/docs/api-reference/domains/list-domains), [envoi](https://resend.com/docs/api-reference/emails/send-email), [idempotence fournisseur](https://resend.com/docs/dashboard/emails/idempotency-keys).

Rotation de clé Resend : remplacer la clé dans les paramètres de l'émetteur, revérifier le domaine et refaire les aperçus ; l'historique reste. Rotation du secret de chiffrement : conserver temporairement la clé précédente dans la variable prévue, réenregistrer explicitement chaque clé Resend sous la nouvelle clé, tester, puis retirer l'ancienne seulement après vérification de tous les comptes et des restaurations. Un simple enregistrement avec champ clé vide conserve le ciphertext existant ; il ne le rechiffre pas. Aucun endpoint ne restitue une clé en clair. Ne pas journaliser les corps de configuration via proxy/APM.

OpenAI : choisir le modèle et les limites de dépense dans son compte ; définir les deux drapeaux seulement après accord. Relire les données qui seront envoyées. Le bouton requiert confirmation puis revue ; l'agent propose des champs du formulaire et ne réalise aucune action financière. Voir [sorties structurées Responses](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

## Vérification isolée après application

1. Sauvegarder schéma/données/politiques/grants ; vérifier une restauration et relever les effectifs/identifiants historiques. Contrôler les neuf tables contre le schéma de recette et l'absence de conflits de noms.
2. Après **chaque fichier**, vérifier tables attendues, FKs/index, RLS, grants `PUBLIC/anon/authenticated` et EXECUTE via `pg_class`, `pg_policies`, `pg_constraint`, `pg_indexes`, `pg_proc`, `has_table_privilege` et `has_function_privilege`. Après 1 et 2, aucun accès anonyme aux nouveaux objets, aucune fonction sensible ouverte. Après 3 : 23 tables publiques protégées, tables privées inaccessibles directement, RPC administrateur uniquement.
3. Configurer la liaison et tester les vrais appels REST/RPC avec : sans jeton, compte Clerk tiers, administrateur, jeton expiré/invalide, issuer incorrect. Contrôler refus HTTP, pas seulement des rôles PostgreSQL simulés. Vérifier aussi les routes Next et les origines de mutation ; session déconnectée/configuration admin absente doivent rester fermées.
4. Importer les neuf profils explicitement, qualifier les entités et séries sans fusion automatique ; créer deux clients fictifs propres à deux émetteurs. Refuser documents/chantiers/allocations croisés et mutation d'émetteur d'une fiche liée. Vérifier que le profil historique et les fiches non attribuées sont toujours intacts.
5. Rejouer les scénarios financiers et courses à deux connexions : numéros continus sans consommation sur refus, finale unique par devis, affectations et déductions sans doublon, paiements partiels/multiples, remboursements, avoirs avant et après finale. Contrôler les soldes de correction séparément des encaissements nets ; zéro dette par avoir ne suffit pas à acquitter.
6. Vérifier Storage réel : bucket privé, URL publique refusée, lecture/insert tiers refusés, update/upsert/delete d'original interdits, chemin/SHA vérifiés, lecture privée autorisée administrateur. Tester original et variante acquittée distincts, remboursement puis refus de délivrer une variante acquittée devenue injustifiée. Rejouer un échec entre upload et enregistrement et rapprocher les objets orphelins.
7. Tests Resend sans livraison réelle d'abord : deux comptes fictifs, clé/domaines propres, mauvais domaine refusé, preview altéré/expiré/configuration changée refusés, même demande concurrente une seule revendication. Sur vrais comptes, la consultation des domaines exige une autorisation de configuration ; tout e-mail réel exige une confirmation séparée. Vérifier timeout/état incertain et rapprochement fournisseur avant relance.
8. Relire visuellement les six classiques et cinq variantes, mentions et arrondis, compléter la qualification comptable/fiscale et les obligations de facturation électronique applicables. Archiver les preuves de recette. Obtenir ensuite une décision explicite pour la production ; ne pas fusionner automatiquement la recette au principal.

Pour une application déjà migrée, désactiver la persistance avant intervention ; aucune procédure de rollback par suppression de données n'est proposée. En cas de migration échouée, la transaction du fichier doit être annulée et l'état inspecté. Conserver les fichiers précédents appliqués et préparer une correction contrôlée si nécessaire.

## Installation PWA

La recette isolée utilise désormais [Supabase local CLI/Docker](recette-supabase-locale-2026-10-13.md). Aucune branche payante n'est prévue. Son exécution réelle reste conditionnée à l'installation de Docker.

Consulter [l'installation et la recette PWA](pwa-logifa-2026-10-13.md). La publication doit servir les ressources PWA publiques en HTTPS et conserver toutes les protections des routes métier. La PWA ne remplace pas la recette financière et Storage ci-dessus.
