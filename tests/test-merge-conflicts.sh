#!/bin/bash
set -uo pipefail

# =============================================================================
# E2E Tests for: Conflict Notification + Escalation System (Task 12)
# Covers: resolve-conflict.sh (identical changes pattern), merge-queue.sh
#         (task blocking + Supabase logging), unblock-conflict.sh (manual flow)
# Pure bash — no external test frameworks required.
# Usage: bash tests/test-merge-conflicts.sh
# =============================================================================

N2O_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESOLVE_SCRIPT="$N2O_DIR/scripts/coordination/resolve-conflict.sh"
MERGE_QUEUE="$N2O_DIR/scripts/coordination/merge-queue.sh"
UNBLOCK_SCRIPT="$N2O_DIR/scripts/coordination/unblock-conflict.sh"
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

assert_file_not_exists() {
  local path="$1"
  local msg="${2:-File should not exist: $path}"
  if [[ -f "$path" ]]; then
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

# Helper: set up a full git project with DB
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

seed_task() {
  local sprint="$1"
  local task_num="$2"
  local title="${3:-Task $task_num}"
  local status="${4:-pending}"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "INSERT INTO tasks (sprint, task_num, title, type, status) VALUES ('$sprint', $task_num, '$title', 'infra', '$status');"
}

# =============================================================================
# Tests: resolve-conflict.sh — identical changes pattern
# =============================================================================

test_identical_single_line() {
  local f="$TEST_DIR/test.js"
  cat > "$f" <<'CONFLICT'
// header
<<<<<<< HEAD
const VERSION = "2.0.0";
=======
const VERSION = "2.0.0";
>>>>>>> task/s-1
// footer
CONFLICT

  local rc=0
  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null || rc=$?
  assert_equals "0" "$rc" "Should resolve identical single-line changes"
  local content
  content=$(cat "$f")
  assert_output_not_contains "$content" "<<<<<<<" "No conflict markers"
  # Should have exactly one copy
  local count
  count=$(grep -c 'const VERSION = "2.0.0"' "$f")
  assert_equals "1" "$count" "Should have exactly one copy of the identical line"
  assert_output_contains "$content" "// header" "Should preserve header"
  assert_output_contains "$content" "// footer" "Should preserve footer"
}

test_identical_multi_line() {
  local f="$TEST_DIR/test.py"
  cat > "$f" <<'CONFLICT'
<<<<<<< HEAD
def helper():
    return True

class Config:
    debug = False
=======
def helper():
    return True

class Config:
    debug = False
>>>>>>> task/s-1
CONFLICT

  local rc=0
  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null || rc=$?
  assert_equals "0" "$rc" "Should resolve identical multi-line blocks"
  local content
  content=$(cat "$f")
  assert_output_not_contains "$content" "<<<<<<<" "No conflict markers"
  assert_output_contains "$content" "def helper" "Should keep the function"
  assert_output_contains "$content" "class Config" "Should keep the class"
}

test_identical_imports() {
  # Identical imports should be caught by identical strategy before import merge
  local f="$TEST_DIR/test.js"
  cat > "$f" <<'CONFLICT'
<<<<<<< HEAD
import { Button } from './Button';
=======
import { Button } from './Button';
>>>>>>> task/s-1
CONFLICT

  local rc=0
  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null || rc=$?
  assert_equals "0" "$rc" "Identical imports should resolve"
  local count
  count=$(grep -c "import { Button }" "$f")
  assert_equals "1" "$count" "Should have exactly one copy"
}

# =============================================================================
# Tests: resolve-conflict.sh — separate functions (disjoint)
# =============================================================================

test_separate_functions() {
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

  local rc=0
  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null || rc=$?
  assert_equals "0" "$rc" "Separate functions should resolve"
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "function calculateTotal" "Should keep ours"
  assert_output_contains "$content" "function formatCurrency" "Should keep theirs"
  assert_output_not_contains "$content" "<<<<<<<" "No markers"
}

# =============================================================================
# Tests: resolve-conflict.sh — imports
# =============================================================================

test_import_merge_deduplicate() {
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

  local rc=0
  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null || rc=$?
  assert_equals "0" "$rc" "Import merge should resolve"
  local content
  content=$(cat "$f")
  local count
  count=$(grep -c "import { useState }" "$f")
  assert_equals "1" "$count" "Duplicate should be deduplicated"
  assert_output_contains "$content" "import { Button }" "Ours unique"
  assert_output_contains "$content" "import { Card }" "Theirs unique"
}

# =============================================================================
# Tests: resolve-conflict.sh — disjoint line ranges
# =============================================================================

test_disjoint_line_ranges() {
  local f="$TEST_DIR/config.ts"
  cat > "$f" <<'CONFLICT'
// config
<<<<<<< HEAD
export const API_URL = 'https://api.example.com';
export const TIMEOUT = 5000;
=======
export const MAX_RETRIES = 3;
export const CACHE_TTL = 300;
>>>>>>> task/s-2
// end
CONFLICT

  local rc=0
  bash "$RESOLVE_SCRIPT" "$f" 2>/dev/null || rc=$?
  assert_equals "0" "$rc" "Disjoint exports should resolve"
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "API_URL" "Should keep ours"
  assert_output_contains "$content" "MAX_RETRIES" "Should keep theirs"
  assert_output_not_contains "$content" "<<<<<<<" "No markers"
}

# =============================================================================
# Tests: resolve-conflict.sh — unresolvable
# =============================================================================

test_unresolvable_same_key() {
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
  assert_equals "1" "$rc" "Same key should escalate"
  # Both sides of the conflict must be preserved (no content loss)
  local content
  content=$(cat "$f")
  assert_output_contains "$content" "<<<<<<<" "Escalated hunk should retain conflict markers"
  assert_output_contains "$content" "\"timeout\": 5000" "Ours side should be preserved"
  assert_output_contains "$content" "\"timeout\": 10000" "Theirs side should be preserved"
}

# =============================================================================
# Tests: merge-queue.sh — creates conflict report and blocks task
# =============================================================================

test_merge_queue_blocks_task_on_conflict() {
  setup_git_project

  cat > "$TEST_DIR/config.json" <<'EOF'
{
  "name": "test-app",
  "version": "1.0.0"
}
EOF
  git -C "$TEST_DIR" add config.json
  git -C "$TEST_DIR" commit -q -m "add config"

  # Task 1: change version
  seed_task "s" 1 "Bump to 2"
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
  seed_task "s" 2 "Bump to 3"
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

  # Task 2 should be blocked
  local status
  status=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT status FROM tasks WHERE sprint = 's' AND task_num = 2;")
  assert_equals "blocked" "$status" "Task 2 should be blocked"
}

test_merge_queue_sets_blocked_reason() {
  setup_git_project

  cat > "$TEST_DIR/config.json" <<'EOF'
{
  "version": "1.0.0"
}
EOF
  git -C "$TEST_DIR" add config.json
  git -C "$TEST_DIR" commit -q -m "add config"

  seed_task "s" 1 "Bump v2"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 1 >/dev/null 2>&1)
  echo '{"version":"2.0.0"}' > "$TEST_DIR/.worktrees/s-1/config.json"
  git -C "$TEST_DIR/.worktrees/s-1" add config.json
  git -C "$TEST_DIR/.worktrees/s-1" commit -q -m "v2"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 1;"

  seed_task "s" 2 "Bump v3"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 2 >/dev/null 2>&1)
  echo '{"version":"3.0.0"}' > "$TEST_DIR/.worktrees/s-2/config.json"
  git -C "$TEST_DIR/.worktrees/s-2" add config.json
  git -C "$TEST_DIR/.worktrees/s-2" commit -q -m "v3"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 2;"

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null) || true

  local reason
  reason=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT blocked_reason FROM tasks WHERE sprint = 's' AND task_num = 2;")
  assert_output_contains "$reason" "Merge conflict in:" "Should have conflict reason"
  assert_output_contains "$reason" "config.json" "Should mention conflicted file"
}

test_merge_queue_creates_conflict_report() {
  setup_git_project

  # Use key: value format so resolve-conflict.sh detects overlapping keys
  cat > "$TEST_DIR/config.yml" <<'EOF'
name: test-app
timeout: 1000
EOF
  git -C "$TEST_DIR" add config.yml
  git -C "$TEST_DIR" commit -q -m "add config"

  seed_task "s" 1 "Set timeout 2000"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 1 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-1/config.yml" <<'EOF'
name: test-app
timeout: 2000
EOF
  git -C "$TEST_DIR/.worktrees/s-1" add config.yml
  git -C "$TEST_DIR/.worktrees/s-1" commit -q -m "timeout 2000"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 1;"

  seed_task "s" 2 "Set timeout 3000"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 2 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-2/config.yml" <<'EOF'
name: test-app
timeout: 3000
EOF
  git -C "$TEST_DIR/.worktrees/s-2" add config.yml
  git -C "$TEST_DIR/.worktrees/s-2" commit -q -m "timeout 3000"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 2;"

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null) || true

  assert_file_exists "$TEST_DIR/.pm/conflicts/s-2.md" "Conflict report should exist"

  local report
  report=$(cat "$TEST_DIR/.pm/conflicts/s-2.md")
  assert_output_contains "$report" "Merge Conflict" "Report has header"
  assert_output_contains "$report" "Set timeout 3000" "Report has task title"
  assert_output_contains "$report" "task/s-2" "Report has branch name"
  assert_output_contains "$report" "Escalated Files" "Report has escalated section"
  assert_output_contains "$report" "config.yml" "Report should list the conflicted file"
  assert_output_contains "$report" "Merge Output" "Report should include merge output section"
  assert_output_contains "$report" "Resolution" "Report should include resolution guidance"
}

test_merge_queue_supabase_logging() {
  setup_git_project

  # Create a mock curl that logs calls
  local mock_dir="$TEST_DIR/mock-bin"
  mkdir -p "$mock_dir"
  cat > "$mock_dir/curl" <<'MOCKCURL'
#!/bin/bash
# Log the call for verification
echo "$@" >> "$MOCK_CURL_LOG"
# Return a successful response
echo '[]'
echo "201"
MOCKCURL
  chmod +x "$mock_dir/curl"
  export MOCK_CURL_LOG="$TEST_DIR/curl-calls.log"
  export PATH="$mock_dir:$PATH"
  export SUPABASE_URL="https://fake.supabase.co"
  export SUPABASE_KEY="fake-key"

  # Use key: value format to ensure unresolvable conflict (same key, different value)
  cat > "$TEST_DIR/settings.yml" <<'EOF'
app: myapp
port: 3000
EOF
  git -C "$TEST_DIR" add settings.yml
  git -C "$TEST_DIR" commit -q -m "add settings"

  seed_task "s" 1 "Change port 4000"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 1 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-1/settings.yml" <<'EOF'
app: myapp
port: 4000
EOF
  git -C "$TEST_DIR/.worktrees/s-1" add settings.yml
  git -C "$TEST_DIR/.worktrees/s-1" commit -q -m "port 4000"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 1;"

  seed_task "s" 2 "Change port 5000"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 2 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-2/settings.yml" <<'EOF'
app: myapp
port: 5000
EOF
  git -C "$TEST_DIR/.worktrees/s-2" add settings.yml
  git -C "$TEST_DIR/.worktrees/s-2" commit -q -m "port 5000"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 2;"

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null) || true

  # Supabase logging should have been called (unconditional — not behind an if)
  assert_file_exists "$MOCK_CURL_LOG" "curl log should exist (Supabase was called)"
  local curl_log
  curl_log=$(cat "$MOCK_CURL_LOG")
  assert_output_contains "$curl_log" "fake.supabase.co" "Should call Supabase"
  assert_output_contains "$curl_log" "activity_log" "Should log to activity_log"
  assert_output_contains "$curl_log" "merge_conflict_escalated" "Should log escalation event type"

  # Task should be blocked
  local status
  status=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT status FROM tasks WHERE sprint = 's' AND task_num = 2;")
  assert_equals "blocked" "$status" "Task should be blocked regardless of Supabase"
}

# =============================================================================
# Tests: merge-queue.sh — auto-resolution still works
# =============================================================================

test_merge_queue_auto_resolves_imports() {
  setup_git_project

  cat > "$TEST_DIR/app.js" <<'EOF'
import { useState } from 'react';

function App() { return null; }
EOF
  git -C "$TEST_DIR" add app.js
  git -C "$TEST_DIR" commit -q -m "add app.js"

  seed_task "s" 1 "Add button"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 1 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-1/app.js" <<'EOF'
import { useState } from 'react';
import { Button } from './Button';

function App() { return null; }
EOF
  git -C "$TEST_DIR/.worktrees/s-1" add app.js
  git -C "$TEST_DIR/.worktrees/s-1" commit -q -m "add Button"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 1;"

  seed_task "s" 2 "Add card"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 2 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-2/app.js" <<'EOF'
import { useState } from 'react';
import { Card } from './Card';

function App() { return null; }
EOF
  git -C "$TEST_DIR/.worktrees/s-2" add app.js
  git -C "$TEST_DIR/.worktrees/s-2" commit -q -m "add Card"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 2;"

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null)

  local merged2
  merged2=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT merged_at FROM tasks WHERE sprint = 's' AND task_num = 2;")
  assert_not_equals "" "$merged2" "Task 2 should be merged (imports auto-resolved)"

  # Should NOT be blocked
  local status
  status=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT status FROM tasks WHERE sprint = 's' AND task_num = 2;")
  assert_equals "green" "$status" "Auto-resolved task should stay green, not blocked"
}

# =============================================================================
# Tests: unblock-conflict.sh — manual resolution flow
# =============================================================================

test_unblock_resolves_and_merges() {
  setup_git_project

  # Use key: value format so conflicts are truly unresolvable (same key, different value)
  cat > "$TEST_DIR/config.yml" <<'EOF'
name: myapp
timeout: 1000
EOF
  git -C "$TEST_DIR" add config.yml
  git -C "$TEST_DIR" commit -q -m "add config"

  seed_task "s" 1 "Set timeout 2000"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 1 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-1/config.yml" <<'EOF'
name: myapp
timeout: 2000
EOF
  git -C "$TEST_DIR/.worktrees/s-1" add config.yml
  git -C "$TEST_DIR/.worktrees/s-1" commit -q -m "timeout 2000"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 1;"

  seed_task "s" 2 "Set timeout 3000"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 2 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-2/config.yml" <<'EOF'
name: myapp
timeout: 3000
EOF
  git -C "$TEST_DIR/.worktrees/s-2" add config.yml
  git -C "$TEST_DIR/.worktrees/s-2" commit -q -m "timeout 3000"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 2;"

  # Run merge queue — task 1 merges, task 2 gets blocked (same key conflict)
  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null) || true

  # Verify task 2 is blocked
  local status
  status=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT status FROM tasks WHERE sprint = 's' AND task_num = 2;")
  assert_equals "blocked" "$status" "Task 2 should be blocked"

  # Simulate manual resolution: rebase the task branch to incorporate task 1's changes
  git -C "$TEST_DIR" checkout "task/s-2" 2>/dev/null
  cat > "$TEST_DIR/config.yml" <<'EOF'
name: myapp
timeout: 3000
EOF
  git -C "$TEST_DIR" add config.yml
  git -C "$TEST_DIR" commit -q -m "resolve: keep timeout 3000"
  git -C "$TEST_DIR" rebase master 2>/dev/null || {
    cat > "$TEST_DIR/config.yml" <<'EOF'
name: myapp
timeout: 3000
EOF
    git -C "$TEST_DIR" add config.yml
    GIT_EDITOR=true git -C "$TEST_DIR" rebase --continue 2>/dev/null || true
  }
  git -C "$TEST_DIR" checkout master 2>/dev/null

  # Run unblock
  (cd "$TEST_DIR" && bash "$UNBLOCK_SCRIPT" "s" 2 2>/dev/null)

  # Task should be back to green (work was already complete before conflict)
  status=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT status FROM tasks WHERE sprint = 's' AND task_num = 2;")
  assert_equals "green" "$status" "Task 2 should be green after unblock"

  # blocked_reason should be cleared
  local reason
  reason=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COALESCE(blocked_reason, '') FROM tasks WHERE sprint = 's' AND task_num = 2;")
  assert_equals "" "$reason" "blocked_reason should be cleared"

  # merged_at should be set
  local merged
  merged=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT merged_at FROM tasks WHERE sprint = 's' AND task_num = 2;")
  assert_not_equals "" "$merged" "merged_at should be set after unblock"
}

test_unblock_removes_conflict_report() {
  setup_git_project

  # Use key: value format for truly unresolvable conflict
  cat > "$TEST_DIR/settings.yml" <<'EOF'
app: myapp
port: 3000
EOF
  git -C "$TEST_DIR" add settings.yml
  git -C "$TEST_DIR" commit -q -m "add settings"

  seed_task "s" 1 "Port 4000"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 1 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-1/settings.yml" <<'EOF'
app: myapp
port: 4000
EOF
  git -C "$TEST_DIR/.worktrees/s-1" add settings.yml
  git -C "$TEST_DIR/.worktrees/s-1" commit -q -m "port 4000"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 1;"

  seed_task "s" 2 "Port 5000"
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 2 >/dev/null 2>&1)
  cat > "$TEST_DIR/.worktrees/s-2/settings.yml" <<'EOF'
app: myapp
port: 5000
EOF
  git -C "$TEST_DIR/.worktrees/s-2" add settings.yml
  git -C "$TEST_DIR/.worktrees/s-2" commit -q -m "port 5000"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 2;"

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null) || true

  # Verify conflict report exists
  assert_file_exists "$TEST_DIR/.pm/conflicts/s-2.md" "Conflict report should exist before unblock"

  # Manually resolve: rebase task branch to include task 1's changes
  git -C "$TEST_DIR" checkout "task/s-2" 2>/dev/null
  cat > "$TEST_DIR/settings.yml" <<'EOF'
app: myapp
port: 5000
EOF
  git -C "$TEST_DIR" add settings.yml
  git -C "$TEST_DIR" commit -q -m "resolve: keep port 5000"
  git -C "$TEST_DIR" rebase master 2>/dev/null || {
    cat > "$TEST_DIR/settings.yml" <<'EOF'
app: myapp
port: 5000
EOF
    git -C "$TEST_DIR" add settings.yml
    GIT_EDITOR=true git -C "$TEST_DIR" rebase --continue 2>/dev/null || true
  }
  git -C "$TEST_DIR" checkout master 2>/dev/null

  (cd "$TEST_DIR" && bash "$UNBLOCK_SCRIPT" "s" 2 2>/dev/null)

  # Conflict report should be removed
  assert_file_not_exists "$TEST_DIR/.pm/conflicts/s-2.md" "Conflict report should be removed after unblock"
}

test_unblock_bad_args_exits_2() {
  local rc=0
  bash "$UNBLOCK_SCRIPT" 2>/dev/null || rc=$?
  assert_equals "2" "$rc" "No args should exit 2"
}

test_unblock_missing_sprint_exits_2() {
  local rc=0
  bash "$UNBLOCK_SCRIPT" "nonexistent" "99" 2>/dev/null || rc=$?
  # Should fail because not in git repo or task not found
  if [[ "$rc" -eq 0 ]]; then
    echo "    ASSERT FAILED: Missing sprint should exit non-zero" >&2
    return 1
  fi
}

test_unblock_non_numeric_task_exits_2() {
  local rc=0
  bash "$UNBLOCK_SCRIPT" "sprint" "abc" 2>/dev/null || rc=$?
  assert_equals "2" "$rc" "Non-numeric task_num should exit 2"
}

# =============================================================================
# Run all tests
# =============================================================================

echo ""
echo -e "${BOLD}N2O Conflict Notification + Escalation — E2E Tests${NC}"
echo -e "${BOLD}===================================================${NC}"

echo ""
echo -e "${BOLD}resolve-conflict.sh — identical changes${NC}"
run_test "Identical single-line changes"                   test_identical_single_line
run_test "Identical multi-line blocks"                     test_identical_multi_line
run_test "Identical imports (caught early)"                test_identical_imports

echo ""
echo -e "${BOLD}resolve-conflict.sh — separate functions${NC}"
run_test "Separate functions merged"                       test_separate_functions

echo ""
echo -e "${BOLD}resolve-conflict.sh — import additions${NC}"
run_test "Import merge with deduplication"                 test_import_merge_deduplicate

echo ""
echo -e "${BOLD}resolve-conflict.sh — disjoint line ranges${NC}"
run_test "Disjoint exports merged"                         test_disjoint_line_ranges

echo ""
echo -e "${BOLD}resolve-conflict.sh — unresolvable${NC}"
run_test "Same key modified → escalate"                    test_unresolvable_same_key

echo ""
echo -e "${BOLD}merge-queue.sh — conflict blocking${NC}"
run_test "Blocks task on unresolvable conflict"            test_merge_queue_blocks_task_on_conflict
run_test "Sets blocked_reason with file names"             test_merge_queue_sets_blocked_reason
run_test "Creates conflict report"                         test_merge_queue_creates_conflict_report
run_test "Supabase logging on conflict"                    test_merge_queue_supabase_logging
run_test "Auto-resolution still works (imports)"           test_merge_queue_auto_resolves_imports

echo ""
echo -e "${BOLD}unblock-conflict.sh — manual resolution${NC}"
run_test "Unblock resolves, merges, and clears status"     test_unblock_resolves_and_merges
run_test "Unblock removes conflict report"                 test_unblock_removes_conflict_report
run_test "No args → exit 2"                                test_unblock_bad_args_exits_2
run_test "Missing task → exit non-zero"                    test_unblock_missing_sprint_exits_2
run_test "Non-numeric task_num → exit 2"                   test_unblock_non_numeric_task_exits_2

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
