# Cahier des charges 2 — Candidatures et assistance IA

## Périmètre

Ce cahier traduit les maquettes 3 (Profil), 4 (Analyse IA) et 5 (Activité). Il couvre l'examen d'un dossier par le RH ; il ne crée jamais une décision d'embauche automatique.

## Écran commun — Liste et dossier sélectionné

### Éléments visibles à livrer

- Titre `Candidatures`, total affiché et date de mise à jour.
- Recherche par candidat ou poste, filtres `Toutes les offres`, `Toutes les étapes`, `Tous les responsables`, et action `Réinitialiser`.
- Tableau paginé : `Candidat`, `Poste`, `Étape`, `IA`, `Dernière activité`, menu de ligne. La sélection est visible autrement que par sa teinte verte.
- Panneau du dossier sélectionné avec identité pseudonymisée, poste, badges d'étape et d'état IA, bouton `Voir le dossier`, puis onglets `Profil`, `Analyse IA`, `Activité`.

### Règles fonctionnelles communes

- La recherche, le tri et les filtres sont visibles, réversibles, accessibles au clavier et ne peuvent s'appuyer sur une donnée sensible ou un proxy de celle-ci.
- Les états IA doivent distinguer au minimum : analyse disponible, en cours, à vérifier, non disponible, échouée et périmée. Une absence d'analyse ne bloque pas la revue humaine.
- Le panneau et les trois onglets concernent toujours le même dossier ; une nouvelle sélection remplace explicitement le contexte précédent.
- Tout accès au dossier, ajout de note, changement d'étape et action de communication est journalisé avec auteur, date et heure.
- Les documents ne sont accessibles que via une route autorisée, jamais par un répertoire public ; ils restent chiffrés au repos. Une URL directe ne contourne pas la session RH.

## Écran 3 — Onglet Profil

### Éléments visibles à livrer

- Chronologie professionnelle : expériences déclarées et formation, avec dates et descriptions.
- Bloc `Compétences déclarées` sous forme de libellés.
- Bloc `Notes RH` distinct du dossier de candidature.

### Règles fonctionnelles

- L'interface sépare les déclarations de la personne, les notes internes RH et les résultats calculés.
- Une note RH affiche auteur et horodatage ; sa modification ou suppression est tracée et n'altère jamais le document déposé.
- Aucune donnée non nécessaire ou inférence sensible n'est affichée ou extraite.
- `Voir le dossier` indique le type de document et vérifie l'autorisation avant prévisualisation ou téléchargement.

## Écran 4 — Onglet Analyse IA

### Éléments visibles à livrer

- Encadré daté `Synthèse générée le 9 septembre · À vérifier par un RH`.
- Synthèse prudente expliquant que les éléments doivent être vérifiés par un recruteur.
- Matrice `Critère / Éléments relevés dans le dossier / Niveau de confiance` pour JavaScript/TypeScript, APIs REST et communication écrite.
- Encadré `Informations à clarifier`, notamment expérience à distance et disponibilité.
- Message permanent : l'IA analyse des éléments fournis et ne remplace pas l'évaluation humaine.

### Règles fonctionnelles

- Chaque élément relevé doit renvoyer vers un extrait ou une référence vérifiable du dossier. L'IA ne peut pas compléter une expérience absente.
- Le niveau de confiance exprime uniquement la fiabilité de l'extraction ; il ne mesure ni l'adéquation, ni la valeur, ni la probabilité d'embauche d'une personne.
- Sont conservés pour audit : date, état, version des critères, version du système d'analyse et références de sources. Aucun secret ne doit être enregistré dans le dossier.
- Aucun score final, rang, recommandation prescriptive, ni bouton `Accepter`, `Rejeter`, `Éliminer` ou équivalent ne peut apparaître.

## Écran 5 — Onglet Activité

### Éléments visibles à livrer

- Chronologie ordonnée : dépôt de candidature, consultation RH, analyse IA disponible, note ajoutée, entretien proposé.
- Actions `Ajouter une note`, `Planifier un entretien`, `Marquer comme examiné`.

### Règles fonctionnelles

- Chaque événement indique sa date, son heure, son auteur ou système et une description explicite.
- `Marquer comme examiné` est une action manuelle : elle met à jour l'étape et le journal, sans envoyer d'e-mail.
- `Planifier un entretien` crée une action ou un brouillon. Sans intégration de calendrier validée, elle ne doit générer aucune invitation externe.

## Critères de recette

- Un utilisateur non authentifié ou non autorisé ne peut obtenir ni document, ni analyse, ni activité par URL directe.
- Le lecteur d'écran annonce la sélection, l'onglet actif, les erreurs et les changements d'étape.
- Les filtres ne mélangent jamais des données provenant de dossiers distincts, y compris après pagination ou actualisation.
- L'analyse IA reste consultative dans tous les états, exportations et libellés.
