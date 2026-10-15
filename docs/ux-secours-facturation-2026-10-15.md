# Facturation : parcours et solutions de secours

Livraison du 15 octobre 2026.

- Parcours présenté en trois étapes : préparer, relire, émettre. L’émission et l’envoi au client restent distincts.
- Enregistrement d’une préparation sans confirmation supplémentaire ; confirmation maintenue avant émission définitive.
- Dans l’éditeur de facture, ouvrir **Numérotation et solutions de secours**, puis **Saisir le numéro manuellement**. Indiquer le numéro complet et un motif de 10 à 500 caractères.
- Le numéro manuel doit suivre exactement la série de l’entité juridique et correspondre à la date. Aucune remise à zéro ni saut de numéro. Le serveur verrouille la facture puis la séquence, contrôle les doublons et conserve tous les contrôles fiscaux de l’émission normale. Une reprise de série externe passe toujours par les réglages et sa justification.
- Une panne du chargement prévisionnel ne bloque plus à elle seule l’émission. Le serveur vérifie réellement la série lors de l’émission.
- Après une réponse d’émission perdue, **Vérifier le résultat de l’émission** récupère le statut et le numéro déjà enregistré. Une nouvelle tentative depuis le formulaire reste bloquée tant que ce résultat est incertain.
- L’adresse du navigateur conserve l’identifiant après sauvegarde pour rouvrir la même préparation après rechargement.
- **Télécharger une copie de ma saisie** fonctionne même sans connexion serveur. Ce JSON se reprend avec **Importer un brouillon** ; il conserve les champs de l’éditeur, mais ne constitue ni une facture ni une archive fiscale et ne remplace pas les associations serveur (client, chantier, devis).
- Des messages expliquent les problèmes de date, doublon, série et configuration fiscale et orientent vers les corrections.

## Vérifications

46 tests automatisés et 2 tests navigateur passent, ainsi que TypeScript, lint et build. Le nouveau scénario navigateur utilise une largeur mobile, simule une prévision indisponible puis une émission dont la réponse est perdue ; il vérifie la saisie manuelle et la récupération du même numéro sans seconde émission. Les services y sont simulés.

La recette PostgreSQL isolée vérifie la continuité, le refus d’un non-administrateur, la date incohérente, le motif obligatoire, les répétitions idempotentes et la consommation d’un seul numéro. La migration `20261015214454_logifa_manual_invoice_number` est appliquée sur Supabase Logifa. Le catalogue confirme l’interdiction d’exécution anonyme, le contrôle administrateur et la RLS du journal privé. Aucun document, paiement ou e-mail réel n’a été créé pour ces tests.

La saisie manuelle ne permet pas d’émettre hors ligne : si la base est indisponible, conserver ou exporter la préparation puis reprendre. Le moteur fiscal demeure commun aux deux modes. La recette authentifiée réelle et l’observation par un utilisateur métier restent à faire.
