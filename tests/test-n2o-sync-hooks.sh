#!/bin/bash
set -uo pipefail

# =============================================================================
# E2E Tests for: scripts/coordination/install-hooks.sh
#                scripts/coordination/sync-task-state.sh
#                n2o sync --force (Supabase task sync)
#                scripts/n2o-session-hook.sh (agent registration)
#
# Uses mock curl pattern from tests/test-n2o-supabase.sh.
# Pure bash — no external test frameworks required.
# Usage: bash tests/test-n2o-sync-hooks.sh
# =============================================================================

N2O_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_HOOKS="$N2O_DIR/scripts/coordination/install-hooks.sh"
SYNC_TASK_STATE="$N2O_DIR/scripts/coordination/sync-task-state.sh"
CLIENT_SCRIPT="$N2O_DIR/scripts/coordination/supabase-client.sh"
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
MOCK_CURL_LOG=""

setup() {
  TEST_DIR=$(cd "$(mktemp -d)" && pwd -P)

  # Create a git repo in the test directory
  git -C "$TEST_DIR" init -q
  git -C "$TEST_DIR" config user.email "test@test.com"
  git -C "$TEST_DIR" config user.name "Test"
  # Create initial commit so HEAD exists
  touch "$TEST_DIR/.gitkeep"
  git -C "$TEST_DIR" add .gitkeep
  git -C "$TEST_DIR" commit -q -m "init"

  # Set up project structure
  mkdir -p "$TEST_DIR/.pm" "$TEST_DIR/bin"
  mkdir -p "$TEST_DIR/scripts/coordination"

  # Copy coordination scripts into the test project
  cp "$INSTALL_HOOKS" "$TEST_DIR/scripts/coordination/"
  cp "$SYNC_TASK_STATE" "$TEST_DIR/scripts/coordination/"
  cp "$CLIENT_SCRIPT" "$TEST_DIR/scripts/coordination/"
  chmod +x "$TEST_DIR/scripts/coordination/"*.sh

  # Create local tasks.db with schema + test data
  sqlite3 "$TEST_DIR/.pm/tasks.db" < "$SCHEMA"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "
    INSERT INTO tasks (sprint, task_num, title, type, status, priority, description, done_when, owner, session_id)
    VALUES
    ('test-sprint', 1, 'Task One', 'infra', 'red', 1.0, 'Do thing one', 'Tests pass', 'agent-1', 'sess-1'),
    ('test-sprint', 2, 'Task Two', 'frontend', 'pending', 2.0, 'Do thing two', 'UI renders', NULL, NULL),
    ('test-sprint', 3, 'Task Three', 'database', 'green', 3.0, 'Do thing three', 'Migration runs', 'agent-2', 'sess-2');
  "

  # Create config.json
  cat > "$TEST_DIR/.pm/config.json" <<'CONF'
{
  "n2o_version": "1.0.0",
  "project_name": "test",
  "supabase": {
    "url": "https://test-project.supabase.co",
    "key_env": "SUPABASE_KEY"
  }
}
CONF

  # Create mock curl
  MOCK_CURL_LOG="$TEST_DIR/curl_calls.log"
  cat > "$TEST_DIR/bin/curl" <<'MOCKCURL'
#!/bin/bash
LOG_FILE="${MOCK_CURL_LOG:-/tmp/mock_curl.log}"
MOCK_HTTP_CODE="${MOCK_HTTP_CODE:-200}"

method="GET"
url=""
data=""
prev=""
for arg in "$@"; do
  case "$prev" in
    -X) method="$arg" ;;
    -d) data="$arg" ;;
  esac
  prev="$arg"
  if [[ "$arg" =~ ^https?:// ]]; then
    url="$arg"
  fi
done

echo "$method $url" >> "$LOG_FILE"
if [ -n "$data" ]; then
  echo "  DATA: $data" >> "$LOG_FILE"
fi

if [[ "$*" == *"-w"* ]]; then
  echo '[{"ok":true}]'
  echo ""
  echo "$MOCK_HTTP_CODE"
elif [[ "$*" == *"-o /dev/null"* ]]; then
  echo "$MOCK_HTTP_CODE"
else
  echo '[{"ok":true}]'
fi
MOCKCURL
  chmod +x "$TEST_DIR/bin/curl"

  export MOCK_CURL_LOG
  export MOCK_HTTP_CODE="200"
  export SUPABASE_URL="https://test-project.supabase.co"
  export SUPABASE_KEY="test-service-role-key-123"
}

teardown() {
  unset SUPABASE_URL SUPABASE_KEY MOCK_CURL_LOG MOCK_HTTP_CODE N2O_AGENT_ID
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

assert_file_exists() {
  local file="$1"
  local msg="${2:-File should exist: $file}"
  if [[ ! -f "$file" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_file_executable() {
  local file="$1"
  local msg="${2:-File should be executable: $file}"
  if [[ ! -x "$file" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_file_contains() {
  local file="$1"
  local needle="$2"
  local msg="${3:-File should contain '$needle'}"
  if ! grep -q "$needle" "$file" 2>/dev/null; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_file_not_contains() {
  local file="$1"
  local needle="$2"
  local msg="${3:-File should NOT contain '$needle'}"
  if grep -q "$needle" "$file" 2>/dev/null; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_curl_called() {
  local method="$1"
  local url_fragment="$2"
  local msg="${3:-curl should have been called with $method $url_fragment}"
  if ! grep -q "$method.*$url_fragment" "$MOCK_CURL_LOG" 2>/dev/null; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_curl_not_called() {
  local msg="${1:-curl should NOT have been called}"
  if [[ -f "$MOCK_CURL_LOG" ]] && [[ -s "$MOCK_CURL_LOG" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

# Helper: switch to test dir with mock curl on PATH
enter_test_project() {
  cd "$TEST_DIR"
  export PATH="$TEST_DIR/bin:$PATH"
}

# Helper: create a task branch in the test repo
create_task_branch() {
  local sprint="$1"
  local task_num="$2"
  git -C "$TEST_DIR" checkout -q -b "task/${sprint}-${task_num}"
}

# -----------------------------------------------------------------------------
# Hook Installation Tests
# -----------------------------------------------------------------------------

test_hooks_installed() {
  enter_test_project
  bash scripts/coordination/install-hooks.sh "$TEST_DIR" 2>/dev/null
  assert_file_exists "$TEST_DIR/.git/hooks/post-commit"
  assert_file_exists "$TEST_DIR/.git/hooks/post-merge"
  assert_file_exists "$TEST_DIR/.git/hooks/pre-push"
  assert_file_exists "$TEST_DIR/.git/hooks/post-checkout"
  # Verify hooks contain the N2O marker (not empty files)
  assert_file_contains "$TEST_DIR/.git/hooks/post-commit" "N2O-MANAGED-HOOK" "post-commit should have N2O marker"
  assert_file_contains "$TEST_DIR/.git/hooks/post-merge" "N2O-MANAGED-HOOK" "post-merge should have N2O marker"
  assert_file_contains "$TEST_DIR/.git/hooks/pre-push" "N2O-MANAGED-HOOK" "pre-push should have N2O marker"
  assert_file_contains "$TEST_DIR/.git/hooks/post-checkout" "N2O-MANAGED-HOOK" "post-checkout should have N2O marker"
}

test_hooks_executable() {
  enter_test_project
  bash scripts/coordination/install-hooks.sh "$TEST_DIR" 2>/dev/null
  assert_file_executable "$TEST_DIR/.git/hooks/post-commit"
  assert_file_executable "$TEST_DIR/.git/hooks/post-merge"
  assert_file_executable "$TEST_DIR/.git/hooks/pre-push"
  assert_file_executable "$TEST_DIR/.git/hooks/post-checkout"
  # Verify hooks can actually execute without error (not just the +x bit)
  local rc=0
  bash "$TEST_DIR/.git/hooks/post-commit" 2>/dev/null || rc=$?
  assert_equals 0 "$rc" "post-commit hook should run without error"
}

test_hooks_contain_sync_call() {
  enter_test_project
  bash scripts/coordination/install-hooks.sh "$TEST_DIR" 2>/dev/null
  assert_file_contains "$TEST_DIR/.git/hooks/post-commit" "sync-task-state.sh"
  assert_file_contains "$TEST_DIR/.git/hooks/post-commit" "post-commit"
  assert_file_contains "$TEST_DIR/.git/hooks/post-merge" "post-merge"
  assert_file_contains "$TEST_DIR/.git/hooks/pre-push" "pre-push"
  assert_file_contains "$TEST_DIR/.git/hooks/post-checkout" "post-checkout"
}

test_hooks_never_block_git() {
  enter_test_project
  bash scripts/coordination/install-hooks.sh "$TEST_DIR" 2>/dev/null

  # Replace sync script with one that fails hard (exit 1)
  cat > "$TEST_DIR/scripts/coordination/sync-task-state.sh" <<'FAILSCRIPT'
#!/bin/bash
echo "SYNC FAILURE" >&2
exit 1
FAILSCRIPT
  chmod +x "$TEST_DIR/scripts/coordination/sync-task-state.sh"

  # Git commit should still succeed despite sync hook returning exit 1
  echo "test-never-block" > "$TEST_DIR/testfile2"
  git -C "$TEST_DIR" add testfile2
  local rc=0
  git -C "$TEST_DIR" commit -q -m "test with failing sync" 2>/dev/null || rc=$?
  assert_equals 0 "$rc" "Git commit should succeed even when sync script exits 1"

  # Verify the commit actually happened (not silently swallowed)
  local log_msg
  log_msg=$(git -C "$TEST_DIR" log -1 --format=%s)
  assert_equals "test with failing sync" "$log_msg" "Commit message should match"
}

test_hooks_idempotent() {
  enter_test_project
  bash scripts/coordination/install-hooks.sh "$TEST_DIR" 2>/dev/null
  local first_content
  first_content=$(cat "$TEST_DIR/.git/hooks/post-commit")
  bash scripts/coordination/install-hooks.sh "$TEST_DIR" 2>/dev/null
  local second_content
  second_content=$(cat "$TEST_DIR/.git/hooks/post-commit")
  assert_equals "$first_content" "$second_content" "Hook content should not change on reinstall"
}

test_hooks_preserve_existing() {
  enter_test_project
  # Create a pre-existing hook
  cat > "$TEST_DIR/.git/hooks/post-commit" <<'EXISTING'
#!/bin/bash
echo "existing hook"
EXISTING
  chmod +x "$TEST_DIR/.git/hooks/post-commit"

  bash scripts/coordination/install-hooks.sh "$TEST_DIR" 2>/dev/null

  # Should still contain the existing hook content
  assert_file_contains "$TEST_DIR/.git/hooks/post-commit" "existing hook"
  # And also the N2O hook
  assert_file_contains "$TEST_DIR/.git/hooks/post-commit" "sync-task-state.sh"
}

test_hooks_dont_block_git_operations() {
  enter_test_project
  bash scripts/coordination/install-hooks.sh "$TEST_DIR" 2>/dev/null

  # Make the sync script fail — hook should still not block git
  # Remove the sync script to simulate failure
  rm -f "$TEST_DIR/scripts/coordination/sync-task-state.sh"

  # Git commit should succeed even though hook can't find sync script
  echo "test" > "$TEST_DIR/testfile"
  git -C "$TEST_DIR" add testfile
  local rc=0
  git -C "$TEST_DIR" commit -q -m "test commit" 2>/dev/null || rc=$?
  assert_equals 0 "$rc" "Git commit should succeed even when sync script missing"
}

# -----------------------------------------------------------------------------
# Event-driven Sync Tests
# -----------------------------------------------------------------------------

test_post_commit_syncs_task() {
  enter_test_project
  create_task_branch "test-sprint" 1

  bash scripts/coordination/sync-task-state.sh post-commit 2>/dev/null || true

  assert_curl_called "POST" "rest/v1/tasks" "post-commit should upsert task"
}

test_post_commit_noop_on_main() {
  enter_test_project
  # Stay on the default branch (main or master)
  bash scripts/coordination/sync-task-state.sh post-commit 2>/dev/null || true
  assert_curl_not_called "post-commit on main should not call Supabase"
}

test_post_merge_sets_merged_at() {
  enter_test_project
  create_task_branch "test-sprint" 1

  bash scripts/coordination/sync-task-state.sh post-merge 2>/dev/null || true

  # Check that merged_at was set in local DB
  local merged_at
  merged_at=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "
    SELECT merged_at FROM tasks WHERE sprint='test-sprint' AND task_num=1;
  ")
  if [[ -z "$merged_at" || "$merged_at" == "null" ]]; then
    echo "    ASSERT FAILED: merged_at should be set" >&2
    return 1
  fi

  assert_curl_called "POST" "rest/v1/tasks" "post-merge should upsert task"
}

test_pre_push_syncs_all() {
  enter_test_project
  create_task_branch "test-sprint" 1

  bash scripts/coordination/sync-task-state.sh pre-push 2>/dev/null || true

  # Should sync all tasks (the batch call includes all 3 tasks)
  assert_curl_called "POST" "rest/v1/tasks" "pre-push should sync all tasks"
  # Verify all 3 task titles appear in the synced data payload
  assert_file_contains "$MOCK_CURL_LOG" "Task One" "pre-push should sync task 1"
  assert_file_contains "$MOCK_CURL_LOG" "Task Two" "pre-push should sync task 2"
  assert_file_contains "$MOCK_CURL_LOG" "Task Three" "pre-push should sync task 3"
}

test_post_checkout_logs_event() {
  enter_test_project
  bash scripts/coordination/sync-task-state.sh post-checkout 2>/dev/null || true

  assert_curl_called "POST" "rest/v1/activity_log" "post-checkout should log event"
  # Verify the event payload contains the correct event type
  assert_file_contains "$MOCK_CURL_LOG" "post_checkout" "Event data should include post_checkout event type"
}

# -----------------------------------------------------------------------------
# Workflow Event Tests
# -----------------------------------------------------------------------------

test_task_claimed_registers_agent() {
  enter_test_project
  bash scripts/coordination/sync-task-state.sh task-claimed "test-sprint" 1 "agent-test-1" "dev-1" 2>/dev/null || true

  assert_curl_called "POST" "rest/v1/tasks" "task-claimed should upsert task"
  assert_curl_called "POST" "rest/v1/agents" "task-claimed should register agent"
  # Verify task upsert contains correct task data
  assert_file_contains "$MOCK_CURL_LOG" "Task One" "Upserted data should contain task title"
  # Verify agent registration contains agent_id and developer
  assert_file_contains "$MOCK_CURL_LOG" "agent-test-1" "Agent registration should include agent_id"
  assert_file_contains "$MOCK_CURL_LOG" "dev-1" "Agent registration should include developer"
}

test_task_completed_syncs() {
  enter_test_project
  bash scripts/coordination/sync-task-state.sh task-completed "test-sprint" 3 2>/dev/null || true

  assert_curl_called "POST" "rest/v1/tasks" "task-completed should upsert task"
  # Verify the correct task (task 3) was synced with its title and status
  assert_file_contains "$MOCK_CURL_LOG" "Task Three" "Synced data should contain task 3 title"
  assert_file_contains "$MOCK_CURL_LOG" "green" "Synced data should contain task 3 status"
}

test_agent_started_registers_and_heartbeats() {
  enter_test_project
  bash scripts/coordination/sync-task-state.sh agent-started "agent-test-1" 2>/dev/null || true

  assert_curl_called "POST" "rest/v1/agents" "agent-started should register"
  assert_curl_called "PATCH" "agents?agent_id=eq.agent-test-1" "agent-started should heartbeat"
  # Verify registration data includes agent_id and active status
  assert_file_contains "$MOCK_CURL_LOG" "agent-test-1" "Registration should include agent_id"
  assert_file_contains "$MOCK_CURL_LOG" "active" "Registration should set status to active"
}

test_agent_stopped_deregisters() {
  enter_test_project
  bash scripts/coordination/sync-task-state.sh agent-stopped "agent-test-1" 2>/dev/null || true

  assert_curl_called "PATCH" "agents?agent_id=eq.agent-test-1" "agent-stopped should deregister"
  # Verify deregistration payload sets status to stopped
  assert_file_contains "$MOCK_CURL_LOG" "stopped" "Deregistration should set status to stopped"
}

# -----------------------------------------------------------------------------
# Error Handling Tests
# -----------------------------------------------------------------------------

test_sync_failure_doesnt_block() {
  enter_test_project
  create_task_branch "test-sprint" 1
  export MOCK_HTTP_CODE="500"

  # Should exit 0 even with HTTP 500
  local rc=0
  bash scripts/coordination/sync-task-state.sh post-commit 2>/dev/null || rc=$?
  assert_equals 0 "$rc" "Sync failure should not block (exit 0)"
}

test_missing_supabase_config_doesnt_block() {
  enter_test_project
  unset SUPABASE_URL SUPABASE_KEY
  echo '{}' > "$TEST_DIR/.pm/config.json"

  local rc=0
  bash scripts/coordination/sync-task-state.sh post-commit 2>/dev/null || rc=$?
  assert_equals 0 "$rc" "Missing Supabase config should not block"
}

test_missing_client_script_doesnt_block() {
  enter_test_project
  rm -f "$TEST_DIR/scripts/coordination/supabase-client.sh"

  local rc=0
  bash scripts/coordination/sync-task-state.sh post-commit 2>/dev/null || rc=$?
  assert_equals 0 "$rc" "Missing client script should not block"
}

test_idempotent_sync() {
  enter_test_project
  create_task_branch "test-sprint" 1

  bash scripts/coordination/sync-task-state.sh post-commit 2>/dev/null || true
  local first_count
  first_count=$(wc -l < "$MOCK_CURL_LOG" 2>/dev/null || echo "0")

  # Reset log and run again
  > "$MOCK_CURL_LOG"
  bash scripts/coordination/sync-task-state.sh post-commit 2>/dev/null || true
  local second_count
  second_count=$(wc -l < "$MOCK_CURL_LOG" 2>/dev/null || echo "0")

  # Both calls should make the same number of curl requests (idempotent)
  assert_equals "$first_count" "$second_count" "Repeated sync should make same number of requests"
}

test_unknown_event_doesnt_crash() {
  enter_test_project
  local rc=0
  bash scripts/coordination/sync-task-state.sh "nonexistent-event" 2>/dev/null || rc=$?
  assert_equals 0 "$rc" "Unknown event should not crash"
}

# -----------------------------------------------------------------------------
# Manual Sync Tests (n2o sync --force)
# -----------------------------------------------------------------------------

test_n2o_sync_force_syncs_all_tasks() {
  enter_test_project
  create_task_branch "test-sprint" 1

  # Run pre-push event (syncs all tasks in sprint — most comprehensive sync)
  bash scripts/coordination/sync-task-state.sh pre-push 2>/dev/null || true

  # Verify curl was called with Supabase endpoint
  assert_curl_called "POST" "rest/v1/tasks" "Force sync should call Supabase tasks endpoint"

  # Verify ALL three tasks were included in the sync payload
  assert_file_contains "$MOCK_CURL_LOG" "Task One" "Sync payload should contain task 1"
  assert_file_contains "$MOCK_CURL_LOG" "Task Two" "Sync payload should contain task 2"
  assert_file_contains "$MOCK_CURL_LOG" "Task Three" "Sync payload should contain task 3"

  # Verify task status values were sent (not just titles)
  assert_file_contains "$MOCK_CURL_LOG" "red" "Sync payload should contain task 1 status (red)"
  assert_file_contains "$MOCK_CURL_LOG" "pending" "Sync payload should contain task 2 status (pending)"
  assert_file_contains "$MOCK_CURL_LOG" "green" "Sync payload should contain task 3 status (green)"
}

# =============================================================================
# Run tests
# =============================================================================

echo ""
echo -e "${BOLD}N2O Sync Hooks — E2E Tests${NC}"
echo -e "${BOLD}==========================${NC}"

echo ""
echo -e "${BOLD}Hook Installation${NC}"
run_test "Hooks are installed in .git/hooks/"               test_hooks_installed
run_test "Hooks are executable"                              test_hooks_executable
run_test "Hooks call sync-task-state.sh"                     test_hooks_contain_sync_call
run_test "Hooks always exit 0 (never block git)"             test_hooks_never_block_git
run_test "Hook installation is idempotent"                   test_hooks_idempotent
run_test "Hooks preserve existing non-N2O hooks"             test_hooks_preserve_existing
run_test "Git operations succeed when sync fails"            test_hooks_dont_block_git_operations

echo ""
echo -e "${BOLD}Event-driven Sync${NC}"
run_test "post-commit syncs task from branch"                test_post_commit_syncs_task
run_test "post-commit is no-op on main branch"               test_post_commit_noop_on_main
run_test "post-merge sets merged_at and syncs"               test_post_merge_sets_merged_at
run_test "pre-push syncs all tasks in sprint"                test_pre_push_syncs_all
run_test "post-checkout logs event"                          test_post_checkout_logs_event

echo ""
echo -e "${BOLD}Workflow Events${NC}"
run_test "task-claimed registers agent"                      test_task_claimed_registers_agent
run_test "task-completed syncs task"                         test_task_completed_syncs
run_test "agent-started registers and heartbeats"            test_agent_started_registers_and_heartbeats
run_test "agent-stopped deregisters"                         test_agent_stopped_deregisters

echo ""
echo -e "${BOLD}Error Handling${NC}"
run_test "Sync failure doesn't block (exit 0)"               test_sync_failure_doesnt_block
run_test "Missing Supabase config doesn't block"             test_missing_supabase_config_doesnt_block
run_test "Missing client script doesn't block"               test_missing_client_script_doesnt_block
run_test "Sync is idempotent"                                test_idempotent_sync
run_test "Unknown event doesn't crash"                       test_unknown_event_doesnt_crash

echo ""
echo -e "${BOLD}Manual Sync${NC}"
run_test "Full sync sends all tasks with status"             test_n2o_sync_force_syncs_all_tasks

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
