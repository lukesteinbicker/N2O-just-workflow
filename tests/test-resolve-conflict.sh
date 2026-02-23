#!/bin/bash
set -uo pipefail

# =============================================================================
# E2E Tests for: scripts/coordination/resolve-conflict.sh
# Covers: import merging, disjoint additions, one-side-empty, escalation,
#         mixed hunks, multi-hunk files, integration with merge queue
# Pure bash — no external test frameworks required.
# Usage: bash tests/test-resolve-conflict.sh
# =============================================================================

N2O_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESOLVE_SCRIPT="$N2O_DIR/scripts/coordination/resolve-conflict.sh"
MERGE_QUEUE="$N2O_DIR/scripts/coordination/merge-queue.sh"
CREATE_SCRIPT="$N2O_DIR/scripts/coordination/create-worktree.sh"
SCHEMA="$N2O_DIR/.pm/schema.sql"
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
  TEST_DIR=$(cd "$(mktemp -d)" && pwd -P)
}

teardown() {
  if [[ -n "$TEST_DIR" && -d "$TEST_DIR" ]]; then
    # Clean up worktrees if this was a git test
    if [ -d "$TEST_DIR/.git" ]; then
      git -C "$TEST_DIR" worktree list --porcelain 2>/dev/null | grep "^worktree " | grep -v "$TEST_DIR$" | sed 's/^worktree //' | while read -r wt; do
        git -C "$TEST_DIR" worktree remove --force "$wt" 2>/dev/null || true
      done
    fi
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

# Assertions

assert_equals() {
  local expected="$1"
  local actual="$2"
  local msg="${3:-Expected '$expected', got '$actual'}"
  if [[ "$expected" != "$actual" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_not_equals() {
  local not_expected="$1"
  local actual="$2"
  local msg="${3:-Should not equal '$not_expected'}"
  if [[ "$not_expected" = "$actual" ]]; then
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

assert_output_contains() {
  local output="$1"
  local pattern="$2"
  local msg="${3:-Output should contain: $pattern}"
  if [[ "$output" != *"$pattern"* ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_output_not_contains() {
  local output="$1"
  local pattern="$2"
  local msg="${3:-Output should NOT contain: $pattern}"
  if [[ "$output" == *"$pattern"* ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

# Helper: create a file with conflict markers
write_conflict_file() {
  local path="$1"
  shift
  cat > "$path" <<< "$@"
}

# =============================================================================
# Tests: Import merge strategy
# =============================================================================

test_import_merge_js() {
  local f="$TEST_DIR/test.js"
  cat > "$f" <<'CONFLICT'
// app code
<<<<<<< HEAD
import { Button } from './Button';
import { Modal } from './Modal';
=======
import { Card } from './Card';
import { Badge } from './Badge';
>>>>>>> task/s-1
// rest of file
CONFLICT

  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "import { Button }" "Should keep ours import"
  assert_output_contains "$content" "import { Modal }" "Should keep ours import 2"
  assert_output_contains "$content" "import { Card }" "Should keep theirs import"
  assert_output_contains "$content" "import { Badge }" "Should keep theirs import 2"
  assert_output_not_contains "$content" "<<<<<<<" "Should have no conflict markers"
  assert_output_contains "$content" "// app code" "Should preserve surrounding content"
  assert_output_contains "$content" "// rest of file" "Should preserve surrounding content"
}

test_import_merge_python() {
  local f="$TEST_DIR/test.py"
  cat > "$f" <<'CONFLICT'
<<<<<<< HEAD
from flask import Flask, request
import os
=======
from flask import Flask, jsonify
import sys
>>>>>>> task/s-1
CONFLICT

  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "from flask import Flask, request" "Should keep ours"
  assert_output_contains "$content" "import os" "Should keep ours import"
  assert_output_contains "$content" "from flask import Flask, jsonify" "Should keep theirs"
  assert_output_contains "$content" "import sys" "Should keep theirs import"
  assert_output_not_contains "$content" "<<<<<<<" "Should have no conflict markers"
}

test_import_merge_deduplicates() {
  local f="$TEST_DIR/test.js"
  cat > "$f" <<'CONFLICT'
<<<<<<< HEAD
import { useState } from 'react';
import { Button } from './Button';
=======
import { useState } from 'react';
import { Card } from './Card';
>>>>>>> task/s-1
CONFLICT

  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null
  local content
  content=$(cat "$f")
  # Should have useState only once
  local count
  count=$(echo "$content" | grep -c "import { useState }")
  assert_equals "1" "$count" "Duplicate import should be deduplicated"
  assert_output_contains "$content" "import { Button }" "Should keep unique ours"
  assert_output_contains "$content" "import { Card }" "Should keep unique theirs"
}

test_import_merge_rust_use() {
  local f="$TEST_DIR/test.rs"
  cat > "$f" <<'CONFLICT'
<<<<<<< HEAD
use std::collections::HashMap;
use std::io::Read;
=======
use std::collections::BTreeMap;
use std::io::Write;
>>>>>>> task/s-1
CONFLICT

  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "use std::collections::HashMap;" "Should keep ours"
  assert_output_contains "$content" "use std::io::Read;" "Should keep ours"
  assert_output_contains "$content" "use std::collections::BTreeMap;" "Should keep theirs"
  assert_output_contains "$content" "use std::io::Write;" "Should keep theirs"
  assert_output_not_contains "$content" "<<<<<<<" "No conflict markers"
}

test_import_merge_go() {
  local f="$TEST_DIR/main.go"
  cat > "$f" <<'CONFLICT'
package main

<<<<<<< HEAD
import (
	"fmt"
	"net/http"
)
=======
import (
	"encoding/json"
	"os"
)
>>>>>>> task/s-1

func main() {}
CONFLICT

  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "fmt" "Should keep ours Go import"
  assert_output_contains "$content" "net/http" "Should keep ours Go import 2"
  assert_output_contains "$content" "encoding/json" "Should keep theirs Go import"
  assert_output_contains "$content" "os" "Should keep theirs Go import 2"
  assert_output_not_contains "$content" "<<<<<<<" "Should have no conflict markers"
  assert_output_contains "$content" "package main" "Should preserve surrounding content"
  assert_output_contains "$content" "func main()" "Should preserve surrounding content"
}

# =============================================================================
# Tests: Disjoint additions strategy
# =============================================================================

test_disjoint_separate_functions() {
  local f="$TEST_DIR/utils.ts"
  cat > "$f" <<'CONFLICT'
// utils
<<<<<<< HEAD
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
=======
function formatCurrency(amount) {
  return '$' + amount.toFixed(2);
}
>>>>>>> task/s-2
CONFLICT

  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "function calculateTotal" "Should keep ours function"
  assert_output_contains "$content" "function formatCurrency" "Should keep theirs function"
  assert_output_not_contains "$content" "<<<<<<<" "No conflict markers"
}

test_disjoint_separate_classes() {
  local f="$TEST_DIR/models.py"
  cat > "$f" <<'CONFLICT'
<<<<<<< HEAD
class UserModel:
    name: str
    email: str
=======
class OrderModel:
    total: float
    status: str
>>>>>>> task/s-2
CONFLICT

  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "class UserModel" "Should keep ours class"
  assert_output_contains "$content" "class OrderModel" "Should keep theirs class"
  assert_output_not_contains "$content" "<<<<<<<" "No conflict markers"
}

test_disjoint_separate_exports() {
  local f="$TEST_DIR/index.ts"
  cat > "$f" <<'CONFLICT'
<<<<<<< HEAD
export const API_URL = 'https://api.example.com';
export const TIMEOUT = 5000;
=======
export const MAX_RETRIES = 3;
export const CACHE_TTL = 300;
>>>>>>> task/s-2
CONFLICT

  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "API_URL" "Should keep ours export"
  assert_output_contains "$content" "MAX_RETRIES" "Should keep theirs export"
  assert_output_not_contains "$content" "<<<<<<<" "No conflict markers"
}

# =============================================================================
# Tests: One-side-empty strategy
# =============================================================================

test_one_side_empty_keep_theirs() {
  local f="$TEST_DIR/test.js"
  cat > "$f" <<'CONFLICT'
// existing code
<<<<<<< HEAD
=======
function newFeature() {
  return true;
}
>>>>>>> task/s-1
CONFLICT

  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "function newFeature" "Should keep theirs addition"
  assert_output_not_contains "$content" "<<<<<<<" "No conflict markers"
}

test_one_side_empty_keep_ours() {
  local f="$TEST_DIR/test.js"
  cat > "$f" <<'CONFLICT'
<<<<<<< HEAD
function ourFeature() {
  return 42;
}
=======
>>>>>>> task/s-1
CONFLICT

  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "function ourFeature" "Should keep ours addition"
  assert_output_not_contains "$content" "<<<<<<<" "No conflict markers"
}

# =============================================================================
# Tests: Escalation (unresolvable)
# =============================================================================

test_escalate_same_key_modified() {
  local f="$TEST_DIR/config.json"
  cat > "$f" <<'CONFLICT'
{
<<<<<<< HEAD
  "timeout": 5000,
=======
  "timeout": 10000,
>>>>>>> task/s-1
}
CONFLICT

  local rc=0
  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null || rc=$?
  assert_equals "1" "$rc" "Should exit 1 for unresolvable conflict"
  # Both sides of the conflict must be preserved (no content loss)
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "<<<<<<<" "Escalated hunk should retain conflict markers"
  assert_output_contains "$content" "\"timeout\": 5000" "Ours side should be preserved"
  assert_output_contains "$content" "\"timeout\": 10000" "Theirs side should be preserved"
  assert_output_contains "$content" "=======" "Separator should be preserved"
}

test_escalate_same_function_modified() {
  local f="$TEST_DIR/utils.ts"
  cat > "$f" <<'CONFLICT'
<<<<<<< HEAD
function calculate(x) {
  return x * 2;
}
=======
function calculate(x) {
  return x * 3;
}
>>>>>>> task/s-1
CONFLICT

  local rc=0
  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null || rc=$?
  assert_equals "1" "$rc" "Should exit 1 when same function modified differently"
  # Both versions of the function must be preserved (no work lost)
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "<<<<<<<" "Escalated hunk should retain conflict markers"
  assert_output_contains "$content" "return x * 2" "Ours implementation should be preserved"
  assert_output_contains "$content" "return x * 3" "Theirs implementation should be preserved"
}

test_escalate_preserves_markers() {
  local f="$TEST_DIR/test.js"
  cat > "$f" <<'CONFLICT'
<<<<<<< HEAD
const value = "hello";
=======
const value = "world";
>>>>>>> task/s-1
CONFLICT

  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null || true
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "<<<<<<<" "Should preserve conflict markers for escalated hunks"
}

# =============================================================================
# Tests: Multi-hunk files
# =============================================================================

test_multi_hunk_all_resolvable() {
  local f="$TEST_DIR/test.js"
  cat > "$f" <<'CONFLICT'
// top
<<<<<<< HEAD
import { A } from './A';
=======
import { B } from './B';
>>>>>>> task/s-1
// middle
<<<<<<< HEAD
import { C } from './C';
=======
import { D } from './D';
>>>>>>> task/s-1
// bottom
CONFLICT

  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "import { A }" "Hunk 1 ours"
  assert_output_contains "$content" "import { B }" "Hunk 1 theirs"
  assert_output_contains "$content" "import { C }" "Hunk 2 ours"
  assert_output_contains "$content" "import { D }" "Hunk 2 theirs"
  assert_output_not_contains "$content" "<<<<<<<" "No conflict markers"
  assert_output_contains "$content" "// top" "Preserve surrounding"
  assert_output_contains "$content" "// middle" "Preserve surrounding"
  assert_output_contains "$content" "// bottom" "Preserve surrounding"
}

test_multi_hunk_mixed_resolve_and_escalate() {
  local f="$TEST_DIR/test.js"
  cat > "$f" <<'CONFLICT'
<<<<<<< HEAD
import { A } from './A';
=======
import { B } from './B';
>>>>>>> task/s-1
// between
<<<<<<< HEAD
const name = "alice";
=======
const name = "bob";
>>>>>>> task/s-1
CONFLICT

  local rc=0
  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null || rc=$?
  assert_equals "1" "$rc" "Should exit 1 when any hunk escalated"
  # But the resolvable hunk should still be resolved in the file
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "import { A }" "Resolved hunk should be applied"
  assert_output_contains "$content" "import { B }" "Resolved hunk should be applied"
  # Unresolved hunk should still have markers
  assert_output_contains "$content" "<<<<<<<" "Escalated hunk should keep markers"
}

# =============================================================================
# Tests: Options and edge cases
# =============================================================================

test_help_flag() {
  local output
  output=$(bash "$RESOLVE_SCRIPT" --help 2>&1) || true
  assert_output_contains "$output" "Usage:"
  assert_output_contains "$output" "--dry-run"
  assert_output_contains "$output" "--verbose"
}

test_no_file_exits_2() {
  local rc=0
  bash "$RESOLVE_SCRIPT" 2>/dev/null || rc=$?
  assert_equals "2" "$rc" "No file should exit 2"
}

test_missing_file_exits_2() {
  local rc=0
  bash "$RESOLVE_SCRIPT" "/nonexistent/file.txt" 2>/dev/null || rc=$?
  assert_equals "2" "$rc" "Missing file should exit 2"
}

test_no_markers_exits_2() {
  local f="$TEST_DIR/clean.js"
  echo "const x = 1;" > "$f"
  local rc=0
  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null || rc=$?
  assert_equals "2" "$rc" "File without markers should exit 2"
}

test_dry_run_no_modification() {
  local f="$TEST_DIR/test.js"
  cat > "$f" <<'CONFLICT'
<<<<<<< HEAD
import { A } from './A';
=======
import { B } from './B';
>>>>>>> task/s-1
CONFLICT

  local before
  before=$(cat "$f")
  local output
  output=$(bash "$RESOLVE_SCRIPT" "$f" --dry-run 2>&1)
  local after
  after=$(cat "$f")
  assert_equals "$before" "$after" "Dry run should not modify the file"
  # Dry run must produce analysis output (not silently do nothing)
  assert_output_contains "$output" "import_merge" "Dry run should report the strategy it would use"
}

test_verbose_shows_strategies() {
  local f="$TEST_DIR/test.js"
  cat > "$f" <<'CONFLICT'
<<<<<<< HEAD
import { A } from './A';
=======
import { B } from './B';
>>>>>>> task/s-1
CONFLICT

  local output
  output=$(bash "$RESOLVE_SCRIPT" "$f" --verbose 2>&1) || true
  assert_output_contains "$output" "import_merge" "Verbose should show strategy"
}

# =============================================================================
# Tests: Integration with merge queue
# =============================================================================

setup_git_project() {
  mkdir -p "$TEST_DIR/.pm"
  sqlite3 "$TEST_DIR/.pm/tasks.db" < "$SCHEMA"
  git -C "$TEST_DIR" init -q
  git -C "$TEST_DIR" config user.email "test@test.com"
  git -C "$TEST_DIR" config user.name "Test"
  echo "initial" > "$TEST_DIR/README.md"
  git -C "$TEST_DIR" add README.md
  git -C "$TEST_DIR" commit -q -m "initial"
}

test_merge_queue_auto_resolves_imports() {
  setup_git_project

  # Create a shared file with imports on base branch
  cat > "$TEST_DIR/app.js" <<'EOF'
import { useState } from 'react';

function App() { return null; }
EOF
  git -C "$TEST_DIR" add app.js
  git -C "$TEST_DIR" commit -q -m "add app.js"

  # Task 1: add Button import
  sqlite3 "$TEST_DIR/.pm/tasks.db" "INSERT INTO tasks (sprint, task_num, title, type, status) VALUES ('s', 1, 'Add button', 'frontend', 'pending');"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 1 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-1/app.js" <<'EOF'
import { useState } from 'react';
import { Button } from './Button';

function App() { return null; }
EOF
  git -C "$TEST_DIR/.worktrees/s-1" add app.js
  git -C "$TEST_DIR/.worktrees/s-1" commit -q -m "add Button import"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 1;"

  # Task 2: add Card import (will conflict with task 1 on the import block)
  sqlite3 "$TEST_DIR/.pm/tasks.db" "INSERT INTO tasks (sprint, task_num, title, type, status) VALUES ('s', 2, 'Add card', 'frontend', 'pending');"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 2 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-2/app.js" <<'EOF'
import { useState } from 'react';
import { Card } from './Card';

function App() { return null; }
EOF
  git -C "$TEST_DIR/.worktrees/s-2" add app.js
  git -C "$TEST_DIR/.worktrees/s-2" commit -q -m "add Card import"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 2;"

  # Run merge queue
  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null)

  # Both tasks should be merged (imports auto-resolved)
  local merged1 merged2
  merged1=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT merged_at FROM tasks WHERE sprint = 's' AND task_num = 1;")
  merged2=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT merged_at FROM tasks WHERE sprint = 's' AND task_num = 2;")
  assert_not_equals "" "$merged1" "Task 1 should be merged"
  assert_not_equals "" "$merged2" "Task 2 should be merged (imports auto-resolved)"

  # Final file should have both imports
  local content
  content=$(cat "$TEST_DIR/app.js")
  assert_output_contains "$content" "import { Button }" "Should have Button import"
  assert_output_contains "$content" "import { Card }" "Should have Card import"
  assert_output_contains "$content" "import { useState }" "Should keep original import"
}

test_merge_queue_auto_resolves_disjoint_functions() {
  setup_git_project

  # Create a shared file on base
  cat > "$TEST_DIR/utils.js" <<'EOF'
// utils
EOF
  git -C "$TEST_DIR" add utils.js
  git -C "$TEST_DIR" commit -q -m "add utils.js"

  # Task 1: add function A
  sqlite3 "$TEST_DIR/.pm/tasks.db" "INSERT INTO tasks (sprint, task_num, title, type, status) VALUES ('s', 1, 'Add calc', 'frontend', 'pending');"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 1 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-1/utils.js" <<'EOF'
// utils
function calculateTotal(items) {
  return items.reduce((sum, i) => sum + i.price, 0);
}
EOF
  git -C "$TEST_DIR/.worktrees/s-1" add utils.js
  git -C "$TEST_DIR/.worktrees/s-1" commit -q -m "add calculateTotal"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 1;"

  # Task 2: add function B
  sqlite3 "$TEST_DIR/.pm/tasks.db" "INSERT INTO tasks (sprint, task_num, title, type, status) VALUES ('s', 2, 'Add format', 'frontend', 'pending');"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 2 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-2/utils.js" <<'EOF'
// utils
function formatCurrency(amount) {
  return '$' + amount.toFixed(2);
}
EOF
  git -C "$TEST_DIR/.worktrees/s-2" add utils.js
  git -C "$TEST_DIR/.worktrees/s-2" commit -q -m "add formatCurrency"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 2;"

  # Run merge queue
  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null)

  # Both should merge
  local merged2
  merged2=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT merged_at FROM tasks WHERE sprint = 's' AND task_num = 2;")
  assert_not_equals "" "$merged2" "Task 2 should be merged (disjoint functions auto-resolved)"

  local content
  content=$(cat "$TEST_DIR/utils.js")
  assert_output_contains "$content" "calculateTotal" "Should have function A"
  assert_output_contains "$content" "formatCurrency" "Should have function B"
}

test_merge_queue_escalates_real_conflict() {
  setup_git_project

  # Create a config file
  cat > "$TEST_DIR/config.json" <<'EOF'
{
  "name": "test-app",
  "version": "1.0.0"
}
EOF
  git -C "$TEST_DIR" add config.json
  git -C "$TEST_DIR" commit -q -m "add config"

  # Task 1: change version
  sqlite3 "$TEST_DIR/.pm/tasks.db" "INSERT INTO tasks (sprint, task_num, title, type, status) VALUES ('s', 1, 'Bump version', 'infra', 'pending');"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 1 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-1/config.json" <<'EOF'
{
  "name": "test-app",
  "version": "2.0.0"
}
EOF
  git -C "$TEST_DIR/.worktrees/s-1" add config.json
  git -C "$TEST_DIR/.worktrees/s-1" commit -q -m "bump to 2.0.0"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 1;"

  # Task 2: change version differently
  sqlite3 "$TEST_DIR/.pm/tasks.db" "INSERT INTO tasks (sprint, task_num, title, type, status) VALUES ('s', 2, 'Also bump', 'infra', 'pending');"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 2 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-2/config.json" <<'EOF'
{
  "name": "test-app",
  "version": "3.0.0"
}
EOF
  git -C "$TEST_DIR/.worktrees/s-2" add config.json
  git -C "$TEST_DIR/.worktrees/s-2" commit -q -m "bump to 3.0.0"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 2;"

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null) || true

  # Task 1 merged, task 2 should be escalated
  local merged2
  merged2=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COALESCE(merged_at, '') FROM tasks WHERE sprint = 's' AND task_num = 2;")
  assert_equals "" "$merged2" "Task 2 should NOT be merged (version conflict)"
  assert_file_exists "$TEST_DIR/.pm/conflicts/s-2.md" "Should write conflict report"
}

# =============================================================================
# Run all tests
# =============================================================================

echo ""
echo -e "${BOLD}N2O Conflict Resolution — E2E Tests${NC}"
echo -e "${BOLD}=====================================${NC}"

echo ""
echo -e "${BOLD}Import merge strategy${NC}"
run_test "JS imports merged"                              test_import_merge_js
run_test "Python imports merged"                          test_import_merge_python
run_test "Duplicate imports deduplicated"                  test_import_merge_deduplicates
run_test "Rust use statements merged"                     test_import_merge_rust_use
run_test "Go imports merged"                              test_import_merge_go

echo ""
echo -e "${BOLD}Disjoint additions strategy${NC}"
run_test "Separate functions merged"                      test_disjoint_separate_functions
run_test "Separate classes merged"                        test_disjoint_separate_classes
run_test "Separate exports merged"                        test_disjoint_separate_exports

echo ""
echo -e "${BOLD}One-side-empty strategy${NC}"
run_test "Empty ours → keep theirs"                       test_one_side_empty_keep_theirs
run_test "Empty theirs → keep ours"                       test_one_side_empty_keep_ours

echo ""
echo -e "${BOLD}Escalation (unresolvable)${NC}"
run_test "Same key modified → escalate"                   test_escalate_same_key_modified
run_test "Same function modified → escalate"              test_escalate_same_function_modified
run_test "Escalated hunk preserves markers"               test_escalate_preserves_markers

echo ""
echo -e "${BOLD}Multi-hunk files${NC}"
run_test "All hunks resolvable"                           test_multi_hunk_all_resolvable
run_test "Mixed resolve + escalate"                       test_multi_hunk_mixed_resolve_and_escalate

echo ""
echo -e "${BOLD}Options and edge cases${NC}"
run_test "--help shows usage"                             test_help_flag
run_test "No file → exit 2"                               test_no_file_exits_2
run_test "Missing file → exit 2"                           test_missing_file_exits_2
run_test "No conflict markers → exit 2"                    test_no_markers_exits_2
run_test "--dry-run does not modify file"                  test_dry_run_no_modification
run_test "--verbose shows strategies"                      test_verbose_shows_strategies

echo ""
echo -e "${BOLD}Integration with merge queue${NC}"
run_test "Merge queue auto-resolves import conflicts"     test_merge_queue_auto_resolves_imports
run_test "Merge queue auto-resolves disjoint functions"   test_merge_queue_auto_resolves_disjoint_functions
run_test "Merge queue escalates real conflicts"           test_merge_queue_escalates_real_conflict

echo ""
printf '  '
printf '%0.s-' $(seq 1 56)
echo ""
echo -e "  Total:   $TOTAL"
echo -e "  ${GREEN}Passed:${NC}  $PASS"
if [[ $FAIL -gt 0 ]]; then
  echo -e "  ${RED}Failed:${NC}  $FAIL"
  echo ""
  echo -e "  ${RED}Failed tests:${NC}"
  for t in "${FAILED_TESTS[@]}"; do
    echo -e "    - $t"
  done
  echo ""
  exit 1
else
  echo -e "  Failed:  0"
  echo ""
  echo -e "  ${GREEN}All tests passed.${NC}"
fi
