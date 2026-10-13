# LOGIFA — lot 2 : authentification privée

## Installation locale

Branche : `develop/logifa`. Clerk `@clerk/nextjs` 7.9.14 et `server-only` 0.0.1 sont installés avec versions exactes.
Clerk déclare une compatibilité avec Next.js 16 et React 19.2.3 ; Node >= 20.9 est requis.

Next.js a été mis à jour de 16.1.6 à 16.4.0 dans le cadre de la protection privée : l'audit npm de 16.1.6 signalait notamment des contournements du middleware/proxy et des exécutions distantes non authentifiées. Aucun `npm audit fix` global n'a été appliqué.
React, React DOM, jsPDF, AutoTable et html2canvas restent aux versions du lot 1. Huit entrées du lockfile (React, React DOM, jsPDF, AutoTable, html2canvas, DOMPurify, fflate et canvg) ont été comparées à `b16c718` : identiques.

## Variables nécessaires

Créer localement `.env.local` en utilisant `.env.example`. Ce fichier est ignoré par Git ; ne pas publier ou communiquer ses valeurs.

| Variable | Portée | Valeur à renseigner localement |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Publique, navigateur | Clé publiable de la nouvelle instance LOGIFA |
| `CLERK_SECRET_KEY` | Serveur uniquement | Clé secrète de la même instance |
| `LOGIFA_ADMIN_CLERK_USER_ID` | Serveur uniquement | Identifiant Clerk `user_...` du seul administrateur |

Aucune autre variable Clerk n'est nécessaire : la connexion, la déconnexion et les destinations sont fixées dans le code à `/sign-in` et `/`.
L'identifiant administrateur ne doit jamais être préfixé par `NEXT_PUBLIC_` ni envoyé comme prop client.
La clé publiable est conçue pour être publique ; aucune clé secrète n'est transmise aux composants client.
Après modification des variables, redémarrer le serveur. Après changement de clé publiable, reconstruire le build de production.

## Configuration à effectuer dans Clerk

1. Créer une **nouvelle application Clerk dédiée à LOGIFA** dans le tableau de bord. Ne pas sélectionner l'instance CODE-V OS et ne pas en copier les clés.
2. Dans **Access mode**, sélectionner **Invite-only** et enregistrer. Le mode API correspondant est `restricted`. Ne pas utiliser le mode Open ni laisser d'invitations publiques.
3. Dans **Users**, créer manuellement votre seul compte, avec une méthode de connexion activée pour cette instance. Ne créer aucun utilisateur pour les entreprises émettrices. Il est aussi possible d'utiliser une invitation personnelle unique, puis de supprimer les invitations restantes.
4. Copier l'identifiant `user_...` de ce compte dans `LOGIFA_ADMIN_CLERK_USER_ID`, exclusivement côté serveur.
5. Copier les deux clés de **API keys** de cette même instance dans `.env.local`, sans les enregistrer dans Git. Ne pas mélanger clés de développement et de production.
6. Ne pas activer les organisations Clerk. Aucune table de rôles, liste de comptes autorisés ou logique multi-utilisateurs n'est utilisée.
7. Pour une éventuelle instance de production, reproduire le mode Invite-only, créer votre compte dans cette instance, configurer ses domaines selon Clerk et utiliser son identifiant propre. Ne pas supposer que l'ID de développement est identique.
8. Exécuter la recette réelle ci-dessous avant de considérer l'accès privé opérationnel.

Le composant de connexion masque l'inscription avec `withSignUp={false}` et aucune route SignUp n'est créée. **La désactivation effective de l'inscription publique dépend aussi du réglage Invite-only dans Clerk** ; le masquage visuel seul ne suffit pas.
Même si un autre compte existait dans Clerk, la comparaison stricte de son ID à l'ID serveur lui interdit l'application.
La configuration du tableau de bord n'a pas été effectuée par ce lot, qui reste exclusivement local.

Documentation officielle consultée :

- [Next.js Quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart)
- [clerkMiddleware](https://clerk.com/docs/reference/nextjs/clerk-middleware)
- [Access mode et restrictions](https://clerk.com/docs/guides/secure/restricting-access)

## Protections appliquées

- `proxy.js` (nom Next.js 16) protège toutes les routes par défaut, y compris `/`, `/devis`, `/facture`, les futures API, les requêtes RSC, les méthodes POST et les chemins contenant une extension.
- Seuls GET/HEAD de `/sign-in` et de ses sous-chemins Clerk, `/access-denied`, `/logo2.png` et `/favicon.ico` sont publics. Les fichiers techniques Next `_next/static/`, `_next/image` et `_next/webpack-hmr` restent accessibles au runtime. Ils ne doivent contenir aucun secret. Les bundles JavaScript de l'application restent des ressources navigateur publiques, comme dans toute application Next ; l'authentification ne transforme pas le code client existant en coffre de données.
- Sans clé publiable, clé secrète ou ID administrateur, les routes protégées renvoient **503**, sans appeler Clerk. L'écran de connexion montre une indisponibilité générique. Aucune création d'instance Clerk en mode keyless n'est déclenchée volontairement.
- Avec configuration, un visiteur est redirigé vers `/sign-in`. Un compte différent est redirigé vers `/access-denied`, sans afficher les éditeurs. Les API reçoivent **401** ou **403** en JSON ; les requêtes non GET/HEAD sont refusées avec le même statut, sans redirection.
- Seuls les jetons de session Clerk sont acceptés. Une session non authentifiée ou en attente ne donne pas accès même si un ID est présent.
- `requireAdmin()` vérifie la session côté serveur et compare l'ID à la variable serveur. Le contrôle ne repose sur aucun email, rôle client, paramètre de requête ou métadonnée utilisateur.
- `/` appelle une garde serveur ; les layouts ajoutés à `/devis` et `/facture` appellent la même garde sans modifier les pages des éditeurs.
- Le layout racine force le rendu dynamique : aucune décision d'autorisation n'est figée pendant le build. Le proxy ajoute `Cache-Control: private, no-store` aux réponses sensibles.
- Les destinations de connexion et déconnexion sont fixes. Les paramètres `redirect_url`/`returnTo` ne pilotent aucune redirection du code LOGIFA.
- Le composant `ClerkProvider` reçoit seulement des chemins publics, jamais l'ID administrateur ou la clé secrète. Les modules de configuration et de garde utilisent `server-only`.
- Un bouton de déconnexion est disponible dans la navigation administrateur et sur l'écran de refus pour un autre compte connecté.
- Le proxy frontend Clerk automatique est explicitement désactivé ; aucune exemption `/__clerk` ne contourne notre politique.

## Obligations pour les futures API et actions serveur

Chaque opération sensible doit refaire le contrôle au point d'entrée, même si le proxy la protège déjà. Aucun endpoint de données métier n'est ajouté dans ce lot.

Exemple de route API :

```js
import { withAdminApi } from '@/lib/auth/require-admin';

export const GET = withAdminApi(async () => {
  return Response.json({ ok: true });
});
```

Exemple d'action serveur :

```js
'use server';
import { requireAdmin } from '@/lib/auth/require-admin';

export async function enregistrerDocument(input) {
  await requireAdmin(); // avant toute lecture ou écriture sensible
  // Valider input, puis effectuer l'opération.
}
```

`withAdminApi` convertit les refus en 401/403/503 avec no-store ; les erreurs inattendues ne donnent jamais accès au handler.

## Tests effectués

| Vérification | Résultat |
| --- | --- |
| `npm run test:auth` | 9 tests réussis : proxy réel et gardes réelles, sessions Clerk simulées |
| Visiteur, autre compte, administrateur | Décisions testées sur les trois routes |
| Déconnexion et session en attente | Accès refusé après retrait de la session dans les tests |
| Configuration absente | Refus 503 sans appel Clerk |
| API et actions | 401/403, handler/mutation non exécuté en cas de refus |
| Matcher Next et redirections | Chemins à extension protégés ; destinations fixes ; POST public refusé |
| `npm run test:auth:http` | 1 test réussi sur le serveur Next de production réel, configuration vide |
| Requêtes HTTP privées / API / RSC | 503, absence de fuite et no-store ; en-tête middleware de contournement sans effet |
| `npm run build` | Réussi sous Next.js 16.4.0 ; toutes les pages applicatives dynamiques |
| `npm run test:baseline` | 21 empreintes inchangées ; six fixtures cohérentes ; neuf logos émetteurs présents |
| Profils et catalogue | Diff Git vide pour `app/company.js` et `app/prestations.js` |

Les tests de session remplacent uniquement la vérification Clerk et les exceptions de navigation. Ils ne prouvent pas la vérification cryptographique du SDK ni le parcours de connexion réel. Le test HTTP ne simule aucune session authentifiée ; il vérifie le fonctionnement fail-closed du serveur construit.
Les tests utilisent Node 22 et le drapeau `--experimental-vm-modules`, sans ajouter de dépendance de test.

## Recette réelle restant à effectuer après configuration

1. En navigation privée, demander `/`, `/devis`, `/facture` : écran de connexion, aucun éditeur accessible.
2. Se connecter avec votre compte autorisé : les trois routes fonctionnent ; vérifier les champs et exports habituels.
3. Cliquer Se déconnecter ; demander de nouveau les trois URL et recharger : connexion exigée.
4. Sur une instance de développement isolée, vérifier un compte non autorisé : accès refusé et déconnexion disponible. Ne pas ouvrir l'inscription publique pour réaliser ce test.
5. Si nécessaire, tester les futures API avec les deux sessions en reprenant les statuts attendus 401/403. Il n'existe actuellement aucune API métier.
6. Retirer temporairement l'ID serveur, redémarrer, vérifier le refus 503, puis rétablir la configuration.

**Blocage actuel : aucune instance Clerk LOGIFA ni clé de session réelle n'a été configurée.** Le parcours réel de connexion/déconnexion et le réglage Invite-only restent à confirmer dans votre tableau de bord. L'application reste fermée par défaut.

## Alertes de dépendances résiduelles

Après mise à jour Next, `npm audit` signale quatre paquets : jsPDF (critique), DOMPurify (modéré), fflate (modéré) et baseline-browser-mapping (modéré). Aucune alerte Next ou Clerk n'est signalée par cet audit.
Les alertes jsPDF concernent notamment FreeText et les sorties en nouvelle fenêtre ; les générateurs actuels utilisent tableaux/textes et `pdf.save`, sans ces appels trouvés. Cela ne constitue pas une garantie d'absence de risque.
Les bibliothèques PDF sont conservées conformément à la contrainte absolue du lot. Une mise à jour doit être traitée séparément avec validation du rendu ; elle n'a pas été appliquée silencieusement.

## Fichiers du lot

Modifiés : `.gitignore`, `package.json`, `package-lock.json`, `app/layout.js`, `app/page.js`, `components/Header/Header.jsx`.

Ajoutés : `.env.example`, `proxy.js`, `lib/auth/config.js`, `lib/auth/policy.mjs`, `lib/auth/require-admin.js`, `app/devis/layout.js`, `app/facture/layout.js`, `app/sign-in/[[...sign-in]]/page.js`, `app/access-denied/page.js`, `components/Auth/SignOut.jsx`, `components/Auth/auth.module.css`, `tests/auth/access.test.mjs`, `tests/auth/http-failclosed.test.mjs` et ce document.

Les éditeurs, générateurs, CSS existants, images, profils, prestations et README sont inchangés. Aucun Supabase/OpenAI, aucune migration, aucun push ; `master` reste sur `f35906f`.
