#!/bin/bash
set -uo pipefail

# =============================================================================
# E2E Tests for: n2o migrate (schema migrations)
# Pure bash — no external test frameworks required.
# Usage: bash tests/test-n2o-migrate.sh
# =============================================================================

N2O_DIR="$(cd "$(dirname "$0")/.." && pwd)"
N2O="$N2O_DIR/n2o"
PASS=0
FAIL=0
TOTAL=0
FAILED_TESTS=()

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

# -----------------------------------------------------------------------------
# Test harness (same pattern as test-n2o-init.sh)
# -----------------------------------------------------------------------------

TEST_DIR=""
CURRENT_TEST=""

setup() {
  TEST_DIR=$(mktemp -d)
}

teardown() {
  if [[ -n "$TEST_DIR" && -d "$TEST_DIR" ]]; then
    rm -rf "$TEST_DIR"
  fi
  TEST_DIR=""
}

run_test() {
  local name="$1"
  local func="$2"
  CURRENT_TEST="$name"
  ((TOTAL++)) || true

  setup
  local result=0
  local err_file
  err_file=$(mktemp)

  (
    set -e
    "$func"
  ) > /dev/null 2>"$err_file" || result=$?
  teardown

  if [[ $result -eq 0 ]]; then
    echo -e "  ${GREEN}PASS${NC}  $name"
    ((PASS++)) || true
  else
    echo -e "  ${RED}FAIL${NC}  $name"
    if [[ -s "$err_file" ]]; then
      grep "ASSERT FAILED" "$err_file" | head -3 | sed 's/^/    /'
    fi
    ((FAIL++)) || true
    FAILED_TESTS+=("$name")
  fi
  rm -f "$err_file"
}

# Assertions (reuse same patterns)

assert_file_exists() {
  local path="$1"
  local msg="${2:-File should exist: $path}"
  if [[ ! -f "$path" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_dir_exists() {
  local path="$1"
  local msg="${2:-Directory should exist: $path}"
  if [[ ! -d "$path" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_sqlite_table_exists() {
  local db="$1"
  local table="$2"
  local msg="${3:-Table '$table' should exist in $db}"
  local result
  result=$(sqlite3 "$db" "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';" 2>/dev/null)
  if [[ "$result" != "$table" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_sqlite_column_exists() {
  local db="$1"
  local table="$2"
  local column="$3"
  local msg="${4:-Column '$column' should exist in table '$table'}"
  local result
  result=$(sqlite3 "$db" "SELECT COUNT(*) FROM pragma_table_info('$table') WHERE name='$column';" 2>/dev/null)
  if [[ "$result" != "1" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_json_field() {
  local path="$1"
  local field="$2"
  local expected="$3"
  local msg="${4:-$path: .$field should be '$expected'}"
  local actual
  actual=$(jq -r "$field" "$path" 2>/dev/null)
  if [[ "$actual" != "$expected" ]]; then
    echo "    ASSERT FAILED: $msg (got '$actual')" >&2
    return 1
  fi
}

assert_json_array_contains() {
  local path="$1"
  local field="$2"
  local value="$3"
  local msg="${4:-$path: $field should contain '$value'}"
  local found
  found=$(jq -e --arg v "$value" "$field | index(\$v)" "$path" 2>/dev/null)
  if [[ -z "$found" || "$found" == "null" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_file_contains() {
  local path="$1"
  local pattern="$2"
  local msg="${3:-File $path should contain: $pattern}"
  if ! grep -qF "$pattern" "$path" 2>/dev/null; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

# -----------------------------------------------------------------------------
# Task 1 Tests: Infrastructure (table, directory, manifest)
# -----------------------------------------------------------------------------

test_schema_has_migrations_table() {
  # Create a fresh database from schema.sql and verify _migrations table exists
  local db="$TEST_DIR/test.db"
  sqlite3 "$db" < "$N2O_DIR/.pm/schema.sql"

  assert_sqlite_table_exists "$db" "_migrations"
}

test_migrations_table_has_required_columns() {
  local db="$TEST_DIR/test.db"
  sqlite3 "$db" < "$N2O_DIR/.pm/schema.sql"

  assert_sqlite_column_exists "$db" "_migrations" "id"
  assert_sqlite_column_exists "$db" "_migrations" "name"
  assert_sqlite_column_exists "$db" "_migrations" "applied_at"
  assert_sqlite_column_exists "$db" "_migrations" "framework_version"
  assert_sqlite_column_exists "$db" "_migrations" "checksum"
}

test_migrations_table_name_is_unique() {
  # Inserting duplicate migration name should fail
  local db="$TEST_DIR/test.db"
  sqlite3 "$db" < "$N2O_DIR/.pm/schema.sql"

  sqlite3 "$db" "INSERT INTO _migrations (name, framework_version) VALUES ('001-test', '1.0.0');"
  local result
  result=$(sqlite3 "$db" "INSERT INTO _migrations (name, framework_version) VALUES ('001-test', '1.0.0');" 2>&1 || true)
  if [[ "$result" != *"UNIQUE"* ]]; then
    echo "    ASSERT FAILED: Duplicate migration name should fail with UNIQUE constraint" >&2
    return 1
  fi
}

test_migrations_directory_exists() {
  assert_dir_exists "$N2O_DIR/.pm/migrations"
}

test_manifest_includes_migrations_in_framework_files() {
  assert_json_array_contains "$N2O_DIR/n2o-manifest.json" ".framework_files" ".pm/migrations/**"
}

test_manifest_includes_migrations_in_directory_structure() {
  assert_json_array_contains "$N2O_DIR/n2o-manifest.json" ".directory_structure" ".pm/migrations"
}

test_init_creates_migrations_directory() {
  # n2o init should create .pm/migrations/ in the target project
  "$N2O" init "$TEST_DIR"

  assert_dir_exists "$TEST_DIR/.pm/migrations"
}

test_init_creates_migrations_table_in_db() {
  # n2o init should create tasks.db with _migrations table
  "$N2O" init "$TEST_DIR"

  assert_sqlite_table_exists "$TEST_DIR/.pm/tasks.db" "_migrations"
}

test_existing_init_tests_still_pass() {
  # Verify adding _migrations doesn't break existing database integrity
  "$N2O" init "$TEST_DIR"

  local db="$TEST_DIR/.pm/tasks.db"

  # All original tables still exist
  assert_sqlite_table_exists "$db" "tasks"
  assert_sqlite_table_exists "$db" "developers"
  assert_sqlite_table_exists "$db" "task_dependencies"

  # Can still insert and read tasks (basic round-trip)
  sqlite3 "$db" "INSERT INTO tasks (sprint, task_num, title, type, status) VALUES ('test', 1, 'Test task', 'frontend', 'pending');"
  local title
  title=$(sqlite3 "$db" "SELECT title FROM tasks WHERE sprint='test' AND task_num=1;")
  if [[ "$title" != "Test task" ]]; then
    echo "    ASSERT FAILED: Task round-trip failed after schema change (got '$title')" >&2
    return 1
  fi
}

# -----------------------------------------------------------------------------
# Helpers for Task 2 tests
# -----------------------------------------------------------------------------

# Create a sample migration file in the framework's migrations directory
create_test_migration() {
  local name="$1"
  local sql="$2"
  echo "$sql" > "$N2O_DIR/.pm/migrations/${name}.sql"
}

# Clean up any test migration files we created in the framework dir
cleanup_test_migrations() {
  rm -f "$N2O_DIR/.pm/migrations"/0[0-9][0-9]-test-*.sql
}

assert_migration_applied() {
  local db="$1"
  local name="$2"
  local msg="${3:-Migration '$name' should be recorded in _migrations}"
  local result
  result=$(sqlite3 "$db" "SELECT COUNT(*) FROM _migrations WHERE name='$name';" 2>/dev/null)
  if [[ "$result" != "1" ]]; then
    echo "    ASSERT FAILED: $msg (found $result records)" >&2
    return 1
  fi
}

assert_migration_not_applied() {
  local db="$1"
  local name="$2"
  local msg="${3:-Migration '$name' should NOT be in _migrations}"
  local result
  result=$(sqlite3 "$db" "SELECT COUNT(*) FROM _migrations WHERE name='$name';" 2>/dev/null)
  if [[ "$result" != "0" ]]; then
    echo "    ASSERT FAILED: $msg (found $result records)" >&2
    return 1
  fi
}

assert_equals() {
  local expected="$1"
  local actual="$2"
  local msg="${3:-Expected '$expected' but got '$actual'}"
  if [[ "$expected" != "$actual" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

# -----------------------------------------------------------------------------
# Task 2 Tests: Migration apply logic
# -----------------------------------------------------------------------------

test_init_seeds_existing_migrations() {
  # When migration files exist in the framework, n2o init should record them
  # as already applied (since the fresh schema already includes their changes)
  create_test_migration "001-test-seed" "-- no-op for testing"
  create_test_migration "002-test-seed" "-- no-op for testing"

  "$N2O" init "$TEST_DIR"

  assert_migration_applied "$TEST_DIR/.pm/tasks.db" "001-test-seed"
  assert_migration_applied "$TEST_DIR/.pm/tasks.db" "002-test-seed"

  # Verify framework_version is recorded
  local ver
  ver=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT framework_version FROM _migrations WHERE name='001-test-seed';")
  assert_equals "1.0.0" "$ver" "Migration should record framework version"

  # Verify checksum is recorded (non-empty)
  local checksum
  checksum=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT checksum FROM _migrations WHERE name='001-test-seed';")
  if [[ -z "$checksum" ]]; then
    echo "    ASSERT FAILED: Migration should have a checksum recorded" >&2
    return 1
  fi

  cleanup_test_migrations
}

test_migrate_apply_runs_pending() {
  # Init a project with no migrations, then add a migration and apply it
  "$N2O" init "$TEST_DIR"

  # Create a migration that adds a column
  mkdir -p "$TEST_DIR/.pm/migrations"
  cat > "$TEST_DIR/.pm/migrations/001-test-add-col.sql" <<'SQL'
ALTER TABLE tasks ADD COLUMN test_migrate_col TEXT;
SQL

  # Apply migrations
  "$N2O" migrate --apply "$TEST_DIR"

  # Verify the column was added
  assert_sqlite_column_exists "$TEST_DIR/.pm/tasks.db" "tasks" "test_migrate_col"

  # Verify the migration was recorded
  assert_migration_applied "$TEST_DIR/.pm/tasks.db" "001-test-add-col"
}

test_migrate_apply_skips_already_applied() {
  "$N2O" init "$TEST_DIR"

  mkdir -p "$TEST_DIR/.pm/migrations"
  cat > "$TEST_DIR/.pm/migrations/001-test-skip.sql" <<'SQL'
ALTER TABLE tasks ADD COLUMN test_skip_col TEXT;
SQL

  # Apply once
  "$N2O" migrate --apply "$TEST_DIR"
  assert_migration_applied "$TEST_DIR/.pm/tasks.db" "001-test-skip"

  # Apply again — should not error (migration already applied, skipped)
  "$N2O" migrate --apply "$TEST_DIR"

  # Should still have exactly 1 record
  local count
  count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM _migrations WHERE name='001-test-skip';")
  assert_equals "1" "$count" "Migration should only be recorded once"
}

test_migrate_apply_runs_in_order() {
  "$N2O" init "$TEST_DIR"

  mkdir -p "$TEST_DIR/.pm/migrations"
  cat > "$TEST_DIR/.pm/migrations/001-test-order-a.sql" <<'SQL'
ALTER TABLE tasks ADD COLUMN order_col_a TEXT;
SQL
  cat > "$TEST_DIR/.pm/migrations/002-test-order-b.sql" <<'SQL'
ALTER TABLE tasks ADD COLUMN order_col_b TEXT;
SQL
  cat > "$TEST_DIR/.pm/migrations/003-test-order-c.sql" <<'SQL'
ALTER TABLE tasks ADD COLUMN order_col_c TEXT;
SQL

  "$N2O" migrate --apply "$TEST_DIR"

  # All three should be applied
  assert_migration_applied "$TEST_DIR/.pm/tasks.db" "001-test-order-a"
  assert_migration_applied "$TEST_DIR/.pm/tasks.db" "002-test-order-b"
  assert_migration_applied "$TEST_DIR/.pm/tasks.db" "003-test-order-c"

  # All three columns should exist
  assert_sqlite_column_exists "$TEST_DIR/.pm/tasks.db" "tasks" "order_col_a"
  assert_sqlite_column_exists "$TEST_DIR/.pm/tasks.db" "tasks" "order_col_b"
  assert_sqlite_column_exists "$TEST_DIR/.pm/tasks.db" "tasks" "order_col_c"

  # Verify ordering: applied_at of 001 <= 002 <= 003
  local order_ok
  order_ok=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "
    SELECT CASE WHEN
      (SELECT applied_at FROM _migrations WHERE name='001-test-order-a')
      <= (SELECT applied_at FROM _migrations WHERE name='003-test-order-c')
    THEN 'ok' ELSE 'wrong' END;
  ")
  assert_equals "ok" "$order_ok" "Migrations should be applied in numerical order"
}

test_migrate_apply_preserves_data() {
  "$N2O" init "$TEST_DIR"

  # Insert some data first
  sqlite3 "$TEST_DIR/.pm/tasks.db" "INSERT INTO tasks (sprint, task_num, title, status) VALUES ('test', 1, 'Existing task', 'pending');"

  # Create and apply a migration
  mkdir -p "$TEST_DIR/.pm/migrations"
  cat > "$TEST_DIR/.pm/migrations/001-test-preserve.sql" <<'SQL'
ALTER TABLE tasks ADD COLUMN preserve_test_col TEXT DEFAULT 'default_val';
SQL

  "$N2O" migrate --apply "$TEST_DIR"

  # Existing data should still be there
  local title
  title=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT title FROM tasks WHERE sprint='test' AND task_num=1;")
  assert_equals "Existing task" "$title" "Existing task data should survive migration"

  # New column should have default value on existing row
  local col_val
  col_val=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT preserve_test_col FROM tasks WHERE sprint='test' AND task_num=1;")
  assert_equals "default_val" "$col_val" "New column should have default value on existing rows"
}

test_migrate_status_shows_counts() {
  "$N2O" init "$TEST_DIR"

  mkdir -p "$TEST_DIR/.pm/migrations"
  cat > "$TEST_DIR/.pm/migrations/001-test-status.sql" <<'SQL'
ALTER TABLE tasks ADD COLUMN status_test_col TEXT;
SQL
  cat > "$TEST_DIR/.pm/migrations/002-test-status.sql" <<'SQL'
ALTER TABLE tasks ADD COLUMN status_test_col2 TEXT;
SQL

  # Apply only the first one
  sqlite3 "$TEST_DIR/.pm/tasks.db" "INSERT INTO _migrations (name, framework_version, checksum) VALUES ('001-test-status', '1.0.0', 'abc123');"

  # Status should show 1 applied, 1 pending
  local output
  output=$("$N2O" migrate --status "$TEST_DIR" 2>&1)

  if [[ "$output" != *"1"*"applied"* ]]; then
    echo "    ASSERT FAILED: Status should show applied migrations (got: $output)" >&2
    return 1
  fi
  if [[ "$output" != *"1"*"pending"* ]]; then
    echo "    ASSERT FAILED: Status should show pending migrations (got: $output)" >&2
    return 1
  fi
}

test_sync_applies_migrations() {
  # Init a project, then simulate a sync that brings new migrations
  "$N2O" init "$TEST_DIR"

  # Create a migration in the framework
  create_test_migration "001-test-sync" "ALTER TABLE tasks ADD COLUMN sync_test_col TEXT;"

  # Run sync (pipe 'y' to any prompts)
  echo "y" | "$N2O" sync "$TEST_DIR"

  # Migration file should be copied to project
  assert_file_exists "$TEST_DIR/.pm/migrations/001-test-sync.sql"

  # Migration should be applied
  assert_migration_applied "$TEST_DIR/.pm/tasks.db" "001-test-sync"

  # Column should exist
  assert_sqlite_column_exists "$TEST_DIR/.pm/tasks.db" "tasks" "sync_test_col"

  cleanup_test_migrations
}

test_sync_no_pending_is_noop() {
  # Init and sync with no new migrations — should not error
  "$N2O" init "$TEST_DIR"

  local before_count
  before_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM _migrations;")

  echo "y" | "$N2O" sync "$TEST_DIR"

  local after_count
  after_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM _migrations;")

  assert_equals "$before_count" "$after_count" "No new migrations should be applied when none are pending"
}

test_migrate_records_checksum() {
  "$N2O" init "$TEST_DIR"

  mkdir -p "$TEST_DIR/.pm/migrations"
  echo "ALTER TABLE tasks ADD COLUMN checksum_test_col TEXT;" > "$TEST_DIR/.pm/migrations/001-test-checksum.sql"

  "$N2O" migrate --apply "$TEST_DIR"

  local checksum
  checksum=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT checksum FROM _migrations WHERE name='001-test-checksum';")
  if [[ -z "$checksum" ]]; then
    echo "    ASSERT FAILED: Applied migration should have a SHA256 checksum" >&2
    return 1
  fi

  # Verify it's actually a SHA256 (64 hex chars)
  if [[ ! "$checksum" =~ ^[0-9a-f]{64}$ ]]; then
    echo "    ASSERT FAILED: Checksum should be SHA256 (64 hex chars), got '$checksum'" >&2
    return 1
  fi
}

test_help_shows_migrate_command() {
  local output
  output=$("$N2O" help 2>&1)

  if [[ "$output" != *"migrate"* ]]; then
    echo "    ASSERT FAILED: Help text should mention 'migrate' command" >&2
    return 1
  fi
}

# -----------------------------------------------------------------------------
# Run tests
# -----------------------------------------------------------------------------

echo ""
echo -e "${BOLD}N2O Migrate — E2E Tests${NC}"
echo -e "${BOLD}=======================${NC}"

echo ""
echo -e "${BOLD}Task 1: Infrastructure${NC}"
run_test "schema.sql creates _migrations table"              test_schema_has_migrations_table
run_test "_migrations table has required columns"             test_migrations_table_has_required_columns
run_test "_migrations name column has UNIQUE constraint"      test_migrations_table_name_is_unique
run_test ".pm/migrations/ directory exists in framework"      test_migrations_directory_exists
run_test "Manifest includes migrations in framework_files"    test_manifest_includes_migrations_in_framework_files
run_test "Manifest includes migrations in directory_structure" test_manifest_includes_migrations_in_directory_structure
run_test "n2o init creates .pm/migrations/ directory"         test_init_creates_migrations_directory
run_test "n2o init creates _migrations table in tasks.db"     test_init_creates_migrations_table_in_db
run_test "Existing init functionality still works"            test_existing_init_tests_still_pass

echo ""
echo -e "${BOLD}Task 2: Migration apply logic${NC}"
run_test "Init seeds existing migrations as applied"          test_init_seeds_existing_migrations
run_test "migrate --apply runs pending migrations"            test_migrate_apply_runs_pending
run_test "migrate --apply skips already-applied"              test_migrate_apply_skips_already_applied
run_test "migrate --apply runs in numerical order"            test_migrate_apply_runs_in_order
run_test "migrate --apply preserves existing data"            test_migrate_apply_preserves_data
run_test "migrate --status shows applied/pending counts"      test_migrate_status_shows_counts
run_test "sync copies and applies migrations"                 test_sync_applies_migrations
run_test "sync with no pending is a no-op"                    test_sync_no_pending_is_noop
run_test "Applied migrations have SHA256 checksum"            test_migrate_records_checksum
run_test "Help text mentions migrate command"                 test_help_shows_migrate_command

# Summary
echo ""
echo -e "${BOLD}Results: $PASS passed, $FAIL failed, $TOTAL total${NC}"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo -e "${RED}Failed tests:${NC}"
  for t in "${FAILED_TESTS[@]}"; do
    echo -e "  ${RED}-${NC} $t"
  done
  echo ""
  exit 1
fi

echo ""
echo -e "${GREEN}All tests passed.${NC}"
echo ""
