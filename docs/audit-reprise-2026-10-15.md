# Audit de reprise — 15 octobre 2026

Base de code : `7efcf641d58a8658a724305be0f2d05ec3ffc87b`, master.

## Constats vérifiés

- Les cinq derniers jobs GitHub Actions sont réussis. Leur couverture se limite à TypeScript et aux dix tests billing présents.
- TypeScript strict, dix tests billing et build Next.js exécutés avec succès localement avant modifications.
- Supabase Logifa uniquement : 17 migrations appliquées ; 23 tables publiques avec RLS activée. Cela ne prouve pas à lui seul les permissions JWT/RPC/Storage.
- Séquence réelle Couverture Catalane : next_value 4419, dernière date 2026-09-30 ; identité reviewed=true. Aucune modification de séquence effectuée. Les anciens rapports décrivent un état antérieur.
- Les trois migrations de socle et plusieurs scripts/tests cités par package.json sont absents du dépôt. La présence de fonctions en production ne rend pas une reconstruction locale reproductible.
- Formulaires légaux : quatre zones JSON exposées. Préservation des clés historiques nécessaire pour les remplacer.
- PDF émis : le GET reconstruit des pages alors qu'un original archivé peut exister. La variante acquittée est également reconstruite ; elle doit conserver les pages fiscales originales.
- E-mail : le contexte de modèle lit `number` au lieu de `invoice_number`.
- Chargement espace : sept tables plafonnées à 500 lignes, puis fichiers/événements/soldes. Pas de véritable pagination serveur.
- Quotas OpenAI uniquement en mémoire ; non fiables entre instances. Aucun appel payant réalisé.

## Limites d'accès

Le connecteur Vercel liste Logifa mais refuse la lecture des déploiements de son équipe (403). Git et npm fonctionnent avec l'accès réseau explicite de l'exécuteur. Aucun secret applicatif Clerk, Resend ou OpenAI n'est disponible localement. Aucun e-mail, paiement ni émission fiscale de test en production.

## Lot interface fiscale

Champs adresse et coordonnées ordinaires, assurance à imprimer et mentions lisibles. Les clés inconnues et contrats d'assurance existants sont conservés. Les adresses complémentaires clients restent conservées sans éditeur JSON. Le code postal/ville est séparé de la rue. Erreurs affichées dans le formulaire.

Validation : TypeScript et deux tests de préservation des données du formulaire. Recette authentifiée réelle encore à effectuer.
