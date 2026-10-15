# Recette et état de livraison LOGIFA — 15 octobre 2026

Ce document distingue les tests locaux et les preuves de déploiement d'une recette métier authentifiée. Ne pas créer de fausses écritures financières dans la production.

## Contrôles reproductibles

Node 22.13 ou supérieur, puis `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Pour la recette d'interface : `npx playwright install chromium`, puis `npm run test:browser`. Si Chromium système est utilisé, renseigner `LOGIFA_CHROMIUM_PATH` avec son chemin.

Les tests SQL utilisent PGlite, les migrations de socle restaurées et des identités synthétiques. Les tests d'interface remplacent Clerk et les API par des réponses synthétiques. Les tests Resend/OpenAI remplacent HTTP ; aucun message ou appel payant n'est envoyé. Les tests parallèles PGlite sont sérialisés par sa connexion unique : la concurrence entre sessions PostgreSQL n'est pas vérifiée.

## Recette de bout en bout dans un environnement financier isolé

1. Se connecter avec l'administrateur prévu ; vérifier le refus d'un autre utilisateur et d'une session absente. Les refus HTTP doivent être obtenus sans exposer de données.
2. Créer deux entreprises de recette avec des informations synthétiques dans cet environnement isolé. Contrôler les listes, paramètres, clients, devis, factures et règlements dans chacune. Le changement d'entreprise doit effacer immédiatement l'ancien affichage.
3. Créer un client et son chantier. Vérifier la séparation rue/code postal-ville et la réouverture de la fiche. Modifier les champs légaux ordinaires et vérifier la conservation des données historiques non modifiées.
4. Préparer un devis synthétique de 1 000,00 EUR HT à 20 % de TVA. Sauvegarder, fermer, rouvrir ; aucun numéro de facture ne doit être consommé. Contrôler le PDF et les mentions de l'entreprise sélectionnée.
5. Émettre le devis dans cet environnement isolé et constater son accord seulement avec une preuve réelle de recette. Ne pas confondre le statut importé « signé » avec une preuve vérifiée. Pour un PDF historique, conserver l'original, extraire les lignes, compléter les inconnues et vérifier les totaux avant application.
6. Préparer un premier acompte de 30 % : 300,00 EUR HT, 60,00 EUR de TVA, 360,00 EUR TTC. Contrôler les dates, le client, la nature de l'opération et les mentions ; émettre. Numéro serveur et original archivé doivent être visibles.
7. Préparer un second acompte de 30 % sur le contrat initial : mêmes montants. Le premier acompte ne doit pas être réémis. Tester aussi une proposition de pourcentage libre et une somme libre.
8. Préparer la finale avec toutes les lignes du contrat et associer les deux acomptes déjà facturés. Déduction attendue : 720,00 EUR TTC ; net de la finale : 480,00 EUR TTC. Si les acomptes ne sont pas réglés, la chaîne reste due à hauteur de 1 200,00 EUR TTC. Une seconde finale du même périmètre doit être refusée.
9. Enregistrer uniquement les règlements effectivement réalisés dans l'environnement de recette : par exemple 200,00 puis 160,00 EUR affectés au premier acompte. Son solde passe de 160,00 à zéro ; le paiement de l'acompte ne doit pas réduire une deuxième fois le montant facturé sur la finale.
10. Compléter les règlements du deuxième acompte et de la finale. La finale ne devient acquittable qu'après règlement complet de sa chaîne. Comparer les pages fiscales du PDF original à la variante acquittée : elles doivent être conservées ; une annexe constate le règlement.
11. Tester un remboursement de recette depuis le choix lisible du règlement et de sa facture. Le moteur contrôle les sommes disponibles et les affectations. Une variante acquittée devenue invalide doit être refusée au téléchargement/envoi. Ne jamais fabriquer un remboursement pour simuler une simple réaffectation.
12. Tester un avoir partiel et total, les plafonds et les liens avec l'original. Un avoir qui annule le solde sans encaissement ne doit jamais produire une facture acquittée. Un acompte déjà déduit d'une finale exige une régularisation coordonnée ; ne pas contourner son refus.
13. Préparer un e-mail de recette : destinataire contrôlé, expéditeur vérifié, objet avec le véritable numéro, modèle, contenu et PDF archivé SHA-256. Faire valider ce contenu et ce destinataire avant l'envoi. Vérifier ensuite la réception, la pièce jointe, l'historique et le comportement d'un réessai avec la même clé. Aucun e-mail client pendant la recette.
14. Archiver et rouvrir les originaux ; vérifier leur empreinte et l'accès limité à l'administrateur. Tester la récupération après une panne Storage sans redemander un numéro fiscal.
15. Tester les propositions IA avec données synthétiques et configuration autorisée : données absentes laissées inconnues, prix provenant de preuves/catalogue approuvé, proposition modifiable, aucun paiement/émission/envoi autonome. Le onzième appel dans l'heure doit être refusé, y compris après changement d'instance serveur.

## Données réelles et validations humaines

En production, le parcours ne doit porter que sur de véritables opérations. L'administrateur vérifie identité, régime fiscal, assurance, mentions, dates et série historique avant l'émission. La reprise de Couverture Catalane a été lue à 4419 ; aucune réinitialisation ni renumérotation n'a été faite par cette intervention.

Les clés applicatives et la recette d'une session Clerk réelle ne sont pas disponibles localement. Le connecteur Vercel a refusé l'accès aux déploiements de l'équipe ; les statuts de déploiement publiés par Vercel dans GitHub restent consultables. L'existence d'un build réussi ne prouve pas la configuration de chaque service.

## Travaux et preuves encore nécessaires

- Recette authentifiée réelle Clerk → Supabase RLS/RPC → Storage privé, avec un utilisateur non administrateur de recette autorisé.
- Test de verrouillage/numérotation entre plusieurs connexions PostgreSQL et test de récupération après interruption pendant l'émission.
- Recette visuelle exhaustive des modèles sur de vrais exemples anonymisés et de longs en-têtes/adresses/conditions. L'alignement monétaire et la conservation des pages acquittées sont testés, mais tous les cas de pagination ne le sont pas.
- Réaffectation d'un règlement sans remboursement : fonctionnalité manquante ; ne pas utiliser un remboursement fictif comme substitut.
- Rapprochement bancaire et TVA exigible : revue métier selon le régime réel. Les statuts de revue ne constituent pas un moteur de déclaration TVA validé.
- Preuve d'accord native, signature fournisseur optionnelle, refus/expiration et versionnement : parcours à compléter et valider ; ne pas assimiler un bouton de statut à une signature électronique.
- Chargement initial et indicateurs au-delà de 500 lignes, archives complètes et filtres plus riches : restent à optimiser. La navigation des quatre listes principales est désormais paginée côté serveur.
- Recette Resend réellement reçue après validation du destinataire et du contenu ; test des états incertains et des relances. Les relances automatiques ne sont pas activées.
- Configuration OpenAI réelle, plafond financier côté fournisseur, corpus anonymisé approuvé et évaluations métier. Les quotas persistants d'appels ne constituent pas un plafond en euros.
- Export/restauration complets, Factur-X et connexion à une plateforme agréée : hors des fonctions actuellement validées. Aucun PDF simple n'est présenté comme une transmission réglementaire.

## Sources officielles à utiliser pour la revue juridique

- Mentions de facturation : https://entreprendre.service-public.gouv.fr/vosdroits/F31808
- Devis et acceptation : https://entreprendre.service-public.gouv.fr/vosdroits/F31144
- TVA et acomptes de prestations : https://bofip.impots.gouv.fr/bofip/283-PGP.html

Ces références proviennent de la documentation du projet. Leur contenu courant n'a pas été vérifié directement depuis cette session ; aucune attestation générale de conformité n'est donnée.
