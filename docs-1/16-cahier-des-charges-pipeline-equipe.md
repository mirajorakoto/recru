# Cahier des charges 3 — Pipeline et équipe RH

## Périmètre

Ce cahier traduit les maquettes 6 (Pipeline) et 7 (Équipe RH). Il organise le travail des RH sans évaluer automatiquement les personnes ni créer un système de comptes parallèle à TechZone.

## Écran 6 — Pipeline

### Éléments visibles à livrer

- Titre `Pipeline`, sous-titre de suivi visuel et filtres par offre et responsable.
- Tableau Kanban avec les colonnes `Nouveau`, `À examiner`, `Entretien`, `En attente`, un compteur et une description par colonne.
- Cartes de candidature avec avatar abstrait, nom pseudonymisé, poste, date, responsable et menu d'actions.
- Action `Ajouter une candidature` en fin de colonne.

### Règles fonctionnelles

- Les cartes ne présentent ni score, ni recommandation, ni toute autre décision de l'IA.
- Un déplacement est une proposition de changement d'étape soumise aux permissions, validations et journalisation. Le glisser-déposer est facultatif ; s'il existe, une alternative clavier est obligatoire.
- `Ajouter une candidature` ouvre le parcours de dépôt interne autorisé. Il ne permet pas l'import non sécurisé de documents ni la création d'un dossier sans consentement/documentation requise.
- Les compteurs respectent les filtres actifs et les changements sont répercutés dans la liste des candidatures et l'activité du dossier.
- Une modification concurrente est signalée ; elle ne peut pas écraser silencieusement l'action d'un autre RH.

### Anomalie à résoudre avant recette

Le compteur `Nouveau` affiche 8 dans cette maquette, mais 48 dans la maquette Tableau de bord. Il faut spécifier si l'un des deux écrans représente un filtre, une période ou un sous-ensemble ; sinon ils doivent restituer la même valeur.

## Écran 7 — Équipe RH

### Éléments visibles à livrer

- Titre `Équipe RH`, action `Inviter un membre` et indicateurs Membres de l'équipe, Offres suivies, Candidatures traitées, Entretiens réalisés.
- Tableau des membres : avatar abstrait, rôle, état de présence, offres suivies, charge de travail et menu d'actions.
- Bloc `Répartition des candidatures`, sélecteur de regroupement, histogramme et bloc `Charge cette semaine`.

### Règles fonctionnelles

- La charge est une information opérationnelle, jamais un indicateur de performance individuelle ou de disponibilité déduite.
- Les rôles, états et compteurs doivent provenir d'une matrice d'autorisations TechZone. Les données de démonstration ne comportent ni e-mail ni donnée personnelle réelle.
- Le module réutilise la session existante de `/admin` et ne crée ni compte ni jeton propre. `Inviter un membre` ne peut créer un accès que via le provisionnement TechZone hôte explicitement intégré.
- Sans intégration de provisionnement validée, cette action redirige vers l'administration hôte, ou reste masquée/désactivée avec une explication. Elle ne doit jamais envoyer une invitation ou créer un utilisateur local silencieusement.
- Les graphiques disposent d'un équivalent tabulaire, avec leur période, unité et filtre explicités.

### Anomalie à résoudre avant recette

La table mélange `candidatures` et `entretiens` dans la colonne `Charge de travail`, alors que l'histogramme est titré `Répartition des candidatures`. Une unité unique, une formule et une période doivent être définies avant tout calcul de charge ; additionner ces valeurs telles quelles serait trompeur.

## Critères de recette

- Un changement d'étape apparaît dans le pipeline, le dossier, l'activité et les compteurs concernés.
- Un RH dépourvu de permission de gestion d'accès ne peut pas utiliser l'invitation ou les actions de gestion d'équipe.
- Les cartes, filtres, menus et changement de colonne sont utilisables au clavier et annoncés par les technologies d'assistance.
