# LOGIFA — lot 3A préparé, migrations à valider

> Les corrections de sécurité et d'intégrité du lot 3A.1 et la procédure actualisée
> figurent dans [lot3a1.md](lot3a1.md). Ce rapport conserve l'état de livraison initial.

Date : 12 octobre 2026. Projet distant audité en lecture seule : `bniitcbsaowwzkjdrqwz`. Branche locale : `develop/logifa`.

## Résultat et périmètre

Le modèle de persistance, trois migrations SQL, les contrats TypeScript, les services serveur et les tests sont prêts à être relus. **Aucune migration, import d'entreprise, création de bucket ou écriture métier distante n'a été exécuté.** Aucune route API ni interface de persistance n'est branchée aux éditeurs. Le lot 3B n'est pas commencé.

L'ancien profil n'est ni supprimé ni renommé. Les références existantes vers `profiles(id)` restent en place. Une liaison administrative explicite entre le nouveau sujet Clerk, son issuer et l'ancien propriétaire des données est prévue dans un schéma privé ; elle est désactivée par défaut.

La suppression locale de `.env.example` était déjà présente au démarrage du lot. Elle est conservée hors du commit du lot 3A. Le contenu de `.env.local` n'a été ni inspecté, ni affiché, ni modifié ; Next.js a chargé son environnement habituel pendant le build.

## Audit réel complémentaire

| Table existante | Enregistrements | Constat |
| --- | ---: | --- |
| profiles | 1 | Clé primaire textuelle ; informations anciennes conservées |
| clients | 0 | `user_id` textuel lié au profil ; aucune politique malgré RLS |
| quotes | 0 | FK profil/client/chantier, numéro obligatoire, statuts contraints |
| quote_items | 0 | FK devis ; quantité/prix/TVA numeric ; ni ordre ni type titre ; aucune politique |
| invoices | 0 | FK profil/client/chantier ; numéro obligatoire et unique globalement ; acompte scalaire existant |
| invoice_items | 0 | FK facture ; type de ligne existant ; ordre absent ; aucune politique |
| projects | 0 | FK profil et client, code unique par propriétaire |
| supplier_invoices | 0 | FK profil et chantier ; reste conservée |
| supplier_invoice_items | 0 | FK fournisseur ; aucune politique |

Les neuf tables ont la RLS activée. Quatre politiques ALL utilisent `auth.uid()::text = user_id` : projets, devis, factures et factures fournisseurs. Pour un sujet Clerk `user_...`, `auth.uid()` tente une conversion UUID incompatible ; ajouter seulement une politique permissive ne constitue pas une correction fiable. Les quatre anciennes politiques sont sauvegardées dans l'audit, puis remplacées dans la migration préparée.

Les cinq tables sans politique sont confirmées par les advisors Supabase. Aucune fonction, vue ou trigger personnalisé n'a été trouvé dans `public`. Le catalogue des colonnes (avec précision numérique), contraintes, FK, index, grants et politiques figure dans `supabase/audit/schema-2026-10-12.json` ; aucun contenu personnel du profil n'y est stocké.

Le bucket `logos` est public, limité à 2 Mio et `image/*`, et contient huit objets. Ses règles anciennes permettent les écritures à tout compte authentifié. Il n'est ni supprimé ni transformé. La migration prépare un garde restrictif pour les comptes authentifiés et un bucket comptable distinct privé.

Une vérification distante finale confirme : neuf tables, un profil, zéro client/devis/facture, uniquement le bucket `logos`, aucun schéma `logifa_private`, et historique de migrations distant vide. Ce dernier point impose de conserver une sauvegarde du schéma existant avant de commencer une nouvelle histoire de migrations.

## Modèle proposé

| Entité | Fonction |
| --- | --- |
| legal_entities | Identité juridique, SIREN/SIRET, coordonnées, régime et exigibilité TVA, taux optionnel, IBAN/BIC, assurances et mentions |
| issuer_profiles | Identité commerciale, logo, couleur, modèle `local-v1`, source locale et liaison juridique explicite |
| clients / projects | Tables existantes réutilisées ; le chantier reçoit un profil émetteur optionnel |
| quotes / quote_items | Tables existantes réutilisées ; instantanés, origine, cycle de vie, ordre des lignes et titres |
| invoices / invoice_items | Tables existantes réutilisées ; type classique/acompte/finale/avoir, liens devis/chantier/source, instantanés |
| document_sequences | Une série facture par entité juridique, commune aux quatre types ; une série devis distincte |
| payments | Versement réel entrant ou remboursement, sans nécessité de facture ; bénéficiaire, client, contexte, date, montant, mode, référence, qualification et revue fiscale |
| payment_allocations | Affectation d'un versement à une facture ; plusieurs affectations dans les deux directions |
| allocation_reversals | Réduction traçable d'une affectation à l'occasion d'un remboursement ; aucune modification du montant historique |
| deposit_deductions | Factures d'acompte déduites de la finale, une seule consommation par facture d'acompte |
| credit_applications | Utilisation d'un avoir pour réduire une créance, distincte du mouvement bancaire |
| document_files | Fichiers supplémentaires immuables : original, acquitté, signé ou preuve, SHA-256 et métadonnées |
| signature_tracking | Prestataire/référence facultatifs, statut, dates, signataire, fichier signé et preuves |
| document_events | Événements append-only avec date, sujet Clerk, objet et état avant/après |

Il n'y a aucune nouvelle table parallèle de devis, facture, ligne, client ou chantier. Les anciennes colonnes, dont `deposit_amount`, `sender_*` et `meta_options`, sont conservées ; `deposit_amount` n'est pas utilisé comme second registre de paiements.

Les montants du registre sont en centimes entiers, plafonnés à 999 999 999 999 centimes pour rester compatibles avec les montants numeric(12,2) existants. Les contrats métier utilisent bigint et des chaînes décimales, pas des flottants binaires. Les retours JSON/RPC doivent être normalisés avant de devenir des modèles métier typés.

Le périmètre préparé utilise EUR. Les régimes TVA sont inconnus par défaut et doivent être renseignés/validés ; aucune fiscalité commune n'est supposée. La génération native exige une entité revue et un régime connu. L'encaissement peut être enregistré même si la revue fiscale est en attente.

## Import des neuf entreprises locales

`npm run prepare:companies` prépare neuf profils sans écriture distante et sans afficher leurs coordonnées. `--write-plan`, si explicitement souhaité plus tard, écrit un plan sous `tmp/`, ignoré par Git.

Chaque source possède une clé de position et une empreinte du contenu local. Les ID 6 et 7 dupliqués sont conservés comme métadonnées, sans servir de clé primaire. Aucun SIRET n'est utilisé pour fusionner automatiquement des profils. `legal_entity_id` reste null dans le plan : la correspondance juridique devra être décidée après revue des données.

Le service d'import est idempotent sur la clé de source : il préserve un profil identique, refuse une source modifiée sans revue et ne réécrit jamais sa liaison juridique. Un import interrompu peut laisser un sous-ensemble de profils créés ; une reprise conserve les profils déjà importés. Il n'a pas été appelé dans ce lot.

## Règles financières et numérotation

- Un versement est créé une fois avec une clé d'idempotence UUID. Rejouer la même demande retrouve l'enregistrement ; changer les données sous la même clé est refusé. Une nouvelle clé correspondant à un versement similaire produit un avertissement `possible_duplicate`, sans présumer que deux encaissements identiques sont le même mouvement.
- La qualification est explicite : acompte, arrhes ou à qualifier. Une requalification exige un motif, est tracée et ne change pas le mouvement financier. Rapprochement et revue fiscale ont leur statut propre.
- Une facture d'acompte est un document distinct du cash, lié à un devis accepté ou à un chantier. Le même devis peut recevoir plusieurs versements et plusieurs factures d'acompte.
- Affectations : même client et entité juridique, respect d'un devis/chantier spécifié sur le versement ; aucun dépassement du disponible bancaire ni du restant dû de la facture. Le trop-perçu reste non affecté, au lieu d'être compté deux fois.
- Finale : le total du chantier avant déduction reste dans les totaux de lignes ; les factures d'acompte sont déduites séparément. La créance finale et la ventilation taxable sont calculées après déduction, par taux. Exemple testé : 1 000 HT + 200 TVA, moins 300 HT + 60 TVA d'acompte = 700 HT + 140 TVA restant à facturer, soit 840 TTC. Un versement déjà affecté à l'acompte n'est pas affecté une seconde fois à la finale.
- Avoir : document numéroté distinct, montant positif avec signe comptable négatif, lien vers la facture corrigée, limites par montant et par taux. Une facture d'acompte déjà déduite d'une finale ne peut pas recevoir un avoir isolé : la correction coordonnée de la chaîne exige une revue et n'est pas automatisée dans ce lot.
- Remboursement : nouveau mouvement sortant relié au versement initial. Si le cash était affecté, la fraction nécessaire est annulée par une écriture de reversal ; le versement original n'est pas modifié. Un avoir et un remboursement ne sont pas assimilés.
- Paiement : aucun règlement affecté = impayée ; règlement insuffisant = partiellement payée ; créance soldée = payée. Une créance annulée uniquement par avoir peut être `credited`, et ne reçoit pas automatiquement un tampon de paiement. Les imports historiques gardent `original_status` ; leurs paiements doivent être rapprochés, sans fabriquer de versement pour recréer un statut ancien.
- Émission : brouillon natif sans numéro ; attribution transactionnelle au moment de l'émission, en même temps que l'avancement du compteur. Rejouer l'émission restitue le numéro. Aucun `nextval` consommé hors transaction ni reset annuel automatique. Chronologie contrôlée avec la série et les documents déjà émis/importés.
- Numéros : uniqueness par entité juridique. Les profils commerciaux d'une même entité partagent la série. L'ancienne unicité globale est relâchée sans toucher aux valeurs ; un index préserve l'unicité des factures anciennes non rattachées.
- Documents émis et lignes figés ; les informations émetteur/client sont conservées en instantanés. Les remplacements de lignes ne concernent que les brouillons gérés par LOGIFA.

La stratégie préparée arrondit HT et TVA par ligne en HALF_UP. Elle n'est pas branchée aux calculs flottants des éditeurs actuels : toute différence de total aux limites d'arrondi devra être traitée explicitement dans un futur lot d'intégration, sans modifier silencieusement la référence PDF.

## Archivage et acquittement

Le bucket préparé `logifa-documents` est privé, limité à 25 Mio et aux PDF. Aucun UPDATE/DELETE Storage n'est accordé : `upsert:false`, chemin UUID nouveau, original conservé. Chemin : entité/type/document/fichier.pdf.

Le service vérifie l'en-tête PDF, la taille et le nom, calcule SHA-256 sur les octets, puis inscrit les métadonnées. Une reprise sur le même chemin n'est acceptée que si le contenu est identique. Le téléchargement vérifié compare taille et SHA-256. Une URL signée, si demandée, expire après 60 secondes ; elle reste un lien porteur utilisable jusqu'à son expiration et ne doit pas être journalisée.

Storage et Postgres ne partagent pas de transaction : un upload réussi suivi d'un échec d'inscription peut laisser un objet privé orphelin. Il est conservé, jamais effacé automatiquement ; reprendre avec le même `fileId` ou traiter le rapprochement sous contrôle administrateur. Aucun processus de nettoyage distant n'est lancé.

Une version acquittée est une ligne `paid_version` reliée à la même facture et à son original. Aucune nouvelle facture ni numérotation. L'inscription est refusée si la facture n'est pas intégralement réglée. Les paiements et leurs dates/modes restent dans le registre et les événements.

Le grand tampon rouge diagonal **ACQUITTÉ** est la présentation attendue du prochain lot de rendu. Ce lot prépare le rôle de fichier et sa métadonnée ; il ne dessine aucun tampon et ne modifie pas le tampon **ACQUITTÉE** du générateur local existant.

Les imports historiques conservent numéro, date, statut original et métadonnées : aucune renumérotation, aucune consommation de compteur et aucun montant recalculé à partir du PDF. Les liens/types historiques doivent être renseignés explicitement. Un document incomplet peut rester à rapprocher ; il n'est pas silencieusement traité comme payé.

Le retour de solde expose `original_status` et `historical_review_required` pour distinguer les règlements enregistrés du statut porté par l'archive. L'import historique de ce lot ne reconstruit pas les lignes ni leur TVA depuis le PDF. Une déduction d'acompte historique sans lignes fiscales est donc refusée ; une reprise fiscale documentée devra être préparée séparément avant utilisation de cet historique dans une chaîne de solde/avoir.

Le suivi de signature accepte un PDF signé externe et ses preuves, contrôle leur rattachement au devis et la chronologie. Aucun fournisseur n'est choisi, aucune API Youtrust ni abonnement n'est appelé, aucune signature manuscrite maison n'est créée.

## Sécurité et configuration future

Les services utilisent `server-only` et commencent par `requireAdmin()` avant de créer un client ou d'effectuer une lecture/écriture. Le client Supabase utilise une **clé publiable** et le jeton de session Clerk, jamais une clé service_role/secrète. Il refuse une clé `sb_secret_...` et une URL de projet différente de celle de LOGIFA.

La RLS vérifie le sujet **et l'issuer** Clerk, plus le rôle `authenticated`, contre une liaison singleton privée. L'absence de liaison ou son état disabled ferme l'accès. Les anciennes colonnes `user_id` continuent à référencer le profil conservé ; elles ne sont pas substituées par le nouveau sujet Clerk.

Les tables financières ont des droits SELECT seuls pour le rôle authenticated. Les commandes transactionnelles se trouvent dans un schéma non exposé, avec wrappers publics SECURITY INVOKER. Les commandes privées SECURITY DEFINER vérifient explicitement l'administrateur et ont un search_path vide ; leur raison d'être est de refuser les écritures REST directes et de garantir les écritures atomiques avec événements. Les utilitaires privés ne sont pas accordés au navigateur/anon. Un verrou singleton impose le même ordre à toutes les commandes financières, adapté au seul administrateur.

Les entreprises sont des données métier, jamais des comptes Clerk. Les policies de lecture/écriture ne créent pas de rôle métier ou d'organisation par entreprise.

Variables supplémentaires, uniquement serveur, **à préparer après validation** :

```dotenv
SUPABASE_URL=https://bniitcbsaowwzkjdrqwz.supabase.co
SUPABASE_PUBLISHABLE_KEY=
LOGIFA_PERSISTENCE_ENABLED=false
```

Les trois variables Clerk du lot 2 restent nécessaires. Aucune valeur n'a été ajoutée à `.env.local`. Aucun SDK Supabase n'est importé dans un composant client. Le drapeau ne doit devenir true qu'après migration, liaison et recette validées.

L'intégration native Clerk/Supabase devra être configurée pour la **nouvelle** instance LOGIFA : rôle `authenticated` dans le jeton et Third-Party Auth reconnaissant son issuer. L'ancien modèle de template JWT Supabase est déprécié ; il n'est pas repris. Le connecteur SQL ne permet pas de certifier la configuration actuelle des fournisseurs dans le tableau de bord ; cette vérification reste manuelle. [Documentation Supabase–Clerk](https://supabase.com/docs/guides/auth/third-party/clerk).

## Procédure proposée avant application

1. Relire ce modèle et les trois SQL ; confirmer les correspondances juridiques, les régimes/exigibilités TVA et les séries de numérotation.
2. Sauvegarder le schéma réel, les grants/policies, le profil et Storage avec des outils d'administration autorisés. Ne pas réinitialiser le projet pour créer une histoire de migrations.
3. Rejouer `supabase/audit/preflight.sql` en lecture seule et comparer au snapshot. Arrêter si des tables, fonctions, politiques ou données ont changé ; adapter les migrations plutôt que forcer une application.
4. Reproduire le schéma initial sur un environnement Supabase de test isolé ; appliquer les trois migrations dans l'ordre et vérifier les advisors. Les trois fichiers ont chacun une transaction ; en cas d'échec intermédiaire, maintenir l'application désactivée et réparer/reprendre après revue.
5. Configurer l'intégration native de la nouvelle instance Clerk, puis remplir le template de liaison privée avec l'ID administrateur, l'issuer exact et l'ancien profil explicitement choisi. Ne changer aucun ID existant. Activer seulement après double vérification.
6. Importer les profils après revue du plan. Créer/relier les entités juridiques explicitement, renseigner les informations manquantes et valider les paramètres fiscaux. Initialiser les séries avec la prochaine valeur et la dernière date réellement constatées ; aucune déduction automatique à partir du SIRET ou de l'ancien numéro local.
7. Tester sur cette copie un vrai jeton admin, un autre compte, anon, les RPC, Storage et deux sessions PostgreSQL concurrentes. PGlite ne remplace pas ce contrôle du déploiement réel.
8. Après votre accord explicite seulement, prévoir l'application au projet cible. **Aucune de ces étapes d'écriture distante n'a été exécutée ici.**

## Retour arrière sans perte

Avant toute application, revenir en arrière revient à ne pas appliquer les fichiers : le distant est inchangé.

Après application, désactiver d'abord `LOGIFA_PERSISTENCE_ENABLED`, puis utiliser le script opérateur `supabase/rollback/freeze-lot3a.sql` après autorisation. Il désactive la liaison et les mutations autorisées tout en conservant données, colonnes, numéros, événements, objets et original du profil. Les codes locaux peuvent ensuite revenir au lot 2 sans effacer les ajouts conservés.

Il s'agit d'un gel de sécurité réversible par une procédure de reprise validée, **pas d'un DOWN destructif**. Une restauration physique complète d'une sauvegarde écraserait potentiellement les données reçues depuis ; elle n'est pas automatisée. Les contraintes de numéros ne sont pas rétablies à l'aveugle car de nouveaux brouillons peuvent contenir null et deux entités peuvent légitimement partager un numéro.

## Vérifications et limites

| Vérification | Résultat |
| --- | --- |
| PostgreSQL embarqué PGlite, schéma initial reconstruit depuis l'audit | Trois migrations exécutables localement, données exclusivement fictives |
| Tests financiers, RLS et services | `npm run test:billing` : 24 tests réussis ; encaissements sans facture, doublons, affectations, soldes, TVA, séries partagées, crédits/remboursements, fichiers, signatures et gel |
| Services face à visiteur/autre compte | Refus avant tout appel Supabase, testé sur chaque opération préparée |
| Chiffres exacts et arrondis | Bigint et décimaux validés ; contrôles de limites, dates et précisions |
| TypeScript | `npm run typecheck:billing` réussi, configuration dédiée sans migration des pages JS |
| Build Next.js 16.4.0 | Réussi ; aucune nouvelle route applicative |
| Authentification lot 2 | 9 tests d'autorisation réussis |
| Serveur HTTP réel sans configuration | 1 test de fermeture des accès réussi |
| Référence lot 1 | 21 empreintes inchangées, six fixtures intactes, neuf logos présents |
| Plan des entreprises | Neuf profils préparés, zéro import et zéro fusion |
| Distant après préparation | Neuf tables, un profil, bucket logos seul, aucune nouvelle migration |

PGlite exécute un vrai moteur PostgreSQL embarqué ; sa couche Storage est une reconstruction SQL minimale pour les policies, pas le service Supabase Storage réel. Les tests de services remplacent SDK/réseau et sessions Clerk par des fixtures. Les scénarios Promise.all sont sérialisés par cette base locale ; ils ne prouvent pas un essai multi-connexions de production. Aucune recette avec un vrai jeton Supabase ni validation distante des nouvelles policies n'est revendiquée.

Les obligations de facturation et TVA doivent être examinées selon l'opération, le client et le régime. La revue fiscale en attente permet de conserver fidèlement un versement reçu ; elle ne certifie pas une facture ni une déclaration TVA. Les mentions et la numérotation restent des obligations à valider avant exploitation. [Bercy — mentions obligatoires](https://www.economie.gouv.fr/entreprises/gerer-son-entreprise-au-quotidien/gerer-sa-comptabilite-et-ses-demarches/mentions-obligatoires-dune-facture-tout-savoir). La qualification acompte/arrhes doit rester explicite, sans assimilation automatique. [DGCCRF — acomptes et arrhes](https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/acompte-arrhes-avoir).

Le journal est append-only pour les rôles applicatifs ; il n'est pas une preuve inviolable contre le propriétaire PostgreSQL. Les SHA-256 contrôlent les octets archivés. Aucun nouveau rendu PDF, test visuel ou correction de l'anomalie d'acompte de l'ancien éditeur n'a été effectué.

Les quatre alertes npm déjà documentées sur les dépendances préservées demeurent ; aucun audit fix global n'a été lancé. Le guide Supabase et sa documentation native Clerk/Storage ont été consultés ; l'index changelog markdown n'a pas pu être récupéré par le navigateur disponible.

## Inventaire des modifications

- Modifiés : `package.json`, `package-lock.json` (scripts et dépendances de persistance/test).
- Ajoutés : `types/billing.ts`, `tsconfig.lot3a.json`, `lib/billing/{money,validation,company-import}.ts`, `lib/supabase/server.ts`, `lib/services/{billing,archive,companies}.ts`, `scripts/prepare-company-import.mjs`.
- SQL/audit : les trois migrations horodatées sous `supabase/migrations/`, `supabase/audit/{schema-2026-10-12.json,preflight.sql}`, `supabase/operator/bind-admin.sql.example`, `supabase/rollback/freeze-lot3a.sql`, `supabase/README.md`.
- Tests : `tests/billing/{bootstrap,database.test,domain.test,services.test}.mjs`.
- Rapport : ce fichier.

Versions exactes : Supabase JS 2.117.3 ; CLI Supabase 2.120.0 ; PGlite 0.5.9 ; TypeScript 5.9.3 ; types Node 22.19.0. Le client Supabase exige Node >= 22 ; la machine vérifiée utilise Node 22.13.1.

Les éditeurs, leurs CSS, les générateurs PDF, les logos, les entreprises, les prestations, le README et l'authentification sont inchangés. Aucune donnée ni table distante n'est supprimée. Aucun push, Supabase distant modifié ou abonnement externe. Le lot suivant attend votre accord.
