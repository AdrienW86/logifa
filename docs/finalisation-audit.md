# Audit initial de finalisation — 13 octobre 2026

Cet audit décrit le point de départ. Le plan de quatrième migration a ensuite été remplacé par la consolidation dans les **trois** migrations 3A, commit `c57aa8a`. Pour l'état livré et les limites de validation, consulter [le rapport de finalisation](finalisation-recette.md).

Référence `a33e2f6`, branche `develop/logifa`. Seule modification préexistante : suppression non commitée de `.env.example`, dont la restauration est maintenant demandée. Aucun fichier AGENTS.md dans le projet. README et rapports 3A/3A.1/3A.2, UX et TypeScript consultés.

Fonctionnel : Clerk administrateur unique, éditeur manuel partagé, sauvegardes locales explicites, aperçu/export PDF historique, contrôles de propositions structurées, services financiers transactionnels testés localement, archivage privé préparé. Les trois migrations ne sont pas appliquées au principal.

Manquant : interfaces de gestion, API métiers, lecture par émetteur, carnet clients isolé, sauvegarde/réouverture serveur, transitions de devis et suppression contrôlée, parcours factures et règlements, import documentaire, variantes PDF adaptées, adaptateur IA, accueil chiffré à partir des données serveur. Le modèle 3A autorisait des clients partagés ; la nouvelle exigence impose des fiches propres à chaque profil émetteur. Les clients historiques ne doivent pas être rattachés par supposition.

Travaux : migration additive après les trois existantes ; rattachement nullable des anciennes fiches et obligation de rattachement explicite pour les nouvelles opérations ; API sécurisée et UI commune ; intégration au même éditeur ; variantes PDF séparées, moteurs classiques conservés ; agent sans activation/coût par défaut ; tests et guides. Aucun nouveau moteur financier, migration distante ou changement Clerk de production.

Risque connu : le PDF classique facture force TVA zéro et ignore les déductions. Il ne peut pas représenter une nouvelle facture taxable comme document final sans adaptation explicitement distincte. Le régime fiscal et les mentions restent à qualifier par l’administrateur. Une simulation SQL/Clerk ne constitue pas une validation de JWT ou Storage distant.
