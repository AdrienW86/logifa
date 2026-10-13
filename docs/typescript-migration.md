# Migration TypeScript contrôlée — LOGIFA

Branche locale : `develop/logifa`. Référence de départ : `086a6c9` (refonte UX livrée). Aucun push ni migration distante.

## Phases et périmètre

1. `561436f` : configuration Next.js stricte et contrats partagés ; migration de `app/company.js` et `app/prestations.js` en `.ts`. Le test compare les valeurs JSON, leur ordre et les identifiants à la référence Git locale, sans recopier les coordonnées métier dans une fixture. Les neuf profils restent distincts, notamment les deux identifiants 6 et les deux identifiants 7. Le plan d’import conserve ses empreintes et ses clés de position.
2. `f4361c3` : pages/layouts en TSX, Header et déconnexion, configuration/politique/gardes Clerk et `proxy.ts`. Les tests exécutent les modules TypeScript réels après effacement des types. Le garde API conserve les arguments typés du gestionnaire ; les accès restent contrôlés côté serveur et refusés lorsque l’administrateur manque.
3. Contrats d’éditeur et de propositions IA centralisés ; validation structurelle de données `unknown`, puis validation métier existante. Les titres proposés sans champs numériques sont normalisés comme les titres manuels et peuvent être restaurés. Interfaces strictes des deux moteurs PDF JavaScript et références PDF déterministes.

Tous les fichiers applicatifs de `app`, `components` et `lib` sont désormais TypeScript/TSX. Les seuls fichiers applicatifs JavaScript restants sont `utils/generatePdf.js` et `utils/generateFacture.js`, volontairement inchangés. Les scripts de test/outillage et `next.config.mjs` restent des scripts JavaScript. Cette livraison ne prétend donc pas atteindre 100 % TypeScript.

## Contrats et compilation

`tsconfig.json` remplace `jsconfig.json` : `strict: true`, `noEmit`, résolution Bundler, plugin Next.js, chemins `@/*`, vérification des pages/types générés par Next. Les configurations ciblées de l’éditeur et de la facturation restent strictes. `allowJs` et `checkJs: false` permettent uniquement la coexistence avec les moteurs PDF conservés ; leurs déclarations `.d.ts` imposent le contrat aux appelants TypeScript. Les dépendances tierces ne sont pas vérifiées (`skipLibCheck`).

`types/editor.ts` décrit entreprises locales, catalogue, client du formulaire, lignes à valeurs textuelles, lignes numériques PDF, brouillons, acomptes déclarés, notes de règlements et propositions IA. `types/billing.ts` reste la référence du serveur : UUID, entités juridiques/profils, clients, documents, TVA, paiements et archivage. Les montants serveur décimaux et centimes bigint ne sont pas remplacés par les flottants historiques du PDF. Le client du formulaire et le client persistant constituent des contrats distincts.

`lib/editor/contracts.ts` vérifie la structure avant toute utilisation typée. Le modèle impose ensuite les champs autorisés, les montants/dates, les émetteurs connus et les opérations permises. Une proposition reste soumise à revue ; elle ne peut pas confirmer un encaissement ou autoriser un acquittement. Aucun appel OpenAI n’a été ajouté. Les erreurs et éléments DOM sont vérifiés sans assertions. Les assertions littérales `as const` servent uniquement aux clés et discriminants. Aucun `any` applicatif, `@ts-ignore` ou `@ts-nocheck` n’a été ajouté.

## PDF : références et exception documentée

Les moteurs, CSS et logos sont identiques à la référence de départ. Les 21 empreintes du lot 1 restent valides : 19 fichiers actifs et les deux anciennes pages archivées lors de la refonte UX autorisée.

`npm run test:editor:browser` génère avec les moteurs originaux six PDF sous `tmp/editor-ui/references/` : `devis-standard.pdf`, `devis-multipage.pdf`, `facture-standard.pdf`, `facture-multipage.pdf`, `facture-acompte.pdf`, `facture-acquittee.pdf`. Date de création et identifiant interne sont fixés dans le harnais de test. Les empreintes binaires sont comparées à `tests/fixtures/pdf-reference-hashes.json` ; le contrat historique et le contrat adapté produisent les mêmes instructions PDF. Le harnais n’est pas une route applicative et ne contourne pas Clerk dans l’application.

Les PDF restent locaux et ignorés par Git : les clients/émetteurs des scénarios sont fictifs, mais le modèle original contient encore des mentions historiques fixes. Seules les empreintes sont versionnées. Le scénario acquitté vérifie le moteur historique ; il ne permet pas de contourner le refus d’acquittement de l’éditeur sans encaissements serveur vérifiés.

La couverture de six cas ne démontre pas encore l’équivalence de tous les rendus historiques : autres logos, longues coordonnées, coupures aux limites de page et combinaisons de titres/TVA restent à compléter avant une conversion des moteurs. Leurs interfaces strictes sont une étape, pas une migration de leur implémentation. Les anomalies PDF existantes restent documentées dans `docs/editor-audit.md` et `docs/editor-ux.md`.

## Vérifications

Les phases 1 et 2 ont passé TypeScript, les tests concernés et le build. La phase finale vérifie :

- `npm run typecheck`, `typecheck:editor`, `typecheck:billing` ;
- `test:editor` (7 tests : contrats, catalogues, données malformées, restauration) ;
- `test:editor:browser` (7 tests : desktop/mobile, PDF, 300 lignes) ;
- `test:auth` (9 tests), `test:auth:http` (1 test Next réel sans configuration) ;
- `test:billing` (34 tests), `test:postgres` (17 tests PostgreSQL 17 natif isolé, concurrence réelle) ;
- `test:baseline` (21 empreintes, six scénarios, neuf logos), `npm run build`.

Les limites d’intégration Clerk/Supabase demeurent celles de `docs/lot3a2.md` : aucun nouveau jeton Clerk réel ni accès Storage distant n’est validé par ces simulations locales. Les migrations SQL, la numérotation serveur, le fichier de verrouillage des dépendances, les logos et les CSS n’ont pas changé. La suppression préexistante de `.env.example` reste hors commits ; `.env.local` n’est ni lu pour cet audit ni affiché ni versionné (Next le charge normalement pour son build).

Pour reproduire les tests, conserver Node 22.13+ et les dépendances verrouillées. Le test navigateur utilise Edge installé localement ; la recette PostgreSQL utilise le runtime local décrit dans `docs/lot3a2.md`. Aucun environnement de production n’est nécessaire.
