# LOGIFA — Agent de devis V2 : architecture et critères de recette

Statut : plan technique, **non activé en production**. Les documents PDF déjà émis et les invariants financiers restent immuables.

## Diagnostic sur l'existant
- `app/api/agent/route.ts` effectue une génération structurée unique puis `validatedAgentProposal`.
- `lib/agent/context.ts` transmet la totalité du catalogue et les lignes existantes sans sélection de références métier.
- `lib/agent/proposal.ts` valide la provenance de chaque prix/quantité, ce qui est nécessaire, mais ne contrôle pas la cohérence d'un plan de travaux avant application.
- `lib/editor/model.ts` applique la proposition au brouillon, avec fusion heuristique des titres. Une relance répétée peut encore dégrader l'organisation.
- Il faut séparer rédaction, chiffrage et intégration, plutôt que demander à une génération unique de tout décider.

## Parcours cible
1. **Analyser** la demande : chantier, périmètre confirmé, éventuels ouvrages non attestés, métrés disponibles, montant global indicatif, informations manquantes.
2. **Planifier** : sections et tâches détaillées sans prix, catégories de confiance (confirmé / à confirmer / optionnel), questionnements indispensables. Ne pas faire passer les exemples documentaires pour des faits du chantier.
3. **Rapprocher les références** : index de modèles approuvés par métier + contexte d'émetteur, avec métadonnées d'origine; jamais transférer coordonnées de clients ni tarifs d'une autre entreprise par défaut.
4. **Chiffrer** : recherche de références commerciales approuvées, provenance par ligne, prix et unités exacts, TVA réglementaire confirmée; budget global = indicateur, jamais base pour inventer une ventilation.
5. **Contrôler** : cohérence des métrés, duplications sémantiques, postes optionnels, chiffrages incomplets, totaux serveur et blocages avant émission.
6. **Prévisualiser les différences** : simulation complète en mémoire, résumé des ajouts/modifications par section, informations incertaines et accord humain explicite avant application idempotente.
7. **Valider** avec tests déterministes + jeux d'évaluation métier; publication progressive, possibilité de revenir au moteur existant.

## Corpus de documents
- Import **volontaire** et réservé à l'administrateur; ingestion initiale hors ligne.
- Devis / factures approuvés, catégorie de travaux, métier, émetteur, date, niveau de qualité, contexte tarifaire.
- Nettoyer ou masquer identité et coordonnées des clients, signatures, identifiants et coordonnées bancaires avant tout usage de référence.
- Séparer les exemples de structure des règles tarifaires. Les montants historiques ne sont pas automatiquement des prix actuels.
- Associer les exemples à une version, une source et un consentement d'utilisation explicite. Document non approuvé = pas de référence de génération.
- Aucun ajout de documents privés au dépôt Git et aucun entraînement/fine-tuning automatique.

## Critères minimaux de recette avant activation
- Deux appels identiques sur un même brouillon ne dupliquent ni sections ni prestations.
- Un titre de section n'est jamais chiffré; chaque prestation conserve l'ordre de sa phase.
- La modification d'une fiche client non demandée est refusée sans perdre le plan de travaux.
- Un métrage absent reste absent; aucune TVA ou montant n'est fabriqué pour rejoindre un budget cible.
- Les titres proches sont fusionnés par une étape métier explicite, pas simplement par des mots communs pouvant confondre faîtage et zinguerie.
- Un PDF de référence sert à la qualité rédactionnelle mais n'altère pas le modèle légal ou les PDF existants.
- Les tests de compilation, validation serveur, permissions Clerk, contrôle d'origine, limites d'appels, provenance et fiscalité doivent passer.
- Contrôle manuel comparatif sur un corpus de devis (détaillage, fidélité, absence d'invention, précision financière, lisibilité).
- Aucun déploiement tant que ces contrôles ne sont pas réalisés.

## Principes de livraison
Pas de refonte fiscale, aucune migration distante ni retouche aux documents émis sans demande explicite. Protéger toute évolution par un mode de déploiement désactivé par défaut, afin de pouvoir vérifier et revenir en arrière.
