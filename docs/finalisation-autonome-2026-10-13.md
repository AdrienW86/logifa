# LOGIFA — finalisation autonome, 13 octobre 2026

Ce rapport remplace les états antérieurs d'interruption ; les rapports précédents restent des preuves historiques. Travail exclusivement dans Logifa sur `develop/logifa`. Aucune intervention sur CODE-V OS, aucune migration distante supplémentaire, aucun push, e-mail réel ou appel OpenAI payant. La création d'une branche Supabase payante a été refusée par l'utilisateur : aucun environnement n'a été créé.

## État réellement utilisable

La persistance serveur est active sur `bniitcbsaowwzkjdrqwz`, avec la liaison historique existante et les trois migrations originales déjà appliquées. La connexion administrateur Edge, les cinq pages principales, les API et le rechargement sont contrôlés sur le build de production local. Les créations/lectures de référentiels et brouillons avaient été testées réellement et nettoyées dans la recette précédente ; elles ne sont pas réexécutées pour accumuler des fixtures dans la base réelle.

Les éditeurs manuels, catalogues, calculs et PDF classiques restent disponibles. Les neuf profils locaux sont préparables sans fusion ni attribution juridique automatique. Les vrais émetteurs et clients doivent être enregistrés/configurés explicitement ; aucune reprise de série réelle n'est devinée.

Les nouvelles fonctions de réactivation/suppression des clients, de réservation des archives et de reprise des uploads sont **préparées et testées localement**, mais nécessitent les deux migrations additives ci-dessous. Les actions clients/reprise restent masquées si leurs RPC sont absents. L'upload d'une nouvelle archive refuse d'écrire Storage si la réservation SQL n'est pas disponible : la base principale n'a pas encore ces fonctions. Les PDF classiques locaux ne dépendent pas de cette réservation.

Ne pas commencer des émissions fiscales réelles avant la revue/application approuvée des migrations additives et la recette documentaire sur un vrai service Storage isolé.

## Sécurité réelle et limites

- Administrateur : connexion interactive existante reconnue par Clerk, `auth()` et `currentUser()`, accès aux services Supabase avec rôle natif.
- Anonyme : navigateur indépendant, redirection des pages privées et HTTP 401 sur les API sensibles.
- Compte non administrateur : preuve officielle conservée dans `tmp/final-recipe/nonadmin.json`. Véritable utilisateur et session créés par Clerk, jeton signé vérifié ; cinq API Next refusent HTTP 403, les pages redirigent vers refus, Supabase filtre les lignes et refuse le RPC. Compte et sessions temporaires supprimés. Aucun nouveau compte inutilement recréé cette mission.
- La connexion **interactive** du non-administrateur demeure non validée ; le test réussi utilise le transport Bearer avec une session officielle de développement. Aucun JWT artificiel, cookie injecté ou vérification désactivée.
- Jeton administrateur valide : HTTP 200 côté Next et Supabase. Chaîne volontairement invalide : HTTP 401 des deux côtés. Le même véritable jeton, sans renouvellement, est refusé par Next à expiration +8 secondes ; Supabase l'accepte encore alors, mais le refuse à +68 secondes. Les horloges HTTP des deux services correspondent aux délais mesurés. Ce constat borne une tolérance observée ; il n'en établit pas la durée/configuration exacte ni une garantie officielle. Voir `tmp/final-recipe/token-boundaries.json`. Ne pas prétendre que Supabase refuse immédiatement à `exp`.
- Mauvais issuer : refus en SQL simulé et validation de l'issuer réel ; pas de preuve avec un jeton valablement signé provenant d'une autre instance Clerk. Aucun accès à CODE-V OS pour fabriquer ce scénario.
- Modèle d'accès : un administrateur peut lire toutes ses entreprises en base. L'isolation inter-émetteurs garantit les relations et le périmètre des opérations applicatives ; ce n'est pas une séparation en comptes utilisateurs. Les services refusent l'attachement d'un client/document de l'autre émetteur.
- Catalogue principal : un profil, zéro devis/facture/paiement/fichier documentaire, huit objets Storage historiques, aucune table publique sans RLS. Aucun document fiscal fictif ajouté. Les politiques privées sans SELECT ne sont pas ouvertes pour faire disparaître les informations du linter.

## Migrations supplémentaires prêtes, non appliquées

Après les trois migrations existantes, dans cet ordre :

1. `supabase/migrations/20261013113847_logifa_client_lifecycle.sql` : nouveau RPC protégé, réactivation idempotente et suppression d'un client archivé seulement après confirmation et en l'absence de chantier, devis, facture, paiement ou dépendance FK. Verrou de ligne, refus inter-émetteurs, audit sans recopier les coordonnées supprimées. Aucun client supprimé par l'application de la migration elle-même.
2. `supabase/migrations/20261013115344_logifa_archive_intents.sql` : table privée RLS sans droits directs, réservation du chemin et des métadonnées avant upload, contrôle du document source et de l'acquittement, politique Storage exigeant une réservation, liaison transactionnelle au registre des fichiers et RPC privé de reprise. Aucun fichier existant réécrit/supprimé. Les réservations et tous leurs RPC sont protégés dans la transaction de création, sans fenêtre anon/PUBLIC.

Les trois migrations originales restent inchangées. Ne pas rejouer leurs timestamps locaux avec `db push` : leur correspondance aux versions distantes est dans le guide précédent. Le nouveau SQL doit être revu puis appliqué sur une cible isolée avant tout accord d'application au principal. Le second fichier change les conditions des futurs uploads : déployer SQL avant d'activer la nouvelle version de l'archivage ; un ancien client qui upload sans réservation sera refusé.

Les deux scripts sont testés sur PostgreSQL 17.11 local, avec le schéma historique reconstitué, les migrations précédentes et un profil entièrement fictif. Cela ne prouve pas leur exécution dans Supabase distant.

## Finance, documents et reprise

Recette native : devis/brouillons, acceptation, factures classiques, acomptes, encaissements avant facturation, finales, paiements partiels/complets, avoirs, remboursements, numérotation et opérations concurrentes sur connexions indépendantes. Pas de double finale du même devis, pas de double affectation/déduction, pas d'avoir automatique sur un acompte déjà déduit après émission de la finale. Les validations originales du lot 3A.1 restent intactes.

Les vrais services TypeScript PDF/archives ont généré et relu des fichiers dans un adaptateur Storage local adossé à PostgreSQL réel : SHA-256, tailles, originaux/variantes distincts, refus du tampon avant règlement, conservation des snapshots après changement du client/émetteur, détection d'altération. Les règles de paiement sont revérifiées lors de l'enregistrement et de la lecture d'une variante acquittée.

Nouvelle recette d'interruption : échec réseau avant upload → réservation durable sans objet ; échec SQL après upload → objet lié à sa réservation ; reprise explicite avec vérification SHA/taille → une seule archive enregistrée ; appel répété → aucune duplication. Aucun objet sans réservation en fin de scénario. Les fichiers manquants restent en attente, les fichiers altérés ou variantes devenues non acquittables restent refusés ; aucune suppression ni réécriture automatique.

La reprise traite au plus cent réservations à la fois. Son bouton demande confirmation et affiche séparément les reprises, fichiers manquants et refus. Une réservation ne signifie pas un archivage achevé ; aucune garantie d'atomicité distribuée entre PostgreSQL et Storage n'est revendiquée. Les métadonnées persistantes permettent le rapprochement après interruption sans recréer le PDF.

Le service Supabase Storage **réel n'a pas été testé** : aucune cible isolée disponible, Docker absent et branche payante refusée. Le script `scripts/check-logifa-storage-isolated.mjs` est préparé, garde anti-base-principale testée ; upload, enregistrement, hash après download, accès anonymes/non autorisés et immutabilité restent à exécuter avec le fournisseur. Les variantes acquittées et incidents réseau du fournisseur devront également être rejoués dans cette cible. Un simple PostgreSQL ou adaptateur de fichiers ne remplace pas ce contrôle.

## PDF et dépendances

L'audit npm a détecté quatre vulnérabilités, dont jsPDF 4.2.0. Mise à jour minimale à **4.2.1**, verrouillée, et correction des dépendances transitives `baseline-browser-mapping`, `dompurify`, `fflate`. Audit final : zéro vulnérabilité signalée.

Les sources des générateurs classiques, CSS, logos et données métier sont inchangées ; 21 empreintes historiques conservées. Les six PDF classiques et cinq variantes ont été comparés : **seule** la métadonnée `/Producer (jsPDF 4.2.0)` devient `/Producer (jsPDF 4.2.1)`. Les onze fichiers correspondent exactement à leurs anciennes empreintes si l'on remet uniquement cette chaîne de version pour la comparaison. Les dates, polices, flux de contenu, couleurs, tableaux, pagination et tampons ne sont pas normalisés. Les fichiers produits gardent la version réelle du producteur ; les références historiques ne sont pas remplacées. Leurs SHA bruts changent donc, pas leur contenu rendu.

L'aide de test `tests/fixtures/pdf-equivalence.mjs` accepte exactement ces deux versions et une occurrence ; elle ne masque aucune autre différence. La reprise des archives utilise toujours le SHA brut, jamais ce mécanisme de comparaison. Les originaux déjà archivés ne sont pas régénérés.

[Avis de sécurité jsPDF : annotations](https://github.com/parallax/jsPDF/security/advisories/GHSA-7x6v-j9x4-qf24), [avis de sécurité : sorties HTML](https://github.com/parallax/jsPDF/security/advisories/GHSA-wfv2-pwc8-crg5).

## Émetteurs, clients, interface

Deux émetteurs, carnets homonymes indépendants, modification des noms, logos PNG, couleurs et coordonnées, instantanés conservés : test natif et services applicatifs. Les interfaces sont exercées sur desktop 1440px et mobile 390px : dashboard, entreprises, clients, devis, factures, règlements, bibliothèque, paramètres, formulaires et confirmations. Recherche/suggestion et saisie manuelle restent testées. Les interfaces de gestion utilisent une API simulée pour ces contrôles visuels ; ne pas les assimiler à chaque parcours distant.

Les nouveaux contrôles clients sont vérifiés en SQL et dans le navigateur simulé, avec archive préalable, confirmations, refus des dépendances et des autres émetteurs. Sans migration correspondante, l'application n'affiche pas ces actions comme disponibles.

## Resend et OpenAI

Resend conserve un compte distinct par émetteur. Tests de chiffrement AES-256-GCM avec contexte émetteur, rotation ciblée, non-divulgation des secrets, domaines sélectionnés, identité expéditeur/reply-to, aperçus liés au PDF, idempotence et historique. Fournisseur entièrement simulé pour les tests d'erreurs 401/429/500 et états incertains, sans relance aveugle. Aucun compte actuel centralisé ou remplacé.

`scripts/prepare-logifa-email-key.mjs --write` génère 32 octets cryptographiquement aléatoires, uniquement si la clé est absente, sans en afficher la valeur, et préserve toute clé existante. Aucune clé maître fictive n'est installée en production. La commande sans `--write` a confirmé son absence ; la génération n'a pas été exécutée pour interférer avec votre configuration séparée. Stockage serveur `.env.local` ignoré par Git ; prévoir sa sauvegarde privée et la récupération de la clé avant d'enregistrer des comptes. Rotation de la clé maître : conserver temporairement l'ancienne, réenregistrer les clés API sous la nouvelle puis vérifier avant retrait.

Agent : schéma strict, validation d'exécution et contrôle de provenance, informations manquantes affichées, proposition avant application. Les mises à jour ciblées identifient une ligne existante par sa clé ; elles préservent les autres lignes, exigent la preuve des nouveaux prix/quantités et ne remplacent pas la liste. Le modèle propose un clone et le diff, jamais un changement silencieux. Une preuve « 20 » ne justifie pas la quantité « 2 ». Les champs financiers/légaux non autorisés et les instructions injectées ne permettent pas d'émettre, payer, acquitter ou envoyer. Tests simulés des réponses incomplètes, erreurs, schéma et plafond ; aucun appel payant.

Le plafond IA en mémoire est par processus, non un quota global persistant. Avant activation payante, configurer les limites du compte fournisseur et revoir le quota si plusieurs instances servent l'application.

Variables manquantes au dernier contrôle, valeurs jamais affichées : **`LOGIFA_EMAIL_ENCRYPTION_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`**. Envoi e-mail et les deux activations OpenAI restent à false. Les clés Resend propres aux émetteurs se saisissent dans leurs paramètres, pas dans une variable globale unique.

## Facturation électronique : préparation uniquement

Le modèle dispose d'entités juridiques, SIRET/SIREN côté émetteur, TVA et exigibilité, type de client, snapshots, dates d'opération/échéance, catégorie d'opération, avoirs et données d'encaissement. Il peut accueillir des extensions dédiées sans modifier les documents émis.

Il manque une chaîne de production Factur-X avec XML conforme et validation, des adresses structurées complètes et pays, des identifiants/routages de destinataires adaptés, les statuts et reçus d'une plateforme agréée, un journal de transmissions distinct de Resend, et la ventilation réglementaire B2B/B2C/international/paiements. Prévoir des tables append-only de transmissions liées au document et à l'entité, versions de schéma et idempotence fournisseur ; ne pas confondre workflow commercial ou e-mail envoyé avec statut réglementaire.

Aucune conformité réglementaire complète démontrée. Un PDF envoyé par Resend ne constitue pas à lui seul une facturation électronique réglementaire. Vérifier les données et obligations avec les spécifications actuelles avant une intégration dédiée. [Informations officielles DGFiP](https://www.impots.gouv.fr/professionnel/je-decouvre-la-facturation-electronique).

## Tests et livraison

La suite finale comporte **105 tests réussis**, trois contrôles TypeScript strict, build Next.js et contrôle des 21 empreintes. Ventilation : auth 9, billing 35, PostgreSQL natif 29, éditeur 19, sécurité workspace 1, navigateur éditeur 8, navigateur workspace 3, HTTP fail-closed réel 1. Les fichiers `tmp/final-recipe/*.log` donnent les preuves de chaque suite. Tests navigateur réels Clerk/admin/anonyme et jetons fournisseurs sont séparés de ce compteur.

Recherche de secrets accidentels dans les fichiers suivis : aucun suspect détecté par les signatures de clés connues. Ce contrôle ciblé ne remplace pas un audit humain complet ou une analyse exhaustive de l'historique Git. `.env.local`, profils navigateur, sauvegardes et traces restent exclus de Git. Aucun contenu secret n'est affiché.

Premier commit local de sauvegarde validée : `c38d35e` (recette native et fournisseurs). Le commit suivant livre les corrections et ce rapport ; son hash est indiqué dans la livraison. `master` n'est pas modifié.

## Actions indispensables avant utilisation documentaire réelle

1. Revoir les deux migrations additives, leurs droits et leur impact sur les uploads, puis donner un accord explicite avant toute application distante supplémentaire. Ne pas rejouer les trois migrations déjà appliquées.
2. Fournir/installer une cible Supabase locale complète gratuite, ou ultérieurement autoriser une cible distante isolée ; effectuer la recette Storage réelle et les variantes acquittées avant validation finale de production.
3. Configurer les vrais émetteurs : rattachements juridiques explicites, séries cohérentes avec l'historique réel, mentions/TVA/assurances/banque, logos et carnets. Les fixtures de recette restent archivées/désactivées.
4. Configurer la clé maître et les comptes Resend séparés, tester les domaines avec les permissions API nécessaires, puis confirmer séparément le premier envoi réel.
5. Configurer le modèle et la clé OpenAI, les dépenses autorisées et la sélection des données à transmettre avant d'activer ses deux drapeaux.
6. Pour une publication externe, passer de l'instance Clerk de développement à une configuration de production contrôlée, avec issuer/binding et recette correspondants.

Les travaux locaux sans clés sont finalisés. La mise en service financière/documentaire de production reste conditionnée aux migrations supplémentaires et à la recette Storage réelle ; elle n'est pas déclarée complète.
