# Sécurité, confidentialité et IA

## Menaces traitées

- upload déguisé: extension, signature PDF et structure DOCX sont vérifiées;
- macro Office et archive compressée abusive: rejet des macros, chemins dangereux et DOCX décompressé supérieur à 30 Mo;
- exposition documentaire: chiffrement AES-256-GCM, noms UUID, mode `0600`, téléchargement admin forcé;
- abus public et coûts IA: Turnstile, rate limit et traitement asynchrone;
- prompt injection dans un CV: documents marqués comme données non fiables, aucun outil, sortie JSON stricte;
- biais: critères explicites uniquement, attributs sensibles interdits, décision humaine séparée;
- double email: insertion atomique d’une clé d’idempotence avant SMTP.

## OpenAI

Le modèle par défaut est `gpt-5.4-nano-2026-03-17`. Les requêtes utilisent Responses API, `store:false`, fichiers inline et Structured Outputs. Aucun fichier n’est créé via `/v1/files`.

`store:false` ne signifie pas absence totale de conservation: les journaux de contrôle OpenAI peuvent conserver du contenu jusqu’à 30 jours sans dispositif ZDR approuvé. Cette information doit rester visible dans la notice candidat.

L’analyse contient seulement résumé, matrice critère/preuve, informations absentes, incertitudes et recommandation à vérifier. Elle ne contient aucun champ `accepted`, `rejected` ou équivalent.

## Loi malgache et CMIL

La loi n°2014-038 interdit qu’une décision privée appréciant un comportement humain repose uniquement sur un profilage automatisé. Elle impose notamment sécurité, information, encadrement du transfert international, droits d’accès/rectification/opposition, durée définie et déclaration préalable du traitement.

Le code facilite ces obligations mais ne constitue pas une validation juridique. Le responsable TechZone doit tenir le registre, désigner le contact compétent et obtenir la validation/formalité CMIL avant mise en service.

## Rotation des secrets

- Générer `RECRUITMENT_FILE_KEY` avec 32 octets aléatoires encodés en base64.
- Stocker les secrets uniquement dans le fichier d’environnement serveur mode `0600` ou un gestionnaire de secrets.
- Documenter toute rotation: les anciens documents doivent être rechiffrés avant retrait de l’ancienne clé.
- Ne jamais réutiliser la clé SSH précédemment suivie dans le dépôt principal; elle doit être révoquée côté serveur.
