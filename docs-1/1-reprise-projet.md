# Mandat de reprise du projet

## Pourquoi ce dépôt existe déjà

Le projet ne démarre pas d'une page blanche. Ce dépôt a été préparé pour matérialiser le besoin, valider les principaux parcours et fournir un socle exécutable au développeur qui en reprend la responsabilité.

Il permet notamment de:

- transmettre les exigences métier et les contraintes non négociables dans un support versionné;
- fournir une référence fonctionnelle testable plutôt que de simples maquettes ou descriptions;
- conserver les contrats d'API, le modèle de données et les points d'intégration déjà identifiés;
- réduire le temps consacré à reconstruire des décisions déjà prises;
- rendre les évolutions, arbitrages et validations traçables dans Git.

Le code existant doit donc être considéré comme un point de départ utile, pas comme une solution imposée ni comme une spécification parfaite.

## Responsabilité confiée au développeur

Le développeur reprend la responsabilité technique du produit. Il est attendu qu'il:

- audite le socle avant de poursuivre son développement;
- signale les incohérences, risques, dettes techniques ou exigences insuffisamment définies;
- propose les arbitrages nécessaires au lieu de reproduire aveuglément l'existant;
- développe, teste, documente et prépare l'intégration du produit;
- maintienne une branche et un historique de commits compréhensibles;
- livre un résultat exploitable, maintenable et vérifiable.

Il dispose d'une autonomie de conception et d'exécution. Il peut refactoriser, remplacer ou réorganiser une partie du socle lorsqu'une autre approche améliore clairement la qualité, la sécurité, la maintenabilité ou l'intégration. Toute modification structurante doit cependant être expliquée, couverte par des vérifications adaptées et rester conforme au cahier des charges.

## Cadre de décision

La méthode d'implémentation appartient au développeur. Les résultats attendus sont définis par:

- les parcours et règles de `2-cahier-des-charges.md`;
- les exigences de `3-securite-confidentialite-ia.md`;
- les contrats d'intégration de `6-openapi.yaml` et `7-integration-techzone.md`;
- les critères de livraison de `9-recette-livraison.md`.

En cas de contradiction, d'ambiguïté ou de décision ayant un impact important sur le périmètre, la sécurité, les données personnelles, le délai ou le coût, le développeur doit demander un arbitrage avant d'engager le changement.

## Livrables attendus

La reprise est considérée comme aboutie lorsque les éléments suivants sont disponibles:

1. un parcours candidat responsive et accessible, prêt à être intégré;
2. un cockpit RH sécurisé, réutilisant l'authentification administrative existante;
3. un backend, des migrations et des traitements asynchrones fonctionnels;
4. une intégration documentée et reproductible dans l'environnement TechZone;
5. des tests automatisés et une recette manuelle couvrant les risques principaux;
6. une documentation à jour pour l'exploitation, la sécurité et la maintenance;
7. une liste explicite des limites connues, décisions restantes et risques résiduels.

Une fonctionnalité n'est pas considérée comme livrée parce qu'elle fonctionne uniquement dans le banc d'essai local. Elle doit satisfaire les critères de recette, être intégrable dans TechZone et ne pas introduire de régression connue sur la sécurité, la confidentialité ou les parcours existants.

## Communication de reprise

Le premier retour attendu du développeur est un diagnostic court comprenant:

- sa compréhension du produit et du périmètre;
- l'état du socle après installation et exécution des vérifications;
- les écarts ou risques identifiés;
- son plan de réalisation par jalons;
- les décisions qui nécessitent un arbitrage.

L'objectif n'est pas de lui imposer la manière de construire le produit. L'objectif est de lui transmettre un cadre fiable, de lui donner la latitude nécessaire pour prendre de bonnes décisions techniques et d'évaluer la mission sur la qualité des livrables finis.
