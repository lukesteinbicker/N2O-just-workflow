-- Schema Migrations sprint tasks
-- Load with: sqlite3 .pm/tasks.db < .pm/todo/schema-migrations/tasks.sql

INSERT OR IGNORE INTO tasks (sprint, spec, task_num, title, type, skills, estimated_minutes, complexity, complexity_notes, done_when, description) VALUES
('schema-migrations', '01-schema-migrations.md', 1,
 'Add _migrations table and migration directory infrastructure',
 'infra', 'database',
 90, 'low', NULL,
 '_migrations table in schema.sql, .pm/migrations/ directory exists, n2o-manifest.json updated to include migrations in framework_files, existing tests still pass',
 'Foundation task: Add the _migrations tracking table to schema.sql (CREATE TABLE IF NOT EXISTS _migrations with id, name, applied_at, framework_version, checksum columns). Create the .pm/migrations/ directory. Update n2o-manifest.json to include ".pm/migrations/**" in framework_files and add ".pm/migrations" to directory_structure. Run existing tests to verify nothing breaks.');

INSERT OR IGNORE INTO tasks (sprint, spec, task_num, title, type, skills, estimated_minutes, complexity, complexity_notes, done_when, description) VALUES
('schema-migrations', '01-schema-migrations.md', 2,
 'Implement migration apply logic in n2o CLI (migrate --apply, sync integration, init integration)',
 'infra', 'bash',
 180, 'medium', 'Core migration logic, must handle edge cases: empty migrations dir, already-applied migrations, multiple pending migrations',
 'n2o migrate --apply runs pending migrations in order and records them in _migrations; n2o sync auto-applies pending migrations when schema.sql changes (replacing the current re-run-schema approach); n2o init marks all existing migrations as applied after creating fresh db; all three pathways tested manually',
 'Implement the core migration apply logic as a function in the n2o script:

1. apply_migrations() function:
   - List .pm/migrations/*.sql files sorted numerically
   - Query _migrations table for already-applied names
   - For each unapplied migration: run it against tasks.db, insert record into _migrations with name, framework_version, and SHA256 checksum
   - Log each applied migration with log_success

2. Update cmd_init():
   - After creating tasks.db and running schema.sql, call seed_migrations() to mark all existing migration files as applied (the fresh schema already includes their changes)

3. Update sync_project():
   - Replace the current "re-run schema.sql" approach (lines 538-551) with apply_migrations()
   - Still sync the schema.sql file itself (for reference/new installs)
   - Still sync the migrations directory (framework_files)
   - schema-extensions.sql still re-applied after migrations

4. Add cmd_migrate():
   - n2o migrate --apply <project-path>: apply pending migrations
   - n2o migrate --status <project-path>: show applied/pending migrations

5. Update help text.');

INSERT OR IGNORE INTO tasks (sprint, spec, task_num, title, type, skills, estimated_minutes, complexity, complexity_notes, done_when, description) VALUES
('schema-migrations', '01-schema-migrations.md', 3,
 'Implement migration auto-generation (n2o migrate --generate)',
 'infra', 'bash',
 180, 'high', 'Parsing SQL CREATE TABLE statements and diffing column lists is non-trivial; need to handle types, defaults, constraints',
 'n2o migrate --generate diffs old vs new schema.sql and produces a correctly-numbered migration file; handles add column, drop column, new table, new view, new index; output file is valid SQL that can be applied',
 'Implement schema diff logic for auto-generating migrations:

1. Add generate_migration() function to n2o:
   - Takes two schema.sql files (old from backup or git, new from current)
   - Parses CREATE TABLE statements to extract table name and column definitions
   - Compares column lists per table: detect added columns, removed columns
   - Generates ALTER TABLE ADD COLUMN for new columns (including type, default, constraints)
   - Generates ALTER TABLE DROP COLUMN for removed columns
   - Detects entirely new tables → output full CREATE TABLE IF NOT EXISTS
   - Detects new/changed views → output DROP VIEW IF EXISTS + CREATE VIEW
   - Detects new indexes → output CREATE INDEX IF NOT EXISTS
   - Detects new triggers → output full trigger SQL
   - Writes output to next-numbered migration file in .pm/migrations/

2. Add cmd_migrate --generate:
   - If .n2o-backup/ has a previous schema.sql, use that as "old"
   - Otherwise, compare against git HEAD version: git show HEAD:.pm/schema.sql
   - Output the generated file path and print its contents for review
   - Log warning: "Review this migration before committing"

3. Handle edge cases:
   - Column with CHECK constraints (preserve constraint text)
   - Column with DEFAULT values
   - No changes detected → log info and exit without creating file');

INSERT OR IGNORE INTO tasks (sprint, spec, task_num, title, type, skills, estimated_minutes, complexity, complexity_notes, done_when, description) VALUES
('schema-migrations', '01-schema-migrations.md', 4,
 'E2E tests for migration workflows',
 'e2e', 'testing-e2e',
 150, 'medium', NULL,
 'All tests pass covering: fresh init marks migrations as applied, sync applies pending migrations preserving data, multi-version catch-up (skipping 2+ versions), generate produces correct SQL for add/drop column and new table, idempotency (re-running sync with no new migrations is a no-op)',
 'Write tests in tests/test-n2o-migrate.sh following the existing test harness pattern (tests/test-n2o-init.sh):

Test cases:
1. test_fresh_init_marks_migrations_applied: n2o init with migration files present → _migrations table has all entries
2. test_sync_applies_pending_migration: init project, add new migration file, run sync → migration applied, data preserved
3. test_migration_preserves_data: insert task data, run migration that adds column → existing rows still intact
4. test_multi_version_catchup: init old project, add 3 migration files, sync → all 3 applied in order
5. test_sync_no_pending_is_noop: sync when all migrations applied → no changes, no errors
6. test_migrate_status: n2o migrate --status shows correct applied/pending counts
7. test_generate_add_column: modify schema.sql with new column, run generate → output has ALTER TABLE ADD COLUMN
8. test_generate_drop_column: remove column from schema.sql, run generate → output has ALTER TABLE DROP COLUMN
9. test_generate_new_table: add new table to schema.sql, run generate → output has CREATE TABLE
10. test_checksum_recorded: applied migrations have SHA256 checksums in _migrations table

Use the existing assert_* helpers plus add assert_sqlite_row_exists and assert_migration_applied helpers.');

-- Dependencies: task 2 depends on task 1, task 3 depends on task 1, task 4 depends on tasks 2 and 3
INSERT OR IGNORE INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('schema-migrations', 2, 'schema-migrations', 1),
('schema-migrations', 3, 'schema-migrations', 1),
('schema-migrations', 4, 'schema-migrations', 2),
('schema-migrations', 4, 'schema-migrations', 3);
