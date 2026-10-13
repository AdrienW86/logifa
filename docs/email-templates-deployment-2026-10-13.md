# Déploiement des modèles d’e-mails — 13 octobre 2026

La seule migration autorisée `20261013125833_logifa_email_templates.sql` a été
appliquée au projet LOGIFA `bniitcbsaowwzkjdrqwz`. Version enregistrée côté
Supabase : `20261013143540`, nom `logifa_email_templates`.
Empreinte SHA-256 du SQL appliqué :
`ea94e0e8e93625b10ed8e93122deac9c1984d7379601477055c9bc2bd87f5a23`.

Contrôles effectués : trois tables et RPC installées, RLS activée, aucun droit
direct anon/authenticated sur les nouvelles tables privées, ancienne fonction
mail inaccessible aux rôles API, index de modèle par défaut et déclencheurs
d’immutabilité présents. La migration notifie PostgREST ; les appels réels
suivants ont répondu HTTP 200 sans rechargement supplémentaire.

Avec une véritable session navigateur administrateur : création de
« Devis — Couverture Catalane », lecture, modification et nouvelle lecture après
rechargement de la page réussies. Modèle `f18cf6a4-6b12-4994-a490-3c603b2c5c05`,
révision 2, deux versions conservées. Un autre périmètre d’émetteur ne le trouve
ni dans sa liste ni dans son historique ; une mutation sous ce périmètre est
refusée avec `LOGIFA_TEMPLATE_SCOPE`. Cela teste l’isolation des opérations
applicatives pour l’administrateur, pas une session d’un autre utilisateur Clerk.

Les nombres de clients, devis, factures, comptes e-mail et envois sont restés
inchangés. Aucun e-mail envoyé ; aucun document fiscal créé ; aucun modèle
préexistant modifié ou supprimé. Les trois migrations initiales restent présentes.

Résultat détaillé local ignoré par Git :
`tmp/email-template-preflight/live-result.json`. Le dernier contrôle HTTP
anonyme supplémentaire n’a pas été exécuté : la revue automatique d’autorisation
a atteint sa limite d’utilisation. Les vérifications SQL de permissions et RLS
et les opérations navigateur ci-dessus avaient déjà été réalisées avec succès.
