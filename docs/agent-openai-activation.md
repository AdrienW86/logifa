# Agent OpenAI — activation contrôlée

L’agent appelle réellement `POST https://api.openai.com/v1/responses` depuis
`lib/agent/openai.ts`. Les tests injectent un transport fictif ; l’application
n’utilise pas une réponse de démonstration comme résultat de génération.

## Configuration serveur

Dans `.env.local`, ignoré par Git :

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
LOGIFA_OPENAI_ENABLED=false
LOGIFA_OPENAI_COSTS_APPROVED=false
```

Renseigner une clé dédiée au projet LOGIFA. Une clé exposée dans un message,
une sélection IDE transmise au chat ou une capture doit être révoquée dans
OpenAI et remplacée localement, sans envoyer sa valeur. Ne jamais ajouter de
préfixe `NEXT_PUBLIC_`. Le script `node scripts/prepare-logifa-openai.mjs --write`
préserve la clé et les autres intégrations, prépare le modèle si absent et remet
les deux autorisations à `false`. Ce script ne génère aucune clé et n’appelle pas OpenAI.

Après remplacement de toute clé exposée et accord sur les données et coûts,
passer les deux autorisations à `true`, puis redémarrer proprement l’unique
serveur Next.js. Aucun appel au démarrage : un appel exige la confirmation dans
l’éditeur. La facturation et l’accès au modèle doivent être activés dans le
projet OpenAI ; l’abonnement ChatGPT ne constitue pas une validation de cet accès.

Modèle centralisé dans `OPENAI_MODEL`. `gpt-5.4-mini` supporte Responses et les
sorties structurées, avec un effort de raisonnement par défaut `none`.
Tarifs documentés au 13 octobre 2026 : 0,75 USD/million de tokens d’entrée et
4,50 USD/million de tokens de sortie. Le maximum de sortie est de 4 000 tokens
par demande, soit au plus 0,018 USD pour cette seule sortie, hors entrée et taxes.
[Documentation officielle du modèle](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

## Données et protections

- GET et POST `/api/agent` exigent l’administrateur Clerk côté serveur.
  POST vérifie également l’origine et une confirmation explicite.
- Transmission : consigne exacte, noms de l’émetteur et du client sélectionnés,
  type du document, lignes existantes (100 maximum) et catalogue local.
  Les coordonnées, SIRET, références fiscales et historique des paiements ne
  sont pas extraits automatiquement du formulaire. Retirer les informations
  sensibles inutiles de la consigne et des libellés : ceux-ci sont transmis tels quels.
- Consigne limitée à 10 000 caractères, entrée sérialisée à 80 000 caractères,
  délai 45 secondes, dix tentatives par heure et par administrateur/processus.
  La limite est en mémoire : redémarrages et plusieurs processus la réinitialisent
  ou la répartissent. Configurer aussi les alertes/budgets et limites disponibles
  dans OpenAI ; ce mécanisme local ne garantit pas un plafond monétaire global.
- `store:false`, aucun outil, aucune reprise automatique après une erreur.
  `store:false` ne garantit pas l’absence de toute rétention fournisseur.
- JSON Schema strict puis validation à l’exécution. Prix et quantités exigent
  une provenance explicite ; prix du catalogue uniquement pour désignation et
  unité exactes ; TVA explicite dans la consigne. Les champs manquants sont signalés.
- Réponse sans pouvoir d’émission, de numérotation, d’acquittement, d’envoi,
  de paiement ou de changement d’émetteur. Revue des différences puis validation
  humaine avant application au formulaire existant. Un document émis reste verrouillé.
- Erreurs fournisseur, quotas, réseau, refus et réponse incomplète sont traduits
  sans transmettre le corps fournisseur, la clé ou les en-têtes au navigateur.

## Premier essai limité

Dans un nouveau brouillon **non enregistré**, choisir l’émetteur et saisir
`Client fictif — essai IA` sans coordonnées réelles. Vider les lignes de test si nécessaire.
Ne pas utiliser un document émis. Écrire :

> Ajoute une ligne « Prestation fictive de recette », unité forfait, quantité 2,
> prix unitaire HT 10 euros, TVA 20 %. Ne modifie pas le client et ne crée aucun paiement.

Cliquer « Demander une proposition IA », confirmer **une seule demande**, relire
la proposition et les différences. Vérifier 20 EUR HT, 4 EUR TVA, 24 EUR TTC.
Appliquer seulement pour vérifier le préremplissage ; ne pas enregistrer,
émettre, archiver ou envoyer ce document fictif dans la base réelle.
Ne pas répéter automatiquement une requête échouée ou ambiguë.

Au moment de cette préparation, aucun appel payant n’a été exécuté. Le succès
du transport et la disponibilité du modèle pour le compte restent à valider
avec une nouvelle clé non divulguée et cet essai limité.

## Vérifications locales du 13 octobre 2026

130 tests réussis : authentification 9, refus HTTP Next.js sans configuration 1,
finances 35, PostgreSQL local 30, éditeur/agent/e-mail simulé 21, éditeur et PDF
dans Chromium 8, sécurité workspace 1, workspace navigateur 3, PWA 7,
préparation Supabase locale 3, modèles d’e-mails 12. Aucun appel OpenAI réel
ni envoi d’e-mail lors de ces tests. Les tests PostgreSQL et la préparation
Supabase locale ne constituent pas une recette complète des services hébergés.

Les trois contrôles TypeScript strict, le build Next.js isolé et les 21 empreintes
historiques passent. Les générateurs PDF, logos et CSS ne sont pas modifiés.
Un test PWA de mise à jour échouait par désynchronisation entre les contextes
navigateur de Playwright ; son attente et son activation sont maintenant dans
le même contexte principal. Le service worker applicatif reste inchangé.
