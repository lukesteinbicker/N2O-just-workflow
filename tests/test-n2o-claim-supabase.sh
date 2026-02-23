#!/bin/bash
set -uo pipefail

# =============================================================================
# E2E Tests for: Optimistic claiming with Supabase verification
#                (background verify in scripts/coordination/claim-task.sh)
# Covers: verify success, verify rejection + rollback, unreachable Supabase,
#         --no-verify flag, unconfigured Supabase
#
# Uses a mock curl to simulate Supabase responses.
# Pure bash — no external test frameworks required.
# Usage: bash tests/test-n2o-claim-supabase.sh
# =============================================================================

N2O_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLAIM_SCRIPT="$N2O_DIR/scripts/coordination/claim-task.sh"
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
  mkdir -p "$TEST_DIR/.pm" "$TEST_DIR/bin"

  # Create local tasks.db with schema + test data
  sqlite3 "$TEST_DIR/.pm/tasks.db" < "$SCHEMA"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "
    INSERT INTO tasks (sprint, task_num, title, type, status, priority, description, done_when, skills) VALUES
    ('test-sprint', 1, 'High priority task', 'infra', 'pending', 1.0, 'Do the high priority thing', 'Tests pass', 'infra'),
    ('test-sprint', 2, 'Medium priority task', 'frontend', 'pending', 2.0, 'Do the medium thing', 'UI renders', 'frontend'),
    ('test-sprint', 3, 'Low priority task', 'database', 'pending', 3.0, 'Do the low priority thing', 'Migration runs', 'database');
  "

  # Init git repo (needed for worktree operations)
  git -C "$TEST_DIR" init -q
  git -C "$TEST_DIR" config user.email "test@test.com"
  git -C "$TEST_DIR" config user.name "Test"
  echo "initial" > "$TEST_DIR/README.md"
  git -C "$TEST_DIR" add README.md
  git -C "$TEST_DIR" commit -q -m "initial"

  # Config with supabase settings
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

  # Create mock curl (same pattern as test-n2o-supabase.sh)
  MOCK_CURL_LOG="$TEST_DIR/curl_calls.log"
  cat > "$TEST_DIR/bin/curl" <<'MOCKCURL'
#!/bin/bash
LOG_FILE="${MOCK_CURL_LOG:-/tmp/mock_curl.log}"
MOCK_RESPONSE_FILE="${MOCK_RESPONSE_FILE:-}"
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
  if [ -n "$MOCK_RESPONSE_FILE" ] && [ -f "$MOCK_RESPONSE_FILE" ]; then
    cat "$MOCK_RESPONSE_FILE"
  else
    echo '[{"ok":true}]'
  fi
  echo ""
  echo "$MOCK_HTTP_CODE"
else
  if [ -n "$MOCK_RESPONSE_FILE" ] && [ -f "$MOCK_RESPONSE_FILE" ]; then
    cat "$MOCK_RESPONSE_FILE"
  else
    echo '[{"ok":true}]'
  fi
fi
MOCKCURL
  chmod +x "$TEST_DIR/bin/curl"

  export MOCK_CURL_LOG
  export MOCK_HTTP_CODE="200"
  export MOCK_RESPONSE_FILE=""
  export SUPABASE_URL="https://test-project.supabase.co"
  export SUPABASE_KEY="test-service-role-key-123"
  export PATH="$TEST_DIR/bin:$PATH"
}

teardown() {
  unset SUPABASE_URL SUPABASE_KEY MOCK_CURL_LOG MOCK_HTTP_CODE MOCK_RESPONSE_FILE
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

assert_dir_exists() {
  local path="$1"
  local msg="${2:-Directory should exist: $path}"
  if [[ ! -d "$path" ]]; then
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

# Helper: wait for background verification to complete
wait_for_background() {
  # Background verify is fast with mock curl — 2s is generous
  sleep 2
}

# -----------------------------------------------------------------------------
# Supabase verification tests
# -----------------------------------------------------------------------------

test_verify_success() {
  # Mock: Supabase returns the updated row (claim accepted)
  echo '[{"sprint":"test-sprint","task_num":1,"owner":"test-agent","status":"red"}]' \
    > "$TEST_DIR/mock_response.json"
  export MOCK_RESPONSE_FILE="$TEST_DIR/mock_response.json"

  local json
  json=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "test-agent" 2>/dev/null)
  assert_equals 0 $? "Should exit 0"

  wait_for_background

  # Task should still be claimed
  local owner
  owner=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT owner FROM tasks WHERE sprint = 'test-sprint' AND task_num = 1;")
  assert_equals "test-agent" "$owner" "Task should still be claimed after Supabase success"

  # No rejection sentinel
  assert_file_not_exists "$TEST_DIR/.pm/claim-rejected-test-sprint-1" "No sentinel on success"

  # Worktree should still exist
  assert_dir_exists "$TEST_DIR/.worktrees/test-sprint-1" "Worktree should still exist"

  # curl should have been called with PATCH for claim verification
  assert_file_contains "$MOCK_CURL_LOG" "PATCH" "Should have made a PATCH request"
  assert_file_contains "$MOCK_CURL_LOG" "tasks?sprint=eq.test-sprint" "Should target the correct task"
}

test_verify_rejection() {
  # Mock: Supabase returns empty array (someone else already claimed)
  echo '[]' > "$TEST_DIR/mock_response.json"
  export MOCK_RESPONSE_FILE="$TEST_DIR/mock_response.json"

  local json
  json=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "test-agent" 2>/dev/null)
  assert_equals 0 $? "Should exit 0 (JSON output succeeded)"

  # Verify initial JSON was for task 1
  local claimed_task
  claimed_task=$(echo "$json" | jq -r '.task_num')
  assert_equals "1" "$claimed_task" "Initial claim should be for task 1"

  wait_for_background

  # Task 1 should be unclaimed (Supabase rejected)
  local owner1
  owner1=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT owner FROM tasks WHERE sprint = 'test-sprint' AND task_num = 1;")
  if [[ -n "$owner1" ]]; then
    echo "    ASSERT FAILED: Task 1 should be unclaimed after rejection (owner=$owner1)" >&2
    return 1
  fi

  # Rejection sentinel should exist for task 1
  assert_file_exists "$TEST_DIR/.pm/claim-rejected-test-sprint-1" "Sentinel should exist for rejected task"

  # Sentinel should contain rejection info
  assert_file_contains "$TEST_DIR/.pm/claim-rejected-test-sprint-1" "supabase_rejected" "Sentinel should contain rejection reason"
}

test_verify_unreachable() {
  # Mock: Supabase returns HTTP 500 (server error = unreachable)
  echo '{"error":"Internal Server Error"}' > "$TEST_DIR/mock_response.json"
  export MOCK_RESPONSE_FILE="$TEST_DIR/mock_response.json"
  export MOCK_HTTP_CODE="500"

  local json
  json=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "test-agent" 2>/dev/null)
  assert_equals 0 $? "Should exit 0"

  wait_for_background

  # Task should STILL be claimed (local claim stands when Supabase unreachable)
  local owner
  owner=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT owner FROM tasks WHERE sprint = 'test-sprint' AND task_num = 1;")
  assert_equals "test-agent" "$owner" "Task should stay claimed when Supabase is unreachable"

  # No rejection sentinel
  assert_file_not_exists "$TEST_DIR/.pm/claim-rejected-test-sprint-1" "No sentinel when unreachable"

  # Worktree should still exist
  assert_dir_exists "$TEST_DIR/.worktrees/test-sprint-1" "Worktree should persist when Supabase unreachable"
}

test_no_verify_flag() {
  # With --no-verify, no Supabase interaction should happen
  echo '[]' > "$TEST_DIR/mock_response.json"
  export MOCK_RESPONSE_FILE="$TEST_DIR/mock_response.json"

  local json
  json=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "test-agent" --no-verify 2>/dev/null)
  assert_equals 0 $? "Should exit 0"

  wait_for_background

  # Task should be claimed normally
  local owner
  owner=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT owner FROM tasks WHERE sprint = 'test-sprint' AND task_num = 1;")
  assert_equals "test-agent" "$owner" "Task should be claimed"

  # No curl calls should have been made (mock curl log should not have PATCH)
  if [[ -f "$MOCK_CURL_LOG" ]] && grep -q "PATCH.*tasks" "$MOCK_CURL_LOG" 2>/dev/null; then
    echo "    ASSERT FAILED: --no-verify should skip Supabase verification" >&2
    return 1
  fi

  # No sentinel
  assert_file_not_exists "$TEST_DIR/.pm/claim-rejected-test-sprint-1" "No sentinel with --no-verify"
}

test_no_supabase_config() {
  # Without Supabase URL/key, verification should be skipped entirely
  unset SUPABASE_URL SUPABASE_KEY
  echo '{}' > "$TEST_DIR/.pm/config.json"

  local json
  json=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "test-agent" 2>/dev/null)
  assert_equals 0 $? "Should exit 0"

  wait_for_background

  # Task should be claimed normally
  local owner
  owner=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT owner FROM tasks WHERE sprint = 'test-sprint' AND task_num = 1;")
  assert_equals "test-agent" "$owner" "Task should be claimed without Supabase"

  # No PATCH calls to Supabase
  if [[ -f "$MOCK_CURL_LOG" ]] && grep -q "PATCH.*tasks" "$MOCK_CURL_LOG" 2>/dev/null; then
    echo "    ASSERT FAILED: Should not call Supabase when not configured" >&2
    return 1
  fi
}

test_cross_machine_rejection_falls_through() {
  # Simulate: agent-machine-B already owns task 1 on Supabase.
  # Our agent (machine-A) claims task 1 locally (optimistic), but Supabase
  # rejects (returns []) because agent-machine-B already has owner set.
  # Expected: task 1 rolled back, agent falls through to claim task 2.

  # Create a counter-based mock curl:
  # First PATCH → [] (rejected), second PATCH → success
  local call_counter="$TEST_DIR/curl_call_count"
  echo "0" > "$call_counter"
  cat > "$TEST_DIR/bin/curl" <<'MOCKCURL'
#!/bin/bash
LOG_FILE="${MOCK_CURL_LOG:-/tmp/mock_curl.log}"
COUNTER_FILE="${CURL_CALL_COUNTER:-/tmp/curl_count}"

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

# Count PATCH calls to tasks endpoint
if [[ "$method" == "PATCH" && "$url" == *"tasks?"* ]]; then
  count=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
  count=$((count + 1))
  echo "$count" > "$COUNTER_FILE"

  if [[ "$*" == *"-w"* ]]; then
    if [ "$count" -eq 1 ]; then
      # First claim attempt: rejected (another machine owns it)
      echo '[]'
    else
      # Second claim attempt: accepted
      echo '[{"sprint":"test-sprint","task_num":2,"owner":"test-agent","status":"red"}]'
    fi
    echo ""
    echo "200"
  else
    if [ "$count" -eq 1 ]; then
      echo '[]'
    else
      echo '[{"sprint":"test-sprint","task_num":2,"owner":"test-agent","status":"red"}]'
    fi
  fi
else
  if [[ "$*" == *"-w"* ]]; then
    echo '[{"ok":true}]'
    echo ""
    echo "200"
  else
    echo '[{"ok":true}]'
  fi
fi
MOCKCURL
  chmod +x "$TEST_DIR/bin/curl"
  export CURL_CALL_COUNTER="$call_counter"

  local json
  json=$(cd "$TEST_DIR" && bash "$CLAIM_SCRIPT" --agent-id "test-agent" 2>/dev/null)
  assert_equals 0 $? "Should exit 0 (initial claim)"

  # Initial claim should be task 1 (highest priority)
  local initial_task
  initial_task=$(echo "$json" | jq -r '.task_num')
  assert_equals "1" "$initial_task" "Should initially claim task 1"

  wait_for_background

  # After Supabase rejection, task 1 should be rolled back
  local owner1
  owner1=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COALESCE(owner, '') FROM tasks WHERE sprint = 'test-sprint' AND task_num = 1;")
  assert_equals "" "$owner1" "Task 1 should be unclaimed after cross-machine rejection"

  # Task 1 status should be reset to pending
  local status1
  status1=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT status FROM tasks WHERE sprint = 'test-sprint' AND task_num = 1;")
  assert_equals "pending" "$status1" "Task 1 should be pending after rejection rollback"

  # Rejection sentinel should exist for task 1
  assert_file_exists "$TEST_DIR/.pm/claim-rejected-test-sprint-1" "Sentinel should exist for cross-machine rejected task"

  # Sentinel should contain structured rejection data
  local sentinel_content
  sentinel_content=$(cat "$TEST_DIR/.pm/claim-rejected-test-sprint-1")
  assert_contains "$sentinel_content" "supabase_rejected" "Sentinel should contain rejection reason"
  assert_contains "$sentinel_content" "test-agent" "Sentinel should contain our agent_id"
  assert_contains "$sentinel_content" "test-sprint" "Sentinel should contain sprint"

  # Task 2 should now be claimed (fallthrough after rejection)
  local owner2
  owner2=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COALESCE(owner, '') FROM tasks WHERE sprint = 'test-sprint' AND task_num = 2;")
  assert_equals "test-agent" "$owner2" "Task 2 should be claimed after fallthrough"

  # Supabase should have been called twice (first rejected, second accepted)
  local patch_count
  patch_count=$(grep -c "PATCH.*tasks" "$MOCK_CURL_LOG" 2>/dev/null || echo "0")
  if [[ "$patch_count" -lt 2 ]]; then
    echo "    ASSERT FAILED: Expected at least 2 PATCH calls (reject + retry), got $patch_count" >&2
    return 1
  fi

  unset CURL_CALL_COUNTER
}

# =============================================================================
# Run tests
# =============================================================================

echo ""
echo -e "${BOLD}N2O Optimistic Claiming — Supabase Verification Tests${NC}"
echo -e "${BOLD}======================================================${NC}"

echo ""
echo -e "${BOLD}Supabase Background Verification${NC}"
run_test "Supabase accepts claim — task stays claimed"         test_verify_success
run_test "Supabase rejects claim — unclaim + sentinel"         test_verify_rejection
run_test "Supabase unreachable — local claim stands"           test_verify_unreachable
run_test "--no-verify skips Supabase verification"             test_no_verify_flag
run_test "No Supabase config — verification skipped"           test_no_supabase_config

echo ""
echo -e "${BOLD}Cross-Machine Coordination (Goal F)${NC}"
run_test "Rejection falls through to next task (cross-machine)"  test_cross_machine_rejection_falls_through

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
