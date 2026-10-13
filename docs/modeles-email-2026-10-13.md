# LOGIFA — modèles d'e-mails par émetteur

## Utilisation

Dans Gestion → Paramètres (ou Entreprises), sélectionner l'émetteur puis ouvrir « Modèles d'e-mails ». Le compte Resend et les modèles utilisent cet émetteur ; aucun compte n'est centralisé. Après application contrôlée de la migration, « Créer les cinq modèles initiaux » prépare devis, factures, acomptes, factures acquittées et relances, sans écraser les personnalisations déjà présentes.

Créer et modifier le nom, l'objet, le message, la signature, le pied de page, les couleurs, la typographie et le logo. Les logos et liens sont des URL HTTPS fixes ; un logo destiné aux clients doit être accessible publiquement depuis votre domaine/CDN, sans clé ni URL privée à durée courte. Les logos PDF existants ne sont pas modifiés. Les polices proposées utilisent des familles courantes avec repli. L'aperçu desktop/mobile affiche explicitement des données fictives.

Plusieurs modèles peuvent partager un type. Le défaut est unique par émetteur/type, avec verrouillage transactionnel et index partiel unique. Le premier modèle actif devient défaut ; archiver le défaut choisit un autre modèle actif du même type s'il en reste. Sinon aucun modèle archivé n'est choisi. Un type ne change pas après création : créer/dupliquer un autre modèle pour une autre catégorie. La limite est de 100 modèles conservés par émetteur, archives comprises.

Dupliquer, archiver ou restaurer conserve les versions et la traçabilité. L'historique permet de préparer une copie d'une ancienne version ; il ne réécrit pas le passé. Les sauvegardes utilisent une révision attendue : une modification concurrente affiche un conflit au lieu d'écraser silencieusement les changements.

Depuis un document émis et archivé, ouvrir l'envoi e-mail, choisir un modèle, renseigner le destinataire et « Appliquer le modèle au message ». Les variables sont alors résolues côté serveur à partir du document et de ses snapshots. Modifier librement l'objet et le message final, puis refaire l'aperçu avant confirmation explicite. Le modèle reste intact. L'aperçu comprend l'identité Resend propre à l'émetteur et le PDF à relire.

Une facture acquittée exige un solde métier réellement acquittable et sa variante PDF acquittée archivée. Les modèles d'acompte sont réservés aux factures d'acompte. Une relance est toujours une action humaine, sans planification ni déclenchement automatique. `LOGIFA_EMAIL_ENABLED=false` maintient les envois réels désactivés ; la clé maître existante reste inchangée.

## Contenu sûr et versions

Variables autorisées : `company.name`, `company.email`, `company.phone`, `company.address`, `client.name`, `client.email`, `document.number`, `document.date`, `document.total`, `document.due`, `document.remaining`, sous forme `{{variable}}`. Le solde est calculé pour les factures ; il ne constitue pas une dette de devis. Les données viennent des snapshots du document émis. Un champ absent reste vide, sans invention de coordonnées ou de montant.

Le modèle contient du texte, pas du HTML libre. Son schéma est validé à l'exécution, les variables inconnues refusées, les couleurs limitées à des codes hexadécimaux, les polices à une liste fermée, les liens à HTTPS sans identifiants intégrés. Les données dynamiques et le message final sont échappés avant insertion dans le HTML. L'aperçu est une iframe sandboxée, sans scripts ni privilèges d'origine, avec une CSP restrictive. Les images HTTPS restent des ressources externes pouvant être bloquées par les clients e-mail.

Le rendu HTML utilise des tables de présentation, des styles inline et des polices courantes, avec version texte jointe au même appel fournisseur, conformément aux champs [HTML et texte de Resend](https://resend.com/docs/api-reference/emails/send-email). Le rendu réel Gmail, Outlook et Apple Mail reste à qualifier avec une livraison explicitement autorisée ; Chromium n'est pas une preuve de rendu de ces logiciels.

Le hash de l'aperçu intègre le modèle, sa révision, le HTML, le texte final, le PDF et sa SHA-256, le destinataire et la version de configuration Resend. Modifier un de ces éléments invalide la confirmation. Le contrôle est rejoué à l'envoi, puis à la réservation transactionnelle. Le service multi-comptes existant conserve chiffrement AES-GCM, vérification réelle de domaine, idempotence et traitement des états incertains, sans renvoi automatique.

Les versions de modèles et le message final utilisé sont conservés dans des tables privées immuables. La réservation d'envoi et son snapshot de modèle s'enregistrent dans la **même transaction**, avant le fournisseur. Même une tentative échouée/incertaine reste retraçable. Les anciens messages manuels fonctionnent encore et ne reçoivent pas artificiellement un modèle. La prise en charge Resend demeure distincte de la livraison et de la transmission réglementaire via une plateforme agréée.

## Migration locale à valider

Fichier : `supabase/migrations/20261013125833_logifa_email_templates.sql`, créé avec la CLI. **Non appliqué à distance.** Il vient après les cinq migrations existantes, dont les deux additives clients/archivage restent elles aussi à valider avant application hébergée.

Il ajoute `logifa_private.email_templates`, `email_template_versions`, `email_template_usage`, leurs FKs/index/triggers, et la RPC `public.logifa_email_templates`. RLS activée dès création ; aucun accès direct `PUBLIC`, `anon` ou `authenticated` aux tables. Les RPC vérifient l'administrateur via le binding existant, avec `search_path` vide et droits EXECUTE explicites. Voir les [recommandations Supabase pour les fonctions](https://supabase.com/docs/guides/database/functions).

L'implémentation existante `api_mail` est renommée en `api_mail_legacy` et rendue inaccessible aux rôles API ; un wrapper de même signature ajoute la réservation de version sans réécrire le service d'idempotence. La transaction de migration annule tout le fichier en cas d'échec. Aucun document métier, ancien message, clé chiffrée ou compte Resend n'est supprimé ou réattribué.

Avant application : sauvegarder/restaurer schéma et données, relever les migrations réellement présentes, tester cette migration sur la pile Supabase locale, puis valider son application hébergée. Après application : vérifier les trois tables privées et RLS/grants, interdiction de la fonction legacy, RPC administrateur/tiers/anonyme, création des cinq modèles, sauvegarde concurrente, défaut unique, archivage, versions et snapshot d'une tentative simulée. Ne pas tester des factures fictives dans la base principale ni envoyer un véritable e-mail sans confirmation.

Avant migration, l'écran signale l'indisponibilité du stockage des modèles et l'envoi manuel existant reste disponible. Aucun modèle n'est présenté comme sauvegardé sans confirmation Supabase.

## Recette locale

Suite dédiée `npm run test:email-templates` : rendus des cinq types, injection HTML et en-têtes, schéma/variables/liens, transport Resend simulé, PostgreSQL 17 natif pour CRUD/versionnement/isolation/default concurrent/permissions, et navigateur Chromium à 1440/390 pixels avec API fictive. Le parcours desktop utilise la souris ; le parcours d'envoi à 390 pixels utilise le clavier après des activations souris non fiables dans l'automatisation. Un essai tactile sur appareils réels reste nécessaire, sans présenter la fenêtre 390 px comme un iPhone/Android testé.

Le cycle documentaire existant teste également l'aperçu signé, l'envoi simulé, la persistance du message final et de la version, l'idempotence, l'invalidation après modification et le refus lorsque les envois sont désactivés. Aucun appel Resend réel n'est effectué : le transport est remplacé temporairement dans le seul processus de test, sans toucher `.env.local`.

La préparation Supabase locale reprend automatiquement la sixième migration avec empreinte vérifiée. Docker reste absent : les tests PostgreSQL natifs ne sont pas des tests HTTP/Storage de la pile Supabase officielle, ni de véritables jetons Clerk. Les limites du [rapport de recette locale](recette-supabase-locale-2026-10-13.md) et de la [PWA](pwa-logifa-2026-10-13.md) restent valables. Aucun changement n'est requis pour Resend ou OpenAI afin de terminer ces travaux locaux.

Contrôles finaux : **128 tests réussis**, trois contrôles TypeScript strict, build Next.js réussi, 21 références et équivalences PDF classiques préservées. Les migrations antérieures, les générateurs classiques, les données d'entreprises/prestations et les logos sont préservés. Les journaux de recette restent sous `tmp/templates-final-*.log`, exclus de Git.
