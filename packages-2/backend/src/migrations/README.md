# Migrations SQLite

## Ajouter une nouvelle migration
1. Créez un nouveau fichier SQL dans ce dossier en respectant la nomenclature : `XXX_nom_de_la_migration.sql` (ex: `002_add_user_table.sql`).
2. Le numéro `XXX` détermine l'ordre d'exécution et la version enregistrée dans la base.
3. Écrivez vos instructions SQL (CREATE, ALTER, INSERT).
4. Redémarrez l'application ou lancez les tests : le runner appliquera automatiquement la migration dans une transaction.

## Retour arrière (Rollback) opérationnel
SQLite ne supporte pas nativement les rollbacks automatiques complexes comme PostgreSQL.
En cas d'erreur sur une migration déployée :
1. **Ne modifiez jamais** une migration déjà appliquée en production.
2. Créez une **nouvelle migration** (ex: `003_revert_002.sql`) qui annule les changements de la précédente (ex: `DROP TABLE`, ou recréation de l'ancienne structure).
3. Si la migration a échoué en cours de route (ex: erreur de syntaxe), le runner a automatiquement fait un `ROLLBACK` de la transaction. La base est restée propre, vous pouvez corriger le fichier SQL et relancer.

## Extensions du cahier des charges (colonnes et tables ajoutées)
Les colonnes et tables du cahier des charges (offres enrichies, pipeline, score, comptes candidats, personnel RH,
entretiens, évaluations, notifications, compétences indexées, paramètres) sont créées par
`src/schema.js` (`ensureRecruitmentSchema`), appelé automatiquement par `createRepository()` **avant** toute requête SQL.
Elle est idempotente (CREATE IF NOT EXISTS + ALTER TABLE gardé par PRAGMA table_info) : une base existante est mise
à niveau au démarrage, sans migration numérotée. Ne rajoutez donc pas ces colonnes dans une migration `.sql`
(erreur « duplicate column »).
