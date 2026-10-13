# LOGIFA — application Supabase et arrêt de recette, 13 octobre 2026

Projet exclusivement : `bniitcbsaowwzkjdrqwz`, branche `develop/logifa`. Autorisation explicite reçue, conditionnée à la validation de l'intégration native Clerk–Supabase. **Trois migrations réellement appliquées et liaison historique activée. Raccordement REST natif validé ; parcours Next authentifié non validé. Persistance locale actuellement désactivée.** Aucune application déclarée entièrement opérationnelle.

## Avant application

Jeton administrateur renouvelé après activation officielle par l'utilisateur : signature RSA-SHA256 vérifiée avec les JWKS Clerk, expiration valide, sujet égal à `LOGIFA_ADMIN_CLERK_USER_ID`, issuer `https://dear-buck-9396.clerk.accounts.dev`, `role: authenticated` présent. Supabase REST répond HTTP 200 ; jeton invalide HTTP 401. Aucune clé ou jeton affiché/enregistré. Le script a utilisé la session administrateur déjà existante, sans créer de session ni de compte.

Sauvegardes DPAPI revérifiées avant exécution : neuf tables restaurées localement à l'identique, huit PNG récupérables avec SHA-256 identiques. Le catalogue distant (tables, colonnes, contraintes, index, politiques et grants) n'avait pas changé ; aucune migration préexistante, un profil, aucune donnée de devis/facture/client/paiement. L'identifiant du profil courant correspondait à celui sauvegardé par empreinte. Les trois fichiers SQL correspondent aux SHA-256 du préflight.

Un premier contrôle automatique a rejeté une commande qui aurait retourné le profil déchiffré complet et le SQL privé en sortie. Cette commande n'a pas été exécutée. La méthode retenue a comparé le profil par empreinte et lu seulement l'identifiant administrateur non secret et le domaine public nécessaires à la liaison expressément autorisée ; aucune donnée métier déchiffrée affichée, aucun contrôle contourné. Aucun accord supplémentaire n'a été demandé pour les opérations déjà autorisées.

## Migrations appliquées

| Fichier local inchangé | Nom | Version distante enregistrée |
| --- | --- | --- |
| `supabase/migrations/20261012150837_logifa_lot3a_model.sql` | `logifa_lot3a_model` | `20261013074607` |
| `supabase/migrations/20261012150838_logifa_lot3a_operations.sql` | `logifa_lot3a_operations` | `20261013074811` |
| `supabase/migrations/20261012150839_logifa_lot3a_security.sql` | `logifa_lot3a_security` | `20261013074900` |

Le connecteur MCP attribue ses propres timestamps d'application : ils diffèrent des noms locaux. L'historique réel a été conservé, pas réécrit. **Ne pas lancer aveuglément `supabase db push`** : les anciens timestamps locaux pourraient être considérés non appliqués. Toute future synchronisation CLI doit tenir compte de cette correspondance et des SHA-256, sans rejouer les trois SQL.

Chaque appel d'application a répondu `success: true`. Après migration 1 : 23 tables publiques, trois privées, RLS partout, aucun accès de table pour `anon/authenticated/PUBLIC`, liaison désactivée, profil conservé. Après migration 2 : 33 fonctions privées, aucun EXECUTE pour `anon/authenticated/PUBLIC`, search_path fixé, cinq triggers de périmètre. Contrôles REST réels après **chacune** de ces deux migrations : administrateur HTTP 403/42501 et anonyme HTTP 401/42501 pour les tables contrôlées ; aucune fenêtre d'accès intermédiaire.

Après migration 3 : 23 politiques administrateur, 20 wrappers RPC publics, aucun EXECUTE `anon/PUBLIC`, aucun accès direct aux tables privées, aucun INSERT/UPDATE/DELETE/TRUNCATE direct des données métier pour `authenticated`. 149 contraintes et 91 index présents. Quatre FKs composites client/émetteur et cinq triggers de rattachement présents. Bucket `logifa-documents` privé, PDF seulement, limite 25 Mio. Bucket `logos` toujours public et ses huit objets préservés. [Preuve de catalogue et historique](../supabase/audit/rollout-2026-10-13.json).

La liaison a été configurée transactionnellement après les trois migrations : sujet administrateur et issuer vérifiés, référence au profil historique retrouvée par son empreinte, refus de remplacer une liaison déjà activée. Les quatre contrôles (`enabled`, sujet, issuer, ancien profil) ont répondu vrai. Aucune modification de la clé primaire ni du contenu du profil.

## Vérifications réelles Supabase

- Les **23 tables publiques** : HTTP 200 avec le véritable jeton administrateur ; HTTP 401/42501 sans session.
- `logifa_workspace` action `health` : HTTP 200, schéma revision 4 ; sans session HTTP 401 ; jeton invalide HTTP 401/PGRST301.
- `logifa_context` : HTTP 200 ; référence historique identique à l'unique profil lisible par l'administrateur.
- Storage objets : administrateur HTTP 200 pour la liste privée vide ; anonyme HTTP 200 avec zéro résultat (comportement de filtrage RLS, pas refus HTTP de l'endpoint). Privacité du bucket vérifiée séparément dans le catalogue SQL.
- Métadonnées du bucket : GET API de gestion HTTP 400 « Bucket not found » pour l'administrateur applicatif. Diagnostic : RLS active sur `storage.buckets`, aucune politique de lecture de métadonnées accordée. L'application utilise les API d'objets, pas `getBucket`. Le premier test exigeait à tort un HTTP 200 sur cette API de gestion ; le test a été corrigé pour distinguer cette restriction des opérations d'objets, **sans élargir les permissions**. Référence : [getBucket et droits requis](https://supabase.com/docs/reference/javascript/storage-getbucket).
- Advisors après application : seulement trois informations RLS sans politiques, sur `admin_binding`, `mail_accounts`, `mail_outbox`. Ces tables privées sont volontairement inaccessibles directement, avec mutations par fonctions contrôlées ; aucun assouplissement appliqué.

Clerk Logifa contient exactement **un compte**, celui de l'administrateur. Aucun autre compte/session existant pour tester le refus d'un autre sujet signé réellement par Clerk. Aucun compte de test créé et aucune simulation déclarée équivalente à ce contrôle réel. Les gardes de sujet/issuer, grants et RLS sont présents ; le test réel d'un second compte reste à compléter dans une recette appropriée.

Le bucket comptable est vide. **Upload, téléchargement privé d'un PDF existant, variante acquittée et SHA lors d'un téléchargement réel ne sont pas validés de bout en bout** sur Supabase. Leur logique est testée localement ; aucune fausse facture, faux paiement ou fichier orphelin créé dans les données réelles. Les quatre FKs et triggers prouvent l'installation du périmètre client/émetteur ; les scénarios financiers et de rattachement sont rejoués sur PostgreSQL isolé, pas au moyen de documents fictifs dans ce projet principal.

## Tests et blocage Next

Succès après application : `typecheck`, `typecheck:billing`, `typecheck:editor`, build Next.js et 93 tests locaux : billing 34, PostgreSQL 24, auth 9, workspace 1, editor 13, navigateur editor 8, navigateur workspace 3, HTTP fail-closed 1. Les 21 empreintes historiques restent conservées. Les moteurs PDF classiques, CSS, logos, prestations et profils locaux ne sont pas modifiés.

La persistance a été activée localement après les contrôles REST, puis un contrôle supplémentaire a démarré un serveur Next de production isolé sur **127.0.0.1 et port éphémère** avec les vraies configurations. Requête visiteur `/api/workspace` : HTTP 401 attendu. Requête administrateur avec le JWT renouvelé passé dans le seul cookie `__session` : **HTTP 401 inattendu**, `REAL_ADMIN_NEXT_API_FAILED`, à 07:58:17 UTC. Aucune mutation métier effectuée.

Le même jeton est accepté directement par Supabase, donc ce résultat ne remet pas en cause la réussite de l'intégration native. Il ne démontre pas non plus que le parcours de connexion normal dans le navigateur échoue : le test HTTP ne reproduit pas le contexte complet du client Clerk, ses cookies de développement ni la connexion interactive, et la cause précise de son refus par Next n'a pas été établie. **Il ne fournit pas la preuve attendue du parcours applicatif complet.** Aucune modification ou désactivation des protections Clerk pour faire passer le test.

Conformément à la consigne d'arrêt en cas d'échec d'authentification, aucun nouveau test d'authentification ni développement métier après ce résultat. `LOGIFA_PERSISTENCE_ENABLED` a été remis à **false** ; les migrations et la liaison ne sont pas annulées. Les tables et le profil sont préservés. Les tests de pages suivants du harnais n'ont pas été exécutés après le premier refus. [Script du contrôle](../scripts/check-logifa-http.mjs) ; rapport expurgé local : `tmp/raccordement/live-next.json`.

État des données vérifié après application avant le test Next : un profil, zéro émetteur/client/devis/facture/paiement/fichier comptable et huit logos. Pas de numéros de facture consommés, pas de fausse facture définitive, pas d'e-mail, pas d'appel OpenAI payant. Aucun accès CODE-V OS et aucun push.

## Reprise et configuration restante

1. Diagnostiquer le refus Next avec le **parcours normal de connexion Clerk** de l'administrateur sur l'adresse locale habituelle ; distinguer le transport du harnais HTTP de la connexion navigateur. Ne pas affaiblir le proxy ou `requireAdmin`, ni fabriquer de rôle applicatif ou utiliser service_role.
2. Après succès réel de la garde et des services Next/Supabase, réactiver la persistance et redémarrer Next. L'autorisation des migrations et de la liaison a déjà été consommée : ne jamais les rejouer pour corriger un problème de cookie.
3. Compléter les tests réels avec un compte Clerk non autorisé et dans un environnement financier/Storage isolé approuvé ; ne pas créer de documents fiscaux de test dans les données réelles.
4. Qualifier/importer les vrais émetteurs, entités juridiques, mentions TVA, séries et fiches clients avant toute émission. Aucun import ou rattachement juridique automatique effectué ici.
5. Renseigner `LOGIFA_EMAIL_ENCRYPTION_KEY` et les paramètres propres à chacun des comptes Resend ; garder `LOGIFA_EMAIL_ENABLED=false` jusqu'à accord et recette. Renseigner `OPENAI_API_KEY`/`OPENAI_MODEL` uniquement pour une activation approuvée ; les deux drapeaux OpenAI restent false. Inscription publique Clerk à confirmer séparément.

Pour démarrer localement : `npm run dev`, ouvrir l'URL indiquée, se connecter par l'interface Clerk Logifa. L'édition manuelle reste disponible pour l'administrateur normalement connecté ; la persistance est actuellement désactivée par précaution. Ce rapport **ne certifie pas une mise en service complète**.
