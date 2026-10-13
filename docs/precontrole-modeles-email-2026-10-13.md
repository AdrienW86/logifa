# LOGIFA — précontrôle des modèles e-mail sur la base hébergée

Projet contrôlé en lecture seule : `bniitcbsaowwzkjdrqwz`. Aucune migration ni mutation distante réalisée pour ce précontrôle. Branche `develop/logifa` ; secrets, PDF et comptes Resend inchangés.

## Diagnostic et compatibilité

Trois migrations sont enregistrées : `20261013074607` (model), `20261013074811` (operations), `20261013074900` (security). La base est PostgreSQL 17.6. La RPC `public.logifa_email_templates(text,uuid,jsonb)` et les trois tables privées des modèles sont absentes. `PGRST202` correspond donc à une fonction réellement absente ; recharger uniquement le cache ne peut pas la créer.

Les dépendances sont présentes : `public.issuer_profiles`, `public.document_events`, `logifa_private.mail_outbox` avec clé primaire UUID `id`, `logifa_private.assert_admin()` et `logifa_private.api_mail(text,uuid,jsonb)`. Le nom futur `api_mail_legacy` ne présente aucun conflit. Le binding historique est actif et lié. Le rôle authenticated dispose de l'USAGE du schéma privé ; la fonction mail est inaccessible à anon et sa RPC n'a pas d'EXECUTE PUBLIC. RLS des émetteurs activée.

Couverture Catalane existe et est active : `1618a925-9ce5-485c-8597-7c3fe70db6ab`. Elite Couverture 66 servira uniquement au contrôle de portée : `4b800418-a4ce-4fd7-b723-f60d68bc4b82`. Les émetteurs sont des profils, pas des utilisateurs. L'administrateur peut gérer les deux ; une requête portant l'identifiant d'Elite ne doit pas voir l'historique ni modifier un modèle appartenant à Couverture Catalane.

Les neuf profils importés ont actuellement `legal_entity_id=null`. Cela n'empêche pas la gestion de modèles, qui dépend du profil émetteur, et ne sera pas corrigé implicitement par cette intervention. Cette recette ne constitue pas une validation de leur émission fiscale.

La migration e-mail ne dépend **ni de la migration clients `20261013113847`, ni de la migration archivage `20261013115344`**. Les cinq tests PostgreSQL natifs de modèles ont été rejoués avec les seules trois migrations initiales puis la migration e-mail, et avec un profil sans rattachement juridique : tous réussis. Auth et Storage y restent simulés, sans prétendre tester une pile Supabase complète. Les tests couvrent initialisation, modifications, versions, défaut concurrent avec blocage observé entre deux connexions, isolation, RLS et permissions.

## Fichier proposé

`supabase/migrations/20261013125833_logifa_email_templates.sql`

SHA-256 du fichier local contrôlé : `ea94e0e8e93625b10ed8e93122deac9c1984d7379601477055c9bc2bd87f5a23`.

Trois tables ajoutées dans `logifa_private`, aucune suppression de lignes existantes : `email_templates`, `email_template_versions`, `email_template_usage`. RLS et REVOKE sont dans la même transaction que leur création. Les fonctions sensibles ont `search_path` vide et une vérification du binding administrateur. Aucun droit direct aux tables pour PUBLIC/anon/authenticated. Les FKs empêchent les rattachements croisés, l'index partiel garantit un défaut par émetteur/type, les triggers interdisent la modification/suppression des versions et usages.

L'ancienne fonction `api_mail` est renommée et son EXECUTE retiré aux rôles API. Le nouveau wrapper de même signature préserve l'implémentation Resend/idempotence et ajoute le snapshot transactionnel du modèle à une réservation future. Aucun compte, clé chiffrée, domaine, destinataire ou historique existant n'est mis à jour pendant la migration.

Le fichier a été renforcé pour l'application contrôlée : `lock_timeout=5s`, `statement_timeout=60s`, et `NOTIFY pgrst, 'reload schema'` avant commit. Les délais ne concernent que la transaction de migration. La notification est délivrée après son commit. En cas d'échec, annuler la transaction et diagnostiquer, sans poursuivre automatiquement ni supprimer des données.

## Sauvegarde ciblée et limites

Les définitions hébergées de `api_mail` et `public.logifa_mail`, leur propriétaire et ACL ont été sauvegardés en lecture seule dans `tmp/email-template-preflight/hosted-functions-before.json`, exclu de Git. Le relevé avant intervention comporte 13 émetteurs, 4 clients, 0 devis, 0 factures, 1 compte mail et 0 réservations d'envoi. Aucune valeur de clé Resend n'est lue ou exportée.

Cette sauvegarde vise les fonctions affectées ; ce n'est pas une nouvelle sauvegarde complète/restaurée du projet. Avant application, revérifier le catalogue, les effectifs, la disponibilité du fichier et son empreinte pour détecter tout changement intervenu depuis le précontrôle. Les sauvegardes historiques ne sont pas présentées comme un instantané actuel des treize émetteurs.

## Procédure après accord explicite

1. Revérifier le projet et l'état des trois migrations ; comparer les fonctions avec la sauvegarde ciblée et vérifier l'absence des nouveaux objets. Arrêter en cas de différence inattendue.
2. Appliquer **uniquement** le fichier e-mail approuvé comme migration nommée. Ne pas rejouer les trois migrations existantes ni appliquer les deux autres migrations locales.
3. Contrôler avec `supabase/operator/verify-email-templates.sql` : trois tables privées/RLS, FKs validées, défaut unique, grants de fonctions, ancien point d'entrée legacy inaccessible aux rôles API. Comparer les effectifs des tables antérieures.
4. Vérifier que PostgREST expose la nouvelle RPC aux appels autorisés. Si la fonction existe mais que PGRST202 persiste, refaire `NOTIFY pgrst, 'reload schema'`, attendre brièvement puis retester. Ne pas modifier les permissions ou contourner l'administrateur pour faire passer l'appel.
5. Dans la session navigateur administrateur réelle, exécuter la recette POST `/email-templates` du contrôleur de recette **après accord**. Le contrôleur doit être relancé pour charger sa nouvelle route. Elle vérifie le projet exact et crée un seul modèle utilisable « Devis — Couverture Catalane », puis une seconde version du pied de page, et relit la version sauvegardée. Le modèle reste présent, avec son historique. Un nom déjà existant fait arrêter le test plutôt que l'écraser.
6. Vérifier avec le scope Elite Couverture 66 : le modèle de Couverture est absent de la liste, son historique est vide et l'archivage croisé est refusé. Aucun profil Elite n'est modifié. Contrôler également le refus anonyme via l'API protégée et la conservation de la session.

Le script préparé est `scripts/browser-recipes/email-templates.mjs`. Il n'a pas été exécuté. Il n'utilise ni faux cookie/JWT ni mot de passe, ne crée aucun document/client/émetteur, ne configure aucun compte Resend et n'envoie aucun e-mail. L'empreinte et le journal du modèle créé sont conservés localement pour diagnostiquer une exécution interrompue ; aucune suppression automatique après un échec.

TypeScript strict et syntaxe des scripts préparés réussis. Le build et les 21 références avaient été validés lors de la remise en état CSS ; aucun fichier de l'application ou moteur PDF n'a été modifié dans ce précontrôle. Les essais réels création/modification/lecture restent **à effectuer après application autorisée**. Aucun push GitHub.
