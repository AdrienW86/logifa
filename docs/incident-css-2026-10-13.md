# LOGIFA — incident CSS après redémarrage

## Cause observée avant modification

Deux serveurs Next.js Logifa occupaient le port 3000 sur des adresses distinctes :

- Ancien `next start --hostname localhost --port 3000`, PID 39840, lancé à 14:14, écoutant `::1:3000`.
- `next dev`, PID 21036 et serveur enfant 43968, lancé à 15:40, écoutant `:::3000`.

Une requête Node directe, sans navigateur ni service worker, à `http://localhost:3000/sign-in` recevait le HTML de production. Parmi ses ressources référencées, `/_next/static/chunks/0p6ww9421rv-5.css`, `2d41vvv3i_2df.js` et `225wurt4iypdk.js` répondaient **404**. L'autre feuille CSS répondait 200. À `127.0.0.1:3000`, la réponse présentait des ressources de développement, toutes disponibles. Le nom d'hôte déterminait donc quel serveur et quelle version de ressources étaient utilisés.

Le défaut est un ancien serveur de production conservé en parallèle du serveur de développement, avec des références de ressources générées devenues indisponibles. Ce diagnostic ne repose pas sur une impression de navigateur : les 404 sont reproduits par HTTP sans service worker. Il n'est pas nécessaire d'altérer la stratégie de cache PWA pour corriger cet incident.

Le worker actuel exclut explicitement `/_next/`, les API et l'authentification. Son Cache Storage ne contient que la page neutre hors ligne et quatre icônes publiques. La stratégie réseau des pages ne stocke aucun HTML privé, CSS ou JavaScript applicatif. Les imports de `app/globals.css`, des modules CSS et de `components/Pwa/global.css` sont présents. Le projet utilise CSS/CSS Modules ; aucun Tailwind ni configuration PostCSS/Tailwind n'a été retiré ou remplacé.

## Correction effectuée

Les seuls processus Next.js Logifa identifiés ont été arrêtés. Le dossier généré `.next` a été déplacé vers `tmp/css-recovery/generated-next-before`, après vérification des chemins absolus dans le workspace, sans écraser une sauvegarde. Aucun fichier métier, secret, style, logo, composant visuel ou générateur PDF n'a été supprimé ou modifié.

Un lancement temporaire lié uniquement à `127.0.0.1` a ensuite provoqué des erreurs d'auto-proxy Next vers `localhost` et des timeouts. Il a été arrêté, puis remplacé par une seule instance `next dev --hostname localhost --port 3000`. Ce lancement canonique fonctionne ; une seule écoute `::1:3000` est confirmée. Ne pas utiliser cet essai IPv4 comme preuve d'une panne Clerk ou d'une nouvelle erreur de CSS.

Le serveur reconstruit sert le développement depuis `.next/dev`. Le build de contrôle utilise séparément `tmp/next-recipe-build`, sans remplacer les ressources du serveur actif. Ne pas laisser un `next start` utilisant ce dossier de vérification pendant sa reconstruction.

Next.js a généré `AGENTS.md` au démarrage. Ce fichier d'instructions est conservé et documenté ; il ne modifie pas le rendu applicatif. La seule modification du code de recette est l'ajout de contrôles CSS et Cache Storage à `scripts/browser-recipes/smoke.mjs`, pour qu'un parcours authentifié ne soit plus déclaré réussi avec des feuilles CSS manquantes.

## Vérification réelle

Le profil Edge normal de recette a retrouvé sa session administrateur légitime, sans export, transfert ou injection de jeton. Navigation puis rechargement réussis sur `/`, `/devis`, `/facture`, `/gestion/clients` et `/gestion/entreprises`. Pour chaque page, les feuilles CSS déclarées répondent **200**, leur Content-Type est CSS et `link.sheet` confirme leur chargement. Les styles calculés du corps, du titre et de la zone principale sont relevés dans le rapport local. Les API de session et de persistance restent 200 ; les requêtes ont été en lecture seule, sans création de données.

Cache Storage du profil normal contrôlé : uniquement les cinq chemins publics autorisés, aucun CSS Next ni document privé. Une mise à jour en attente du worker ne peut donc pas servir une ancienne feuille CSS dans ce cas.

Dans un véritable contexte Chromium privé sans session, `/sign-in` est correctement stylée : CSS 200, aucune erreur de chunk Next, titre 28 px, carte avec arrondi 16 px. Après chargement de Clerk, le formulaire apparaît aussi ; la capture publique est conservée sous `tmp/css-recovery/private-signin.png`. Le contexte privé reste non autorisé pour les pages et API protégées. La comparaison normal/privé tient compte de cette différence légitime d'authentification ; aucun contrôle serveur n'a été désactivé pour afficher les pages privées.

Trois contrôles TypeScript strict, build Next.js, sept tests PWA et contrôle des **21 références historiques** réussis. Les preuves restent sous `tmp/css-recovery/` et `tmp/browser-recipe/`, exclus de Git. Les modifications et secrets locaux sont préservés. Aucun push, appel OpenAI, envoi e-mail ou migration distante.

## Éviter la récidive

Utiliser une seule instance Logifa sur le port 3000 et ouvrir `http://localhost:3000`. Avant de passer de `next start` à `next dev`, arrêter l'ancienne instance. Ne pas reconstruire le dossier consommé par un serveur de production déjà lancé : arrêter, construire, puis redémarrer avec les mêmes fichiers générés. Conserver les builds de vérification isolés du serveur utilisé dans le navigateur.

Si un onglet conserve une ancienne page après le redémarrage, le recharger. Supprimer des caches privés, des brouillons locaux ou des cookies Clerk n'a pas été nécessaire pour cette correction.
