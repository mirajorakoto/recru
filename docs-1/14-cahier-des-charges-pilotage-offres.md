# Cahier des charges 1 — Pilotage et offres

## Périmètre

Ce cahier traduit les maquettes 1 (Tableau de bord) et 2 (Offres d'emploi). Il complète le [cahier des charges fonctionnel](2-cahier-des-charges.md) et lui est subordonné : aucune mesure de pilotage ni aucun critère d'offre ne peut produire une décision d'embauche automatisée.

## Cadre d'interface commun

- Interface d'administration en français, desktop d'abord et utilisable dès 320 px de large.
- Barre latérale persistante : Tableau de bord, Offres, Candidatures, Pipeline, Équipe et Paramètres. L'onglet actif est identifiable sans dépendre de la couleur seule.
- Barre supérieure : fil d'Ariane, recherche globale, action `Exporter`, action primaire `+ Nouvelle offre` et notifications.
- Les données de démonstration sont fictives et pseudonymisées. Les graphiques possèdent un équivalent textuel ou tabulaire accessible.

## Écran 1 — Tableau de bord

### Objectif

Donner une vision de charge et des éléments à traiter, sans recommander une issue à une candidature.

### Éléments visibles à livrer

- Titre `Vue d'ensemble`, sous-titre sur l'activité de recrutement et date de référence.
- Quatre indicateurs : `À examiner`, `Entretiens`, `Analyse IA disponible`, `Délai moyen`, avec valeur et évolution par rapport à une période explicitement indiquée.
- Histogramme `Volume de candidatures (30 derniers jours)` avec sélecteur de période.
- Bloc `Pipeline de candidatures` : Nouveau, À examiner, Entretien et En attente, avec compteur par étape.
- Liste `À traiter aujourd'hui` : candidat·e, poste, étape et actions contextuelles telles que ouvrir, planifier, relancer ou ajouter une note.

### Règles fonctionnelles

- Un clic sur un indicateur, une étape ou une ligne ouvre la liste filtrée correspondante ; le filtre appliqué est visible et peut être réinitialisé.
- Chaque métrique affiche son périmètre, sa période, sa définition, son état de chargement et son état vide. Le délai moyen doit préciser événement de départ, événement de fin et dossiers exclus ; il ne mesure jamais la qualité d'une personne.
- Les actions de la liste sont manuelles. `Planifier` prépare une action RH ; il ne crée ni invitation calendrier ni e-mail sans confirmation explicite.
- `Relancer` ouvre un brouillon éditable et suit l'envoi confirmé/idempotent défini dans le cahier général.
- Une analyse IA disponible est un état d'information, pas un filtre de tri par qualité ni une recommandation.

### Anomalie à résoudre avant recette

La maquette du tableau de bord indique `Nouveau : 48`, alors que la maquette Pipeline indique `Nouveau : 8`. La source, le périmètre et la période des deux compteurs doivent être définis. Tant que ce n'est pas le cas, ces valeurs ne constituent pas des données de recette.

### Critères de recette

- Les compteurs, le graphique et le pipeline appliquent le même périmètre ou affichent clairement leur différence.
- La vue tabulaire du graphique restitue les valeurs journalières et les zéros.
- Aucune carte ou action ne permet d'accepter, rejeter, noter ou classer automatiquement un candidat.

## Écran 2 — Offres d'emploi

### Objectif

Créer, consulter et piloter les offres, en ne publiant que des critères objectifs liés au poste.

### Éléments visibles à livrer

- Titre `Offres d'emploi`, nombre d'offres et cartes de synthèse : Offres actives, En pause, Brouillons, Total des candidatures.
- Recherche, filtre de statut et liste avec colonnes `Offre`, `Statut`, `Candidatures`, `Publiée le`, `Responsable` et menu d'actions.
- Exemples de statuts : `Active`, `En pause`, `Brouillon`.
- Panneau de l'offre sélectionnée avec bouton `Voir l'offre`, onglets `Aperçu`, `Candidatures`, `Paramètres`, description, compétences et critères, responsable, volume de candidatures et étapes du processus.

### Règles fonctionnelles

- Les états métier couvrent au minimum brouillon, publiée/active, en pause, clôturée et archivée. Seule une offre publiée et ouverte est visible dans le parcours public.
- La publication exige au moins un critère objectif, nécessaire au poste et vérifiable par un RH. Les critères sensibles, discriminatoires ou leurs proxies sont refusés.
- Les compteurs de candidatures restent descriptifs ; ils ne déclenchent aucun classement ni action automatique.
- Créer, modifier, publier, mettre en pause, clôturer et archiver requièrent la permission appropriée, une confirmation lorsque l'effet est externe, et un événement d'audit.
- Le menu d'actions doit être accessible au clavier et ne pas faire disparaître une action en cours de modification.

### Critères de recette

- Une offre sans critère objectif ne peut pas être publiée.
- Une offre en pause, clôturée ou archivée n'accepte pas de nouvelle candidature publique.
- La sélection, le filtre, le tri et les onglets de détail restent cohérents après actualisation.
