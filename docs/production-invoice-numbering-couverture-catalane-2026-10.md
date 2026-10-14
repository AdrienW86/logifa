# Numérotation des factures — Couverture Catalane (reprise 2026)

État validé en production le 15/10/2026 : configuration **sans émission**.

## Référence métier

- Conversation du 20/09/2026 : factures travaillées avec séquence `0020` puis `0021`.
- Dernière facture préparée : `D-2026922-0021` (22/09/2026).
- Prochaine séquence **réservée pour attribution future** : `0022`.
- Ces anciens PDF ne sont pas enregistrés comme factures émises dans la base Logifa. Leur caractère effectivement émis doit être confirmé à partir des archives comptables.

## Configuration en production

Une migration Supabase `resume_couverture_catalane_invoice_0022` a :
- démarré `public.document_sequences` pour l'entité juridique de Couverture Catalane, `document_type='invoice'`, `next_value=22`, `last_issue_date='2026-09-22'`, `prefix='D'` ;
- adapté uniquement la branche `invoice` de `logifa_private.api_issue_document` pour conserver le format historique `D-AAAAMJJ-XXXX` observé, par exemple `D-20261015-0022`, en utilisant le mois sans zéro initial et un jour sur deux caractères ;
- conservé la branche `quote` existante ;
- préservé le verrouillage de la ligne de séquence, les contrôles d'antériorité, l'unicité et la mise à jour transactionnelle du compteur avec l'émission ;
- refusé les compteurs supérieurs à 9999 plutôt que de tronquer un numéro.

**Important** : le numéro est attribué uniquement par `logifa_issue_document`. Les aperçus et téléchargements locaux avant émission restent marqués `BROUILLON` et ne prouvent aucune émission fiscale. Ne jamais saisir le numéro directement sur un document déjà émis.

## Points bloquants à valider avant une facture définitive

1. L'entité juridique est encore `reviewed=false`. Les coordonnées légales, le régime de TVA et les mentions doivent être relus, puis validés par l'administrateur dans le module de fiscalité.
2. Le devis historique Koutzenko `D-2026930-6066` est stocké avec `status='sent'` et `original_status='signé'`. Ce statut déclaré ne remplace pas le contrôle d'un accord client. Le moteur des factures finales exige un devis accepté pour l'émission.
3. Confirmer que `0021` est bien le dernier numéro de facture réellement attribué hors Logifa et qu'il n'existe pas d'émission plus récente. Le compteur peut être réconcilié avant la première émission, jamais rétroactivement sans procédure de correction.
4. Les autres entreprises émettrices doivent avoir leur propre séquence validée, initialisée avant émission.

Ce document rapporte la configuration; il ne constitue pas une attestation de facture émise.
