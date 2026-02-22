#!/bin/bash
set -uo pipefail

# =============================================================================
# E2E Tests for: n2o init
# Pure bash — no external test frameworks required.
# Usage: bash tests/test-n2o-init.sh
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
# Test harness
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

  # Run in subshell with set -e so first assertion failure exits the subshell
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
      grep "ASSERT FAILED" "$err_file" | head -1 | sed 's/^/    /'
    fi
    ((FAIL++)) || true
    FAILED_TESTS+=("$name")
  fi
  rm -f "$err_file"
}

# Assertions

assert_dir_exists() {
  local path="$1"
  local msg="${2:-Directory should exist: $path}"
  if [[ ! -d "$path" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_file_exists() {
  local path="$1"
  local msg="${2:-File should exist: $path}"
  if [[ ! -f "$path" ]]; then
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

assert_file_not_contains() {
  local path="$1"
  local pattern="$2"
  local msg="${3:-File $path should NOT contain: $pattern}"
  if grep -qF "$pattern" "$path" 2>/dev/null; then
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

assert_file_executable() {
  local path="$1"
  local msg="${2:-File should be executable: $path}"
  if [[ ! -x "$path" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_count() {
  local path="$1"
  local pattern="$2"
  local expected="$3"
  local msg="${4:-$path should contain '$pattern' exactly $expected time(s)}"
  local actual
  actual=$(grep -cF "$pattern" "$path" 2>/dev/null || echo "0")
  if [[ "$actual" -ne "$expected" ]]; then
    echo "    ASSERT FAILED: $msg (got $actual)" >&2
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

assert_sqlite_view_exists() {
  local db="$1"
  local view="$2"
  local msg="${3:-View '$view' should exist in $db}"
  local result
  result=$(sqlite3 "$db" "SELECT name FROM sqlite_master WHERE type='view' AND name='$view';" 2>/dev/null)
  if [[ "$result" != "$view" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

# -----------------------------------------------------------------------------
# Tests
# -----------------------------------------------------------------------------

test_basic_init() {
  "$N2O" init "$TEST_DIR"

  # Directories
  assert_dir_exists "$TEST_DIR/.pm"
  assert_dir_exists "$TEST_DIR/.pm/todo"
  assert_dir_exists "$TEST_DIR/.wm"
  assert_dir_exists "$TEST_DIR/.claude"
  assert_dir_exists "$TEST_DIR/.claude/skills"
  assert_dir_exists "$TEST_DIR/scripts"
  assert_dir_exists "$TEST_DIR/scripts/git"

  # Framework files
  assert_file_exists "$TEST_DIR/.pm/schema.sql"
  assert_dir_exists "$TEST_DIR/.claude/skills/pm-agent"
  assert_dir_exists "$TEST_DIR/.claude/skills/tdd-agent"
  assert_dir_exists "$TEST_DIR/.claude/skills/bug-workflow"

  # Scaffolded files
  assert_file_exists "$TEST_DIR/.pm/config.json"
  assert_file_exists "$TEST_DIR/CLAUDE.md"
  assert_file_exists "$TEST_DIR/.pm/schema-extensions.sql"

  # Database
  assert_file_exists "$TEST_DIR/.pm/tasks.db"

  # Gitignore
  assert_file_exists "$TEST_DIR/.gitignore"
  assert_file_contains "$TEST_DIR/.gitignore" ".pm/tasks.db"
  assert_file_contains "$TEST_DIR/.gitignore" ".wm/"
  assert_file_contains "$TEST_DIR/.gitignore" ".env.local"
  assert_file_contains "$TEST_DIR/.gitignore" ".n2o-backup/"

  # Config helper
  assert_file_exists "$TEST_DIR/scripts/n2o-config.sh"
  assert_file_executable "$TEST_DIR/scripts/n2o-config.sh"

  # Version
  assert_json_field "$TEST_DIR/.pm/config.json" ".n2o_version" "1.0.0"
}

test_node_detection() {
  # Set up a Node.js project with pnpm
  cat > "$TEST_DIR/package.json" <<'EOF'
{
  "name": "test-project",
  "scripts": {
    "test": "vitest",
    "lint": "eslint .",
    "build": "next build"
  }
}
EOF
  touch "$TEST_DIR/pnpm-lock.yaml"

  "$N2O" init "$TEST_DIR"

  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.test" "pnpm test"
  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.lint" "pnpm lint"
  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.build" "pnpm build"

  # Project name should be the directory basename
  local expected_name
  expected_name=$(basename "$TEST_DIR")
  assert_json_field "$TEST_DIR/.pm/config.json" ".project_name" "$expected_name"
}

test_rust_detection() {
  touch "$TEST_DIR/Cargo.toml"

  "$N2O" init "$TEST_DIR"

  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.test" "cargo test"
  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.build" "cargo build"
  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.lint" "cargo clippy"
}

test_python_detection() {
  touch "$TEST_DIR/pyproject.toml"

  "$N2O" init "$TEST_DIR"

  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.test" "pytest"
  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.lint" "ruff check"
}

test_go_detection() {
  # go.mod needs content to be a valid file marker
  echo "module example.com/test" > "$TEST_DIR/go.mod"

  "$N2O" init "$TEST_DIR"

  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.test" "go test ./..."
  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.build" "go build ./..."
  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.lint" "golangci-lint run"
}

test_unknown_project() {
  # Empty directory — no project markers
  "$N2O" init "$TEST_DIR"

  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.test" ""
  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.typecheck" ""
  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.lint" ""
  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.build" ""
}

test_idempotency() {
  # First init
  "$N2O" init "$TEST_DIR"

  # Customize project files
  echo "CUSTOM CONTENT" > "$TEST_DIR/CLAUDE.md"
  local tmp
  tmp=$(mktemp)
  jq '.project_name = "my-custom-name"' "$TEST_DIR/.pm/config.json" > "$tmp"
  mv "$tmp" "$TEST_DIR/.pm/config.json"

  # Record tasks.db modification time
  local db_mtime
  db_mtime=$(stat -f "%m" "$TEST_DIR/.pm/tasks.db" 2>/dev/null || stat -c "%Y" "$TEST_DIR/.pm/tasks.db" 2>/dev/null)

  # Re-init (pipe 'y' to the "continue anyway?" prompt)
  echo "y" | "$N2O" init "$TEST_DIR"

  # Project files should NOT be overwritten
  assert_file_contains "$TEST_DIR/CLAUDE.md" "CUSTOM CONTENT"
  assert_json_field "$TEST_DIR/.pm/config.json" ".project_name" "my-custom-name"

  # Database should still exist
  assert_file_exists "$TEST_DIR/.pm/tasks.db"
}

test_database_integrity() {
  "$N2O" init "$TEST_DIR"

  local db="$TEST_DIR/.pm/tasks.db"

  # Tables
  assert_sqlite_table_exists "$db" "tasks"
  assert_sqlite_table_exists "$db" "developers"
  assert_sqlite_table_exists "$db" "task_dependencies"

  # Views
  assert_sqlite_view_exists "$db" "available_tasks"
  assert_sqlite_view_exists "$db" "sprint_progress"
  assert_sqlite_view_exists "$db" "blocked_tasks"

  # Round-trip: insert a task, read it back
  sqlite3 "$db" "INSERT INTO tasks (sprint, task_num, title, type, status) VALUES ('test-sprint', 1, 'Test task', 'frontend', 'pending');"
  local title
  title=$(sqlite3 "$db" "SELECT title FROM tasks WHERE sprint='test-sprint' AND task_num=1;")
  if [[ "$title" != "Test task" ]]; then
    echo "    ASSERT FAILED: INSERT/SELECT round-trip failed (got '$title')" >&2
    return 1
  fi
}

test_claude_md_template_filling() {
  cat > "$TEST_DIR/package.json" <<'EOF'
{
  "name": "my-app",
  "scripts": {
    "test": "vitest",
    "lint": "eslint ."
  }
}
EOF
  touch "$TEST_DIR/pnpm-lock.yaml"

  "$N2O" init "$TEST_DIR"

  # Should NOT contain raw template placeholders
  assert_file_not_contains "$TEST_DIR/CLAUDE.md" "{{test_command}}"
  assert_file_not_contains "$TEST_DIR/CLAUDE.md" "{{lint_command}}"
  assert_file_not_contains "$TEST_DIR/CLAUDE.md" "{{project_name}}"

  # Should contain the actual values
  assert_file_contains "$TEST_DIR/CLAUDE.md" "pnpm test"
  assert_file_contains "$TEST_DIR/CLAUDE.md" "pnpm lint"
}

test_register_flag() {
  # Back up existing projects file if present
  local backup=""
  if [[ -f "$N2O_DIR/.n2o-projects.json" ]]; then
    backup=$(mktemp)
    cp "$N2O_DIR/.n2o-projects.json" "$backup"
  fi

  "$N2O" init "$TEST_DIR" --register

  assert_file_exists "$N2O_DIR/.n2o-projects.json"

  # Resolve TEST_DIR the same way n2o does
  local resolved_path
  resolved_path=$(cd "$TEST_DIR" && pwd)
  local found
  found=$(jq -r --arg p "$resolved_path" '.projects | index($p) // -1' "$N2O_DIR/.n2o-projects.json")
  if [[ "$found" == "-1" ]]; then
    echo "    ASSERT FAILED: Project path not found in .n2o-projects.json" >&2
    # Restore backup
    if [[ -n "$backup" ]]; then
      mv "$backup" "$N2O_DIR/.n2o-projects.json"
    else
      rm -f "$N2O_DIR/.n2o-projects.json"
    fi
    return 1
  fi

  # Clean up: restore original projects file
  if [[ -n "$backup" ]]; then
    mv "$backup" "$N2O_DIR/.n2o-projects.json"
  else
    rm -f "$N2O_DIR/.n2o-projects.json"
  fi
}

test_gitignore_no_duplicates() {
  # Pre-create a .gitignore with one entry already present
  echo ".pm/tasks.db" > "$TEST_DIR/.gitignore"

  "$N2O" init "$TEST_DIR"

  # .pm/tasks.db should appear exactly once
  assert_count "$TEST_DIR/.gitignore" ".pm/tasks.db" 1

  # The other entries should be present
  assert_file_contains "$TEST_DIR/.gitignore" ".wm/"
  assert_file_contains "$TEST_DIR/.gitignore" ".env.local"
  assert_file_contains "$TEST_DIR/.gitignore" ".n2o-backup/"
}

test_package_manager_detection() {
  local pkg_json='{"name":"test","scripts":{"test":"jest"}}'

  # pnpm
  echo "$pkg_json" > "$TEST_DIR/package.json"
  touch "$TEST_DIR/pnpm-lock.yaml"
  "$N2O" init "$TEST_DIR"
  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.test" "pnpm test"
  teardown && setup

  # yarn
  echo "$pkg_json" > "$TEST_DIR/package.json"
  touch "$TEST_DIR/yarn.lock"
  "$N2O" init "$TEST_DIR"
  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.test" "yarn test"
  teardown && setup

  # bun
  echo "$pkg_json" > "$TEST_DIR/package.json"
  touch "$TEST_DIR/bun.lockb"
  "$N2O" init "$TEST_DIR"
  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.test" "bun test"
  teardown && setup

  # npm (no lockfile)
  echo "$pkg_json" > "$TEST_DIR/package.json"
  "$N2O" init "$TEST_DIR"
  assert_json_field "$TEST_DIR/.pm/config.json" ".commands.test" "npm test"
}

test_scripts_executable() {
  "$N2O" init "$TEST_DIR"

  # Find all .sh files in scripts/ and verify they're executable
  local non_exec=0
  while IFS= read -r script; do
    if [[ ! -x "$script" ]]; then
      echo "    ASSERT FAILED: Not executable: $script" >&2
      non_exec=1
    fi
  done < <(find "$TEST_DIR/scripts" -name "*.sh" -type f)

  return $non_exec
}

# -----------------------------------------------------------------------------
# Run all tests
# -----------------------------------------------------------------------------

echo ""
echo -e "${BOLD}N2O Init — E2E Tests${NC}"
echo -e "${BOLD}====================${NC}"
echo ""

run_test "Basic init on empty directory"       test_basic_init
run_test "Node.js project detection"           test_node_detection
run_test "Rust project detection"              test_rust_detection
run_test "Python project detection"            test_python_detection
run_test "Go project detection"                test_go_detection
run_test "Unknown project type"                test_unknown_project
run_test "Idempotency — re-init skips files"   test_idempotency
run_test "Database integrity"                  test_database_integrity
run_test "CLAUDE.md template filling"          test_claude_md_template_filling
run_test "Register flag"                       test_register_flag
run_test "Gitignore no duplicates"             test_gitignore_no_duplicates
run_test "Package manager detection"           test_package_manager_detection
run_test "Scripts are executable"              test_scripts_executable

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
