# Recette de livraison

## Automatisée

- migrations exécutables deux fois sans erreur;
- brouillons invisibles publiquement et slugs uniques;
- `401` sur toutes les routes RH sans middleware de session valide;
- CV obligatoire; PDF/DOCX valides acceptés; faux PDF, DOCM, macro et dépassement refusés;
- documents chiffrés illisibles sur disque et téléchargeables seulement via la route RH;
- analyse relançable après erreur et reprise d’un traitement abandonné;
- schéma IA sans décision finale et documents explicitement traités comme données non fiables;
- HTML email nettoyé et clé d’idempotence empêchant deux envois;
- purge après 180 jours;
- builds public, admin et banc d’essai réussis.

## Manuelle

- responsive 320 px, tablette et bureau;
- parcours clavier, labels, focus et messages d’erreur;
- route directe sur chaque URL publique et sur le cockpit;
- vraie session `/admin` réutilisée sans second login;
- rendu réel d’un email de test HTML/texte dans une boîte contrôlée;
- affichage constant de l’avertissement « analyse IA à vérifier »;
- consentement et notice juridique validés par TechZone/CMIL.

## Interdictions de recette

Ne jamais utiliser le CV d’une personne réelle pour un smoke test, committer une sortie OpenAI contenant des données personnelles ou envoyer un email à un candidat pendant la recette.
