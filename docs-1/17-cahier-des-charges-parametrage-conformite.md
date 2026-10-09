# Cahier des charges 4 — Paramétrage, conformité et garde-fous IA

## Périmètre

Ce cahier traduit la maquette 8 (Paramètres du recrutement) et les exigences transversales nécessaires aux quatre écrans précédents. Il fixe les garde-fous qui empêchent que l'IA ou la configuration devienne un mécanisme de décision automatisée.

## Écran 8 — Paramètres du recrutement

### Éléments visibles à livrer

- Titre `Paramètres du recrutement` et onglets `Général`, `Étapes du pipeline`, `Critères d'analyse IA`, `Conservation des données`.
- Onglet actif `Critères d'analyse IA` avec quatre champs : compétences techniques attendues, compétences de communication, expérience liée au poste et points à clarifier lors de l'examen RH.
- Limite visible de 500 caractères pour chaque champ et aides contextuelles.
- Encadré `À propos de l'analyse IA` rappelant que l'analyse est strictement consultative, liée au poste, non discriminatoire et revue par un humain.
- Options activables : synthèse consultative uniquement, vérification humaine avant toute action RH, masquage des données non pertinentes au poste.
- Actions `Réinitialiser` et `Enregistrer les modifications`.

### Règles fonctionnelles

- Les critères sont rattachés à une offre ou un type de poste. Ils doivent être objectifs, nécessaires, vérifiables dans le dossier et non discriminatoires.
- Le système refuse toute caractéristique sensible, information de santé, âge, origine, genre, croyance, situation familiale, toute autre donnée non nécessaire, ainsi que leurs proxies.
- Les critères et options sont versionnés. Une analyse existante conserve la version utilisée ; une modification ne réécrit jamais son historique.
- La synthèse consultative et la vérification humaine sont des garde-fous obligatoires. Ils ne peuvent pas être désactivés dans une configuration de production.
- `Réinitialiser` restaure les dernières valeurs enregistrées après confirmation lorsqu'il existe des modifications non sauvegardées. `Enregistrer` valide les champs, affiche un résultat compréhensible et audite le changement.
- La conservation affiche la durée, le point de départ, les droits applicables et le mécanisme réellement implémenté de suppression ou d'anonymisation. Elle ne doit pas promettre une purge inexistante.

## Sécurité, confidentialité et qualité transversales

- Toute route `/api/admin/recrutement/*` réutilise le middleware de session de l'hôte. Une autorisation est vérifiée serveur avant toute consultation, modification, export ou téléchargement.
- Les documents candidats sont stockés hors des dossiers publics et chiffrés au repos. Les erreurs ne révèlent ni chemin interne, ni secret, ni donnée d'un autre dossier.
- Les exports sont limités au périmètre autorisé, tracés et protégés contre l'injection de formules. Ils n'emportent aucune donnée non nécessaire.
- Les actions externes, dont les e-mails, nécessitent une confirmation explicite et une clé d'idempotence : une même clé ne peut produire qu'un envoi.
- Chaque écran prévoit les états chargement, vide, erreur, indisponibilité et succès. Les libellés, aides et erreurs sont en français ; les identifiants techniques restent en anglais.
- Contraste AA, focus visible, navigation clavier, libellés accessibles, annonces d'état et alternatives textuelles aux graphiques sont obligatoires.

## Décisions indispensables avant livraison complète

| Sujet | Décision attendue | Risque à défaut |
| --- | --- | --- |
| Droits RH | Matrice consultation, modification, export, publication, paramétrage et gestion d'équipe. | Accès excessif aux dossiers. |
| Provisionnement | Intégration TechZone hôte ou retrait de l'invitation d'équipe de V1. | Comptes locaux non maîtrisés. |
| Calendrier | Fournisseur, consentement, périmètre et comportement sans intégration. | Invitations externes involontaires. |
| Indicateurs | Sources, formules, périodes et unités uniques. | Tableaux de bord contradictoires. |
| Conservation | Durées, base légale, suppression, export et traitement des droits. | Conservation excessive ou non-conformité. |
| IA | Fournisseur, données transmises, localisation, rétention, versionnage et revue humaine. | Traitement excessif ou analyse non explicable. |

## Critères de recette

- Une donnée ou un critère interdit est refusé avec un message exploitable et ne peut être enregistré.
- Un utilisateur sans permission ne peut ni lire ni modifier les paramètres, y compris via l'API.
- Les garde-fous d'analyse consultative et de revue humaine sont vérifiés par des tests automatisés et des tests de recette.
- Les documents, exports et journaux respectent les contrôles d'accès, le chiffrement et la traçabilité définis.
