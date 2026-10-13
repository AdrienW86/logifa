# Chiffrage depuis les totaux HT de prestation

## Cause et correction

Le schéma ne distinguait pas un total de prestation d’un prix unitaire. Le
contrôle de provenance exigeait ensuite que le PU soit présent dans la consigne
ou dans le catalogue ; un PU issu d’une division n’avait pas de preuve admissible.
Un forfait de quantité 1 masquait ce problème puisque total et PU coïncident.

Les nouvelles lignes et les modifications de lignes existantes acceptent
`total_ht`, `total_ht_evidence` et `unit_evidence`, distincts de `price` et
`price_evidence`. `document_total_ht` et sa preuve représentent uniquement un
total général HT explicite. Les champs sont nullables, sans valeur implicite.

Le calcul est réalisé côté TypeScript avec les outils monétaires BigInt
existants : total en centimes, quantité décimale de six chiffres maximum,
division et arrondi HALF_UP à deux décimales du PU. Les limites monétaires
existantes sont conservées. Aucun calcul financier n’est confié au modèle.

## Provenance et limites

Une déclaration complète doit être citée exactement et attribuée à une seule
désignation, une quantité strictement positive et une unité. Exemples reconnus :

```text
Dépose : 120 m² pour 2 160 € HT
Zinguerie : 26 ml pour 1 430 € HT
Faîtages : 14 ml pour 1 260 € HT
Installation chantier : 1 forfait pour 1 450 € HT
Dépose (120 m²), pour un montant total HT de 2 160 €
Total HT du devis : 22 170 €
```

Les budgets globaux, citations tronquées d’un montant partagé, unités ou
quantités non justifiées et la réutilisation du même total pour plusieurs
lignes ne permettent pas une déduction. Une formulation hors des grammaires
explicites reconnues reste à compléter : l’agent ne peut pas reformuler sa
preuve pour la faire passer. Pour faciliter l’attribution, utiliser une ligne
ou une clause séparée par un point-virgule par prestation. Les anciens contrats
de réponse enregistrés restent lisibles.

Une désignation donnée dans sa déclaration source est conservée sans préfixe
inutile. Les suggestions techniques réellement incertaines restent à confirmer.

La vérification d’arrondi compare le produit décimal exact au total fourni,
y compris un écart inférieur au centime. Exemple : 10 EUR / 3 donne un PU de
3,33 EUR et un total de 9,99 EUR ; 1 EUR / 0,3 donne 0,999 EUR avant arrondi.
Dans ces cas, le prix d’une nouvelle ligne reste vide. Sur une ligne existante,
son ancien tarif reste conservé, sans remplacement automatique. L’aperçu ou
le message de refus indique l’écart et le besoin de validation manuelle. Aucun
total fourni n’est changé silencieusement. Un conflit entre PU fourni et total
fourni nécessite également une validation.

## Aperçu et rapprochement

Chaque tarif dérivé dispose d’une explication, par exemple :
« Prix calculé : 2 160 € ÷ 120 m² = 18 €/m² HT ».
Ces explications apparaissent dans les différences avant confirmation humaine.
Elles sont des métadonnées de proposition, pas des champs ajoutés aux PDF.

Un total général explicitement prouvé est rapproché des lignes du devis complet,
après les ajouts et modifications proposés. Une discordance ou un chiffrage
incomplet est signalé dans la revue ; aucun total n’est ajusté pour forcer la
concordance. Le calcul monétaire de contrôle est décimal. Sans TVA renseignée,
les résumés TVA et TTC affichent « À confirmer » ; aucun taux n’est supposé.
Les contrôles de génération et d’émission restent stricts.

## Recette

`tests/fixtures/agent-pricing.mjs` utilise désormais les quatorze prestations
exactes fournies par l’utilisateur, identifiées comme données fictives de sa
consigne initiale. Désignations, ordre, quantités, unités et montants sont
conservés. Les neuf prestations métrées totalisent 17 750 EUR HT et les cinq
forfaits 4 420 EUR HT, soit 22 170 EUR HT. Les citations utilisent aussi les
espaces de milliers, notamment « 1 450 » et « 2 160 ».

Chromium exécute le véritable handler `/api/agent` avec fournisseur et
authentification simulés : saisie → réponse contrôlée → quatorze explications
de tarif et concordance exacte dans la revue → confirmation humaine → quatorze
PU visibles dans le formulaire, toutes les TVA vides et TTC à confirmer.
Le test vérifie les PU 850, 1 450, 18, 780, 14, 9, 12, 57, 90, 50, 55, 55,
950 et 390 EUR HT, la reconstitution de chaque montant et la conservation
de chaque désignation et quantité dans l’éditeur. Un test supplémentaire applique les mêmes calculs aux
quatorze lignes déjà présentes, sans les dupliquer.

82 tests passent : éditeur/agent 25, navigateur/PDF 13, authentification 9,
finances 35. TypeScript strict dans les trois configurations, build Next.js
isolé et 21 empreintes historiques validés. Le test manuel de saisie attend
désormais la mise au focus asynchrone du nouveau poste avant d’automatiser la
frappe, sans changer le comportement de l’application.

Aucun appel OpenAI payant, envoi e-mail, modification de clés ou données
fiscales réelles. Aucun générateur PDF, CSS, logo ni schéma Supabase modifié.
Les 38 tests éditeur/agent et Chromium ont été rejoués sur ce jeu exact, sans
écart constaté. La qualité d’une prochaine extraction réelle OpenAI reste
distincte de ce rejeu avec réponse structurée contrôlée.
