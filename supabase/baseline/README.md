# Socle appliqué restauré depuis l'historique Supabase

Ces quatre fichiers sont les statements des migrations réellement appliquées dans Logifa le 13 octobre 2026, récupérés en lecture seule le 15 octobre. Ils ne contiennent ni données clients, ni liaison administrateur réelle, ni secrets. Ils ont été relus avant ajout au dépôt public.

Ils résident hors de `migrations/` pour éviter toute réapplication en production. Ne pas les exécuter sur une base existante. Ils servent à reconstruire le socle dans les tests avec un schéma historique synthétique.

`tests/postgres/current-issuance.sql` reproduit la fonction d'émission réellement déployée au moment de l'audit, avec une table de dépendance vide. Les cinq migrations de `supabase/migrations` complètent ce socle. Cela ne constitue pas un dump exhaustif du service Supabase : Auth, Storage HTTP, catalogue tarifaire privé et changements de données historiques ne sont pas reproduits.

Recette : `node --test tests/postgres/recipe.test.mjs`. Aucun accès réseau ou secret de production requis. Les appels parallèles PGlite sont sérialisés par son unique connexion ; un véritable test de concurrence entre sessions PostgreSQL reste nécessaire.
