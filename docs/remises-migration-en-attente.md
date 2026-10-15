# Remises explicites — migration en attente d'accord

Fichier à relire : `supabase/migrations/20261015154816_logifa_explicit_discount_lines.sql`.

La revue automatique a refusé l'application en production : elle demande une autorisation explicite pour remplacer la fonction financière `logifa_private.api_save_document(text, uuid, jsonb)`. La question d'autorisation est en attente. **Cette migration n'a pas été appliquée à Supabase.** Sa publication dans Git ne l'applique pas : les workflows du dépôt n'exécutent aucune migration distante.

Delta préparé à partir de la définition réellement lue en production :

- Autoriser un prix unitaire négatif explicite sur une ligne de préparation.
- Conserver les quantités positives, la précision à deux décimales et les bornes des montants.
- Refuser une base HT ou une TVA agrégée négative pour un taux : une remise doit réduire une base du même taux, sans la dépasser.
- Conserver la garde administrateur, les contrôles d'entreprise/client, les références de devis/chantier, les contraintes et le verrouillage des documents déjà émis.
- Ne modifier aucune ligne financière existante, aucun numéro et aucune séquence. Aucun paiement, e-mail ou document fiscal n'est émis par ce SQL.

La recette SQL isolée vérifie les remises de même taux, les refus d'un taux sans base et les remises excessives, puis rejoue acomptes/finale/paiements/avoirs. Les adaptations d'éditeur et d'extraction PDF sont préparées localement ; leur livraison reste suspendue à l'accord et à la vérification de la migration. La version applicative publiée continue de refuser les prix négatifs.

Avant application : relire le delta et revérifier que la définition de production n'a pas changé. Après application : vérifier le catalogue et les privilèges, sans utiliser de fausse facture en production. La validation métier des remises et des mentions fiscales reste nécessaire.
