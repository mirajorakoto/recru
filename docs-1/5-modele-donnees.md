# Modèle de données

Le module préfixe toutes ses tables par `recruitment_` et utilise les clés étrangères de la connexion SQLite partagée.

- `recruitment_jobs`: offre, publication, critères, employeur, identité email et référence média.
- `recruitment_applications`: identité minimale, états de traitement, décision humaine et analyse JSON.
- `recruitment_files`: métadonnées des documents chiffrés AES-256-GCM; aucun contenu binaire en base.
- `recruitment_emails`: brouillon envoyé, état SMTP et clé d’idempotence unique.
- `recruitment_events`: journal des transitions importantes sans recopier le contenu des CV.
- `recruitment_migrations`: version du schéma du module.

## États

```text
Traitement: received -> queued -> processing -> analysis_ready | analysis_failed
Décision RH: to_review -> selected | rejected | withdrawn
Email: sending -> sent | failed
Offre: draft -> published -> closed -> archived
```

Les états IA et RH sont volontairement indépendants. Aucune colonne calculée par IA ne peut modifier `hr_decision`.

## Conservation

Une purge supprime candidatures, fichiers et emails 180 jours après `closed_at`. Les rapports après purge doivent être agrégés et anonymes.
