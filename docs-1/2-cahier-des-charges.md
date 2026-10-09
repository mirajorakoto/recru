# Cahier des charges fonctionnel

## Objectif

Livrer et intégrer dans TechZone un parcours public de recrutement ainsi qu'un cockpit RH sécurisé, à partir du socle existant dans ce dépôt.

Le dépôt constitue une base de reprise et non une solution figée. Le développeur peut faire évoluer l'architecture et l'implémentation lorsqu'il apporte une justification technique et maintient la compatibilité attendue avec TechZone. La conformité du produit fini aux parcours, aux règles non négociables et aux critères de recette prime sur la conservation à l'identique du code initial.

Le détail des huit écrans du cockpit RH représentés dans les maquettes est réparti en quatre cahiers :

- [Pilotage et offres](14-cahier-des-charges-pilotage-offres.md) ;
- [Candidatures et assistance IA](15-cahier-des-charges-candidatures-ia.md) ;
- [Pipeline et équipe RH](16-cahier-des-charges-pipeline-equipe.md) ;
- [Paramétrage, conformité et garde-fous IA](17-cahier-des-charges-parametrage-conformite.md).

Le [registre des comptes et identités de recette](18-comptes-de-recette.md)
définit les seules identités fictives nécessaires aux tests complets, sans
versionner de secret.

## Parcours candidat

1. Consulter uniquement les offres publiées et encore ouvertes.
2. Ouvrir une offre, lire son employeur, son contrat, son lieu et ses critères explicites.
3. Envoyer un CV PDF/DOCX obligatoire et, facultativement, une lettre de motivation.
4. Accepter une information distincte sur le traitement RH, l’assistance OpenAI, le partenaire éventuel, le transfert international et la conservation.
5. Recevoir une référence de dépôt sans pouvoir consulter l’analyse interne.

## Parcours RH

1. Utiliser la session existante de `/admin`; aucun compte ni jeton spécifique au module.
2. Créer, modifier, publier, clôturer ou archiver une offre.
3. Examiner les documents originaux et l’analyse IA présentée comme une aide non décisionnelle.
4. Enregistrer manuellement `à examiner`, `retenu`, `rejeté` ou `retiré`.
5. Après `retenu`, générer un brouillon d’email, l’éditer, le prévisualiser et confirmer son envoi.

## Règles non négociables

- L’IA n’accepte et ne rejette jamais un candidat.
- Aucun critère implicite ou sensible n’est extrait ou utilisé.
- Une offre ne peut être publiée sans au moins un critère objectif.
- Un clic sur « retenu » ne déclenche aucun email.
- Une même clé d’idempotence ne peut produire qu’un envoi.
- Les documents ne sont jamais servis par le répertoire public `/media`.

## Hors périmètre V1

Compte candidat, portail partenaire, vivier permanent, planification d’entretien, campagnes de refus et accès direct d’un partenaire au cockpit.
