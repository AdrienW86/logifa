# Remises explicites — migration appliquée

Fichier à relire : `supabase/migrations/20261015213039_logifa_explicit_discount_lines.sql`.

Migration appliquée le 15 octobre 2026 après accord explicite de l’utilisateur. Supabase l’enregistre sous la version `20261015213039`. Le catalogue confirme la garde des remises et celle des documents en préparation ; les privilèges restent fermés à `anon` et accessibles à `authenticated`, avec contrôle administrateur dans la fonction. Aucun document fiscal, paiement ou e-mail de test n’a été créé en production.

Delta préparé à partir de la définition réellement lue en production :

- Autoriser un prix unitaire négatif explicite sur une ligne de préparation.
- Conserver les quantités positives, la précision à deux décimales et les bornes des montants.
- Refuser une base HT ou une TVA agrégée négative pour un taux : une remise doit réduire une base du même taux, sans la dépasser.
- Conserver la garde administrateur, les contrôles d'entreprise/client, les références de devis/chantier, les contraintes et le verrouillage des documents déjà émis.
- Ne modifier aucune ligne financière existante, aucun numéro et aucune séquence. Aucun paiement, e-mail ou document fiscal n'est émis par ce SQL.

La recette SQL isolée vérifie les remises de même taux, les refus d’un taux sans base et les remises excessives, puis rejoue acomptes/finale/paiements/avoirs. Les adaptations de l’éditeur et de l’extraction PDF accompagnent cette livraison : prix négatifs explicites, arrondis signés au centime et contrôle de chaque taux de TVA.

La vérification de production porte sur le catalogue et les privilèges, sans fausse facture. La validation métier des remises et des mentions fiscales reste nécessaire.
