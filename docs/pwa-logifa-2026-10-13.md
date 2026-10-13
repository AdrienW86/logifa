# LOGIFA — PWA, installation et recette locale

## Livraison

La PWA s'intègre à l'application existante, sans dépendance supplémentaire. `app/manifest.ts` utilise le mécanisme natif [Next.js App Router](https://nextjs.org/docs/app/guides/progressive-web-apps). Le mode demandé est `standalone`, avec nom LOGIFA, thème vert, icônes 192/512, maskable et Apple Touch Icon dérivées du logo officiel conservé intact. Deux images de lancement iOS couvrent les écrans portrait 390 × 844 et 428 × 926 à densité 3 ; les autres formats utilisent le comportement de leur plateforme.

`app/sw.js/route.ts` sert le worker sans cache HTTP, avec une version issue du code et du BUILD_ID. Son fichier source est inclus dans le traçage Next pour le déploiement. Les ressources applicatives Next restent servies par le réseau ; aucune ancienne version de JavaScript applicatif n'est conservée par le worker. Une mise à jour attend une action explicite, avec avertissement d'enregistrer/exporter les modifications avant rechargement.

## Installation

- iPhone/iPad : ouvrir l'adresse HTTPS dans Safari, Partager, « Sur l'écran d'accueil ». Une aide apparaît dans LOGIFA lorsqu'il ne fonctionne pas déjà en standalone.
- Android : ouvrir dans un navigateur compatible ; utiliser « Installer LOGIFA » quand le navigateur autorise réellement cette invite, ou son menu d'installation.
- Windows/macOS : Chrome ou Edge, bouton d'installation de la barre d'adresse ou menu Applications. Le bouton de LOGIFA apparaît uniquement après un véritable événement `beforeinstallprompt`. Sur Safari macOS compatible, utiliser l'ajout au Dock proposé par Safari.

Le serveur de production doit servir HTTPS, `/manifest.webmanifest`, `/sw.js` et `/pwa/*` sans redirection vers Clerk. `localhost` constitue l'exception de développement ; une adresse IP distante servie en HTTP n'est pas une cible de recette PWA valide. Après installation, fermer puis rouvrir l'application et vérifier la connexion, le téléchargement PDF et le retour après verrouillage de l'appareil. Les capacités d'installation dépendent du navigateur.

## Réseau et confidentialité

Le worker ne conserve que cinq ressources publiques : page hors ligne neutre et quatre icônes. Il n'intercepte ni les routes Clerk, ni les API, ni les requêtes avec Authorization, ni les mutations. Les pages privées ne sont jamais enregistrées : en cas de navigation sans réseau, seule la page neutre est proposée. Un refus HTTP d'authentification reste un refus, sans remplacement par une copie privée.

La bannière indique la perte de réseau et le retour de connexion. Les opérations non confirmées doivent être réessayées explicitement ; aucune file de mutations, synchronisation financière ou émission hors ligne n'est créée. Les confirmations Supabase et contrôles serveur existants restent nécessaires.

La frontière de session masque le contenu privé lorsque Clerk n'est pas chargé ou indique une déconnexion. La restauration depuis le cache d'historique navigateur force une nouvelle navigation serveur en masquant le contenu précédent. Les contrôles administrateur côté serveur et RLS restent inchangés. L'expiration et la révocation restent soumises aux délais de validité des jetons des fournisseurs : la PWA ne promet pas une révocation instantanée supplémentaire.

Les brouillons locaux préexistants de l'éditeur, indexés par utilisateur, sont conservés pour ne pas supprimer une fonctionnalité ou des données. Ils ne constituent pas un stockage hors ligne chiffré. Aucune garantie contre un accès aux fichiers du profil navigateur d'un appareil partagé n'est ajoutée : protéger le compte système et utiliser un profil dédié. Un stockage local chiffré avec suppression à la déconnexion et récupération contrôlée nécessiterait une évolution distincte, sans perte des brouillons.

## Recette et limites

Les preuves sont conservées localement sous `tmp/pwa-final-*.log` et les captures de la page hors ligne sous `tmp/pwa/`. Les tests Chromium utilisent Edge réel en mode headless avec fenêtres 1440 et 390 pixels. Ils vérifient le manifeste, les icônes, le worker réellement installé, le cache limité aux cinq chemins, une API anonyme refusée, une réponse privée fictive exclue du cache, les mutations hors ligne refusées, la page neutre sans débordement et la réouverture d'un onglet contrôlé par le worker.

Le test d'interface utilise React réel dans Chromium avec Clerk simulé explicitement : absence de faux bouton, invite disponible, perte/retour du réseau et redirection après perte de session. Le test de mise à jour utilise le code du worker dans un environnement simulé : activation explicite et suppression limitée aux anciens caches LOGIFA. Ces tests ne démontrent ni une installation système réelle, ni une session fournisseur, ni un déploiement HTTPS réel.

Un second test de mise à jour installe réellement deux versions du même worker dans Chromium, sur un serveur HTTP local de recette : la seconde attend sans recharger la page, l'activation explicite change le contrôleur et seul l'ancien cache LOGIFA disparaît. Ce serveur représente deux versions successives du worker ; il ne constitue pas un déploiement de production. Les métadonnées HTML et le manifeste sont aussi contrôlés par Chromium/CDP dans Next.js avec Clerk absent et API maintenue fermée (503), pour éviter une dépendance externe dans ce contrôle.

Résultat final local : **112 tests réussis** (105 existants et 7 PWA), trois contrôles TypeScript strict, build Next.js réussi, 21 empreintes préservées et références PDF vérifiées. Le traçage du build contient bien `lib/pwa/worker.js`. Les deux tailles de fenêtre et les fixtures restent des tests Chromium, pas des essais iOS/Android physiques.

Nouvelle recette administrateur PWA : le contrôleur de l'ancienne fenêtre était fermé ; Edge de recette a été rouvert avec son profil existant, sans export de session. Le contrôle a retourné `HUMAN_ADMIN_LOGIN_REQUIRED`. Une connexion humaine est demandée ; ce résultat n'est pas interprété comme un HTTP 401 applicatif ni comme une régression de l'intégration. La connexion PWA réelle renouvelée, l'expiration et la révocation ne sont donc pas revalidées dans ce lot. Les délais fournisseurs observés lors de la précédente recette restent consignés dans le rapport de finalisation.

Les suites existantes conservent la recette locale PostgreSQL, les contrôles de sécurité, les parcours desktop/mobile des éditeurs et de gestion avec API simulées, les téléchargements et équivalences PDF. Les 21 empreintes historiques demeurent intactes. Les générateurs PDF classiques, migrations, données métier, anciens CSS et logos ne sont pas modifiés.

À effectuer sur les appareils et le déploiement cibles : installation/réouverture standalone iOS et Android réels, clavier virtuel, safe areas, PDF et partage natifs, changement de version entre deux déploiements, déconnexion puis bouton Retour et expiration/révocation avec fournisseurs réels. Les validations antérieures Clerk–Supabase sont décrites dans [le rapport de finalisation](finalisation-autonome-2026-10-13.md) ; elles ne sont pas présentées comme une nouvelle recette PWA.

La PWA ne lève pas les conditions documentaires restantes de ce rapport : migrations additives non appliquées et recette Storage réelle isolée à compléter. Aucune branche Supabase payante, migration distante, facture fictive réelle, livraison e-mail, appel OpenAI ou push n'est effectué pour ce lot.
