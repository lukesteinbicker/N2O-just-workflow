#!/bin/bash
set -uo pipefail

# =============================================================================
# E2E Tests for: scripts/coordination/claim-task.sh
#                scripts/n2o-session-hook.sh (coordination mode)
# Covers: atomic claiming, contention handling, worktree creation,
#         session hook integration, edge cases
# Pure bash — no external test frameworks required.
# Usage: bash tests/test-n2o-claim.sh
# =============================================================================

N2O_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLAIM_SCRIPT="$N2O_DIR/scripts/coordination/claim-task.sh"
SESSION_HOOK="$N2O_DIR/scripts/n2o-session-hook.sh"
CREATE_SCRIPT="$N2O_DIR/scripts/coordination/create-worktree.sh"
CLEANUP_SCRIPT="$N2O_DIR/scripts/coordination/cleanup-worktree.sh"
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
  # Use -P to resolve symlinks (macOS: /var -> /private/var)
  TEST_DIR=$(cd "$(mktemp -d)" && pwd -P)
  mkdir -p "$TEST_DIR/.pm"
  sqlite3 "$TEST_DIR/.pm/tasks.db" < "$SCHEMA"
  git -C "$TEST_DIR" init -q
  git -C "$TEST_DIR" config user.email "test@test.com"
  git -C "$TEST_DIR" config user.name "Test"
  echo "initial" > "$TEST_DIR/README.md"
  git -C "$TEST_DIR" add README.md
  git -C "$TEST_DIR" commit -q -m "initial"
  # Seed tasks with different priorities
  sqlite3 "$TEST_DIR/.pm/tasks.db" "
    INSERT INTO tasks (sprint, task_num, title, type, status, priority, description, done_when, skills) VALUES
    ('test-sprint', 1, 'High priority task', 'infra', 'pending', 1.0, 'Do the high priority thing', 'Tests pass', 'infra'),
    ('test-sprint', 2, 'Medium priority task', 'frontend', 'pending', 2.0, 'Do the medium thing', 'UI renders', 'frontend'),
    ('test-sprint', 3, 'Low priority task', 'database', 'pending', 3.0, 'Do the low priority thing', 'Migration runs', 'database');
  "
  # Add a config.json (needed for session hook detection)
  echo '{"project_name":"test","n2o_version":"1.0.0"}' > "$TEST_DIR/.pm/config.json"
}

teardown() {
  if [[ -n "$TEST_DIR" && -d "$TEST_DIR" ]]; then
    git -C "$TEST_DIR" worktree list --porcelain 2>/dev/null | grep "^worktree " | grep -v "$TEST_DIR$" | sed 's/^worktree //' | while read -r wt; do
      git -C "$TEST_DIR" worktree remove --force "$wt" 2>/dev/null || true
    done
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
      grep "ASSERT FAILED" "$err_file" | head -1 | sed 's/^/    /'
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

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local msg="${3:-Output should contain '$needle'}"
  if [[ "$haystack" != *"$needle"* ]]; then
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

assert_dir_not_exists() {
  local path="$1"
  local msg="${2:-Directory should not exist: $path}"
  if [[ -d "$path" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

# -----------------------------------------------------------------------------
# claim-task.sh tests
# -----------------------------------------------------------------------------

test_claim_no_db() {
  rm "$TEST_DIR/.pm/tasks.db"
  local rc=0
  (cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" 2>/dev/null) || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    echo "    ASSERT FAILED: Should fail without tasks.db" >&2
    return 1
  fi
}

test_claim_no_available_tasks() {
  # Mark all tasks as non-pending
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green';"
  local rc=0
  (cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" 2>/dev/null) || rc=$?
  assert_equals 2 "$rc" "Should exit 2 when no tasks available"
}

test_claim_success() {
  local json
  json=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "test-agent" 2>/dev/null)
  local rc=$?
  assert_equals 0 "$rc" "Should exit 0 on success"

  # Verify JSON output
  local title
  title=$(echo "$json" | jq -r '.title')
  assert_equals "High priority task" "$title" "Should claim highest priority task"
}

test_claim_outputs_valid_json() {
  local json
  json=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "test-agent" 2>/dev/null)

  # Verify all expected fields exist
  local agent_id sprint task_num title worktree_path branch
  agent_id=$(echo "$json" | jq -r '.agent_id')
  sprint=$(echo "$json" | jq -r '.sprint')
  task_num=$(echo "$json" | jq -r '.task_num')
  title=$(echo "$json" | jq -r '.title')
  worktree_path=$(echo "$json" | jq -r '.worktree_path')
  branch=$(echo "$json" | jq -r '.branch')

  assert_equals "test-agent" "$agent_id" "JSON should have agent_id"
  assert_equals "test-sprint" "$sprint" "JSON should have sprint"
  assert_equals "1" "$task_num" "JSON should have task_num"
  assert_equals "High priority task" "$title" "JSON should have title"
  assert_contains "$worktree_path" ".worktrees/test-sprint-1" "JSON should have worktree_path"
  assert_equals "task/test-sprint-1" "$branch" "JSON should have branch"
}

test_claim_updates_db() {
  (cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "test-agent" --session-id "sess-123" 2>/dev/null) > /dev/null

  local owner status session_id
  owner=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT owner FROM tasks WHERE sprint = 'test-sprint' AND task_num = 1;")
  status=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT status FROM tasks WHERE sprint = 'test-sprint' AND task_num = 1;")
  session_id=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT session_id FROM tasks WHERE sprint = 'test-sprint' AND task_num = 1;")

  assert_equals "test-agent" "$owner" "DB owner should be set"
  assert_equals "red" "$status" "DB status should be red"
  assert_equals "sess-123" "$session_id" "DB session_id should be set"
}

test_claim_creates_worktree() {
  (cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "test-agent" 2>/dev/null) > /dev/null
  assert_dir_exists "$TEST_DIR/.worktrees/test-sprint-1" "Worktree should be created"
}

test_claim_respects_priority() {
  local json
  json=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "test-agent" 2>/dev/null)
  local task_num
  task_num=$(echo "$json" | jq -r '.task_num')
  assert_equals "1" "$task_num" "Should claim task with lowest priority number (highest priority)"
}

test_claim_sprint_filter() {
  # Add a task in a different sprint
  sqlite3 "$TEST_DIR/.pm/tasks.db" "
    INSERT INTO tasks (sprint, task_num, title, type, status, priority)
    VALUES ('other-sprint', 1, 'Other task', 'infra', 'pending', 0.5);
  "

  local json
  json=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "test-agent" --sprint "other-sprint" 2>/dev/null)
  local sprint
  sprint=$(echo "$json" | jq -r '.sprint')
  assert_equals "other-sprint" "$sprint" "Should only claim from filtered sprint"
}

test_claim_skips_owned_tasks() {
  # Pre-claim task 1
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET owner = 'other-agent', status = 'red' WHERE sprint = 'test-sprint' AND task_num = 1;"

  local json
  json=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "test-agent" 2>/dev/null)
  local task_num
  task_num=$(echo "$json" | jq -r '.task_num')
  assert_equals "2" "$task_num" "Should skip owned task and claim next available"
}

test_claim_atomic_contention() {
  # Simulate contention: claim task 1 between query and update
  # We pre-claim tasks 1 and 2, leaving only 3
  sqlite3 "$TEST_DIR/.pm/tasks.db" "
    UPDATE tasks SET owner = 'other-agent-1', status = 'red' WHERE sprint = 'test-sprint' AND task_num = 1;
    UPDATE tasks SET owner = 'other-agent-2', status = 'red' WHERE sprint = 'test-sprint' AND task_num = 2;
  "

  local json
  json=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "test-agent" 2>/dev/null)
  local task_num
  task_num=$(echo "$json" | jq -r '.task_num')
  assert_equals "3" "$task_num" "Should claim the only remaining task"
}

test_claim_generates_agent_id() {
  local json
  json=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" 2>/dev/null)
  local agent_id
  agent_id=$(echo "$json" | jq -r '.agent_id')
  assert_contains "$agent_id" "agent-" "Auto-generated ID should start with agent-"
}

test_claim_respects_dependencies() {
  # Add dependency: task 2 depends on task 1
  sqlite3 "$TEST_DIR/.pm/tasks.db" "
    INSERT INTO task_dependencies VALUES ('test-sprint', 2, 'test-sprint', 1);
  "

  # Claim task 1 (should be available)
  local json
  json=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "agent-1" 2>/dev/null)
  local task_num
  task_num=$(echo "$json" | jq -r '.task_num')
  assert_equals "1" "$task_num" "Should claim task 1 first"

  # Now only task 3 should be available (task 2 is blocked by task 1 which is 'red')
  local json2
  json2=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "agent-2" 2>/dev/null)
  local task_num2
  task_num2=$(echo "$json2" | jq -r '.task_num')
  assert_equals "3" "$task_num2" "Should skip blocked task 2 and claim task 3"
}

test_claim_unknown_arg() {
  local rc=0
  (cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --bogus 2>/dev/null) || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    echo "    ASSERT FAILED: Unknown arg should exit non-zero" >&2
    return 1
  fi
}

# -----------------------------------------------------------------------------
# Session hook integration tests
# -----------------------------------------------------------------------------

test_hook_claims_task() {
  local hook_output
  hook_output=$(cd "$TEST_DIR" && echo '{"source":"startup","cwd":"'"$TEST_DIR"'"}' | bash "$SESSION_HOOK" 2>/dev/null)
  assert_contains "$hook_output" "TASK AUTO-CLAIMED" "Hook should output task claim"
  assert_contains "$hook_output" "High priority task" "Hook should show task title"
}

test_hook_shows_worktree_path() {
  local hook_output
  hook_output=$(cd "$TEST_DIR" && echo '{"source":"startup","cwd":"'"$TEST_DIR"'"}' | bash "$SESSION_HOOK" 2>/dev/null)
  assert_contains "$hook_output" ".worktrees/test-sprint-1" "Hook should show worktree path"
  assert_contains "$hook_output" "tdd-agent" "Hook should mention tdd-agent"
}

test_hook_shows_done_when() {
  local hook_output
  hook_output=$(cd "$TEST_DIR" && echo '{"source":"startup","cwd":"'"$TEST_DIR"'"}' | bash "$SESSION_HOOK" 2>/dev/null)
  assert_contains "$hook_output" "Done when" "Hook should show done_when"
  assert_contains "$hook_output" "Tests pass" "Hook should show the done_when content"
}

test_hook_no_tasks_no_crash() {
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green';"
  local rc=0
  local hook_output
  hook_output=$(cd "$TEST_DIR" && echo '{"source":"startup","cwd":"'"$TEST_DIR"'"}' | bash "$SESSION_HOOK" 2>/dev/null) || rc=$?
  assert_equals 0 "$rc" "Hook should not crash when no tasks available"
}

test_hook_skips_non_startup() {
  local hook_output
  hook_output=$(cd "$TEST_DIR" && echo '{"source":"resume","cwd":"'"$TEST_DIR"'"}' | bash "$SESSION_HOOK" 2>/dev/null)
  # Should produce no output and not claim anything
  local owner
  owner=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT owner FROM tasks WHERE sprint = 'test-sprint' AND task_num = 1;")
  if [[ -n "$owner" ]]; then
    echo "    ASSERT FAILED: Should not claim on resume (owner=$owner)" >&2
    return 1
  fi
}

test_hook_skips_non_n2o_project() {
  rm "$TEST_DIR/.pm/config.json"
  local rc=0
  local hook_output
  hook_output=$(cd "$TEST_DIR" && echo '{"source":"startup","cwd":"'"$TEST_DIR"'"}' | bash "$SESSION_HOOK" 2>/dev/null) || rc=$?
  assert_equals 0 "$rc" "Hook should exit cleanly for non-N2O projects"
  # Should not claim anything
  local owner
  owner=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT owner FROM tasks WHERE sprint = 'test-sprint' AND task_num = 1;")
  if [[ -n "$owner" ]]; then
    echo "    ASSERT FAILED: Should not claim in non-N2O project" >&2
    return 1
  fi
}

# =============================================================================
# Run tests
# =============================================================================

echo ""
echo -e "${BOLD}N2O Task Claiming & Session Hook — E2E Tests${NC}"
echo -e "${BOLD}==============================================${NC}"

echo ""
echo -e "${BOLD}claim-task.sh — Error Handling${NC}"
run_test "No tasks.db exits non-zero"                  test_claim_no_db
run_test "No available tasks exits 2"                  test_claim_no_available_tasks
run_test "Unknown argument exits non-zero"             test_claim_unknown_arg

echo ""
echo -e "${BOLD}claim-task.sh — Claiming${NC}"
run_test "Claims successfully"                         test_claim_success
run_test "Outputs valid JSON with all fields"           test_claim_outputs_valid_json
run_test "Updates DB: owner, status, session_id"        test_claim_updates_db
run_test "Creates worktree for claimed task"            test_claim_creates_worktree
run_test "Claims highest priority task first"           test_claim_respects_priority
run_test "Sprint filter limits scope"                   test_claim_sprint_filter
run_test "Skips already-owned tasks"                    test_claim_skips_owned_tasks
run_test "Handles contention (falls through)"           test_claim_atomic_contention
run_test "Auto-generates agent ID"                      test_claim_generates_agent_id
run_test "Respects task dependencies"                   test_claim_respects_dependencies

echo ""
echo -e "${BOLD}Session Hook — Integration${NC}"
run_test "Hook claims task on startup"                  test_hook_claims_task
run_test "Hook shows worktree path and tdd-agent"       test_hook_shows_worktree_path
run_test "Hook shows done_when criteria"                test_hook_shows_done_when
run_test "Hook handles no available tasks gracefully"   test_hook_no_tasks_no_crash
run_test "Hook skips non-startup events"                test_hook_skips_non_startup
run_test "Hook skips non-N2O projects"                  test_hook_skips_non_n2o_project

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
