#!/bin/bash
set -uo pipefail

# =============================================================================
# E2E Tests for: scripts/collect-transcripts.sh
# Pure bash — no external test frameworks required.
# Usage: bash tests/test-n2o-transcripts.sh
# =============================================================================

N2O_DIR="$(cd "$(dirname "$0")/.." && pwd)"
N2O="$N2O_DIR/n2o"
COLLECT="$N2O_DIR/scripts/collect-transcripts.sh"
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
CLAUDE_TEST_DIR=""
CURRENT_TEST=""

setup() {
  TEST_DIR=$(mktemp -d)
  # Init project to get DB with schema
  "$N2O" init "$TEST_DIR" > /dev/null 2>&1

  # Encode project path for Claude dir (same logic as collect-transcripts.sh)
  local encoded="${TEST_DIR//\//-}"
  encoded="${encoded#-}"
  CLAUDE_TEST_DIR="$HOME/.claude/projects/-${encoded}"
  mkdir -p "$CLAUDE_TEST_DIR"
}

teardown() {
  if [[ -n "$TEST_DIR" && -d "$TEST_DIR" ]]; then
    rm -rf "$TEST_DIR"
  fi
  if [[ -n "$CLAUDE_TEST_DIR" && -d "$CLAUDE_TEST_DIR" ]]; then
    rm -rf "$CLAUDE_TEST_DIR"
  fi
  TEST_DIR=""
  CLAUDE_TEST_DIR=""
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

assert_gt() {
  local val="$1"
  local threshold="$2"
  local msg="${3:-Expected $val > $threshold}"
  if [[ "$val" -le "$threshold" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_exit_code() {
  local expected="$1"
  shift
  local actual=0
  "$@" > /dev/null 2>&1 || actual=$?
  if [[ "$actual" -ne "$expected" ]]; then
    echo "    ASSERT FAILED: Expected exit code $expected, got $actual" >&2
    return 1
  fi
}

assert_not_empty() {
  local val="$1"
  local msg="${2:-Value should not be empty}"
  if [[ -z "$val" || "$val" == "NULL" || "$val" == "null" ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

# -----------------------------------------------------------------------------
# Fixture helpers
# -----------------------------------------------------------------------------

create_basic_fixture() {
  local dir="$1"
  local session_id="${2:-test-session-001}"
  mkdir -p "$dir"
  cat > "$dir/${session_id}.jsonl" <<JSONL
{"type":"user","sessionId":"$session_id","timestamp":"2025-02-20T10:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}
{"type":"assistant","sessionId":"$session_id","timestamp":"2025-02-20T10:00:05Z","message":{"role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"text","text":"Hi there"}],"usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":30,"cache_creation_input_tokens":10}}}
{"type":"user","sessionId":"$session_id","timestamp":"2025-02-20T10:00:10Z","message":{"role":"user","content":[{"type":"text","text":"Thanks"}]}}
{"type":"assistant","sessionId":"$session_id","timestamp":"2025-02-20T10:00:15Z","message":{"role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"text","text":"You're welcome"}],"usage":{"input_tokens":200,"output_tokens":80,"cache_read_input_tokens":50,"cache_creation_input_tokens":20}}}
JSONL
}

create_tool_call_fixture() {
  local dir="$1"
  local session_id="${2:-test-session-tools}"
  mkdir -p "$dir"
  cat > "$dir/${session_id}.jsonl" <<JSONL
{"type":"user","sessionId":"$session_id","timestamp":"2025-02-20T10:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Read a file"}]}}
{"type":"assistant","sessionId":"$session_id","timestamp":"2025-02-20T10:00:05Z","message":{"role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"tool_use","id":"toolu_read1","name":"Read","input":{"file_path":"/tmp/test.txt"}},{"type":"tool_use","id":"toolu_edit1","name":"Edit","input":{"file_path":"/tmp/test.txt","old_string":"a","new_string":"b"}}],"usage":{"input_tokens":300,"output_tokens":150}}}
JSONL
}

create_subagent_fixture() {
  local dir="$1"
  local parent_session_id="${2:-parent-session-001}"
  local agent_id="${3:-explore}"
  mkdir -p "$dir/sessions/$parent_session_id/subagents"
  cat > "$dir/sessions/$parent_session_id/subagents/agent-${agent_id}.jsonl" <<JSONL
{"type":"user","sessionId":"$parent_session_id","timestamp":"2025-02-20T10:01:00Z","message":{"role":"user","content":[{"type":"text","text":"Explore the codebase"}]}}
{"type":"assistant","sessionId":"$parent_session_id","timestamp":"2025-02-20T10:01:05Z","message":{"role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"tool_use","id":"toolu_glob1","name":"Glob","input":{"pattern":"**/*.ts"}}],"usage":{"input_tokens":80,"output_tokens":30}}}
JSONL
}

create_comprehensive_fixture() {
  local dir="$1"
  local session_id="${2:-test-session-comprehensive}"
  mkdir -p "$dir"
  cat > "$dir/${session_id}.jsonl" <<'FIXTURE_END'
{"type":"user","sessionId":"SESSION_ID","timestamp":"2025-02-20T10:00:00Z","cwd":"/home/dev/myproject","gitBranch":"feature/implement","message":{"role":"user","content":[{"type":"text","text":"Implement the feature"}]}}
{"type":"assistant","sessionId":"SESSION_ID","timestamp":"2025-02-20T10:00:05Z","cwd":"/home/dev/myproject","gitBranch":"feature/implement","message":{"role":"assistant","model":"claude-sonnet-4-20250514","stop_reason":"tool_use","content":[{"type":"thinking","text":"Let me think about this approach carefully and consider the options available"},{"type":"tool_use","id":"toolu_read1","name":"Read","input":{"file_path":"/tmp/test.txt"}}],"usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":10,"cache_creation_input_tokens":5,"service_tier":"standard","server_tool_use":{"web_search_requests":1,"web_fetch_requests":2}}}}
{"type":"user","sessionId":"SESSION_ID","timestamp":"2025-02-20T10:00:10Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_read1","content":"file contents here"}]},"toolUseResult":{"isError":false}}
{"type":"assistant","sessionId":"SESSION_ID","timestamp":"2025-02-20T10:00:15Z","message":{"role":"assistant","model":"claude-sonnet-4-20250514","stop_reason":"tool_use","content":[{"type":"thinking","text":"Now I need to edit this file with the fix"},{"type":"tool_use","id":"toolu_edit1","name":"Edit","input":{"file_path":"/tmp/test.txt","old_string":"a","new_string":"b"}}],"usage":{"input_tokens":200,"output_tokens":80,"cache_read_input_tokens":20,"cache_creation_input_tokens":10,"service_tier":"standard","server_tool_use":{"web_search_requests":0,"web_fetch_requests":1}}}}
{"type":"user","sessionId":"SESSION_ID","timestamp":"2025-02-20T10:00:20Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_edit1","content":"error: old_string not found"}]},"toolUseResult":{"isError":true}}
{"type":"system","sessionId":"SESSION_ID","timestamp":"2025-02-20T10:00:21Z","subtype":"turn_duration","durationMs":5000}
{"type":"system","sessionId":"SESSION_ID","timestamp":"2025-02-20T10:00:22Z","subtype":"error","error":"Rate limit exceeded","cause":"rate_limit"}
{"type":"system","sessionId":"SESSION_ID","timestamp":"2025-02-20T10:00:23Z","subtype":"retry","retryAttempt":1,"maxRetries":3}
{"type":"system","sessionId":"SESSION_ID","timestamp":"2025-02-20T10:00:24Z","subtype":"turn_duration","durationMs":3000}
{"type":"system","sessionId":"SESSION_ID","timestamp":"2025-02-20T10:00:25Z","subtype":"compaction"}
{"type":"assistant","sessionId":"SESSION_ID","timestamp":"2025-02-20T10:00:30Z","message":{"role":"assistant","model":"claude-sonnet-4-20250514","stop_reason":"end_turn","content":[{"type":"text","text":"Done! The feature is implemented."}],"usage":{"input_tokens":150,"output_tokens":30,"cache_read_input_tokens":40,"cache_creation_input_tokens":15,"service_tier":"standard"}}}
{"type":"queue-operation","sessionId":"SESSION_ID","timestamp":"2025-02-20T10:00:31Z","operation":"enqueue","content":"<task-notification><task-id>bg123</task-id><status>completed</status></task-notification>"}
{"type":"queue-operation","sessionId":"SESSION_ID","timestamp":"2025-02-20T10:00:32Z","operation":"dequeue","content":"<task-notification><task-id>bg123</task-id></task-notification>"}
FIXTURE_END
  # Replace SESSION_ID placeholder with actual session_id
  sed -i '' "s/SESSION_ID/$session_id/g" "$dir/${session_id}.jsonl"
}

create_sidechain_fixture() {
  local dir="$1"
  local session_id="${2:-test-session-sidechain}"
  mkdir -p "$dir"
  cat > "$dir/${session_id}.jsonl" <<JSONL
{"type":"user","sessionId":"$session_id","timestamp":"2025-02-20T10:00:00Z","isSidechain":true,"message":{"role":"user","content":[{"type":"text","text":"Quick check"}]}}
{"type":"assistant","sessionId":"$session_id","timestamp":"2025-02-20T10:00:05Z","message":{"role":"assistant","model":"claude-sonnet-4-20250514","stop_reason":"end_turn","content":[{"type":"text","text":"Checked"}],"usage":{"input_tokens":50,"output_tokens":20}}}
JSONL
}

# -----------------------------------------------------------------------------
# Tests
# -----------------------------------------------------------------------------

test_transcript_basic_parse() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local count
  count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM transcripts;")
  assert_equals "1" "$count" "Should have 1 transcript row"

  local msg_count
  msg_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT message_count FROM transcripts LIMIT 1;")
  assert_equals "4" "$msg_count" "Should have 4 messages total"

  local user_count
  user_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT user_message_count FROM transcripts LIMIT 1;")
  assert_equals "2" "$user_count" "Should have 2 user messages"

  local assistant_count
  assistant_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT assistant_message_count FROM transcripts LIMIT 1;")
  assert_equals "2" "$assistant_count" "Should have 2 assistant messages"
}

test_transcript_token_extraction() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local input_tokens
  input_tokens=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT total_input_tokens FROM transcripts LIMIT 1;")
  assert_equals "300" "$input_tokens" "Input tokens should be 100+200=300"

  local output_tokens
  output_tokens=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT total_output_tokens FROM transcripts LIMIT 1;")
  assert_equals "130" "$output_tokens" "Output tokens should be 50+80=130"
}

test_transcript_tool_call_events() {
  create_tool_call_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local event_count
  event_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM workflow_events WHERE event_type='tool_call';")
  assert_equals "2" "$event_count" "Should have 2 tool call events"

  local read_count
  read_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM workflow_events WHERE tool_name='Read';")
  assert_equals "1" "$read_count" "Should have 1 Read event"

  local edit_count
  edit_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM workflow_events WHERE tool_name='Edit';")
  assert_equals "1" "$edit_count" "Should have 1 Edit event"

  # Check tool_calls_in_msg is 2 (both tools in same message)
  local tcim
  tcim=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT tool_calls_in_msg FROM workflow_events LIMIT 1;")
  assert_equals "2" "$tcim" "tool_calls_in_msg should be 2"
}

test_transcript_subagent_detection() {
  create_subagent_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local count
  count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM transcripts;")
  assert_equals "1" "$count" "Should have 1 transcript row"

  local parent
  parent=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT parent_session_id FROM transcripts LIMIT 1;")
  assert_equals "parent-session-001" "$parent" "parent_session_id should be set"

  local agent
  agent=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT agent_id FROM transcripts LIMIT 1;")
  assert_equals "explore" "$agent" "agent_id should be 'explore'"
}

test_transcript_model_extraction() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local model
  model=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT model FROM transcripts LIMIT 1;")
  assert_equals "claude-sonnet-4-20250514" "$model" "Model should be extracted from JSONL"
}

test_transcript_idempotency() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1
  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local count
  count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM transcripts;")
  assert_equals "1" "$count" "Running twice should still have 1 transcript row"
}

test_transcript_reparse() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local id_before
  id_before=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT id FROM transcripts LIMIT 1;")

  (cd "$TEST_DIR" && bash "$COLLECT" --reparse) > /dev/null 2>&1

  local count
  count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM transcripts;")
  assert_equals "1" "$count" "Reparse should still have 1 transcript row"

  local id_after
  id_after=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT id FROM transcripts LIMIT 1;")
  # After reparse, the row was deleted and re-inserted so id should differ
  if [[ "$id_before" == "$id_after" ]]; then
    echo "    ASSERT FAILED: Reparse should create a new row (id before=$id_before, after=$id_after)" >&2
    return 1
  fi
}

test_transcript_multiple_files() {
  create_basic_fixture "$CLAUDE_TEST_DIR" "session-aaa"
  create_basic_fixture "$CLAUDE_TEST_DIR" "session-bbb"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local count
  count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM transcripts;")
  assert_equals "2" "$count" "Should have 2 transcript rows for 2 JSONL files"
}

test_transcript_no_db() {
  rm -f "$TEST_DIR/.pm/tasks.db"

  local exit_code=0
  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1 || exit_code=$?

  assert_equals "1" "$exit_code" "Should exit 1 when database is missing"
}

test_transcript_no_claude_dir() {
  # Remove the Claude test dir so the script can't find it
  rm -rf "$CLAUDE_TEST_DIR"

  local exit_code=0
  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1 || exit_code=$?

  assert_equals "1" "$exit_code" "Should exit 1 when Claude projects dir is missing"
}

test_transcript_session_to_task_linkage() {
  # Create a task with session_id, then a transcript with that session
  local db="$TEST_DIR/.pm/tasks.db"
  local session_id="linked-session-001"

  sqlite3 "$db" "INSERT INTO tasks (sprint, task_num, title, status, session_id) VALUES ('s1', 1, 'Test task', 'red', '$session_id');"
  create_basic_fixture "$CLAUDE_TEST_DIR" "$session_id"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local sprint
  sprint=$(sqlite3 "$db" "SELECT sprint FROM transcripts WHERE session_id = '$session_id';")
  assert_equals "s1" "$sprint" "Transcript sprint should be linked to task"

  local task_num
  task_num=$(sqlite3 "$db" "SELECT task_num FROM transcripts WHERE session_id = '$session_id';")
  assert_equals "1" "$task_num" "Transcript task_num should be linked to task"

  # Workflow events should also have sprint/task_num if any
  local event_sprint
  event_sprint=$(sqlite3 "$db" "SELECT DISTINCT sprint FROM workflow_events WHERE session_id = '$session_id' AND sprint IS NOT NULL LIMIT 1;" 2>/dev/null)
  # Only check if events exist (basic fixture has no tool calls)
  if [[ -n "$event_sprint" ]]; then
    assert_equals "s1" "$event_sprint" "Workflow events should have sprint linkage"
  fi
}

test_transcript_user_message_timestamps() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local timestamps
  timestamps=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT user_message_timestamps FROM transcripts LIMIT 1;")
  assert_not_empty "$timestamps" "user_message_timestamps should not be empty"

  # Should be a JSON array with 2 entries (2 user messages in basic fixture)
  local ts_count
  ts_count=$(echo "$timestamps" | jq 'length' 2>/dev/null)
  assert_equals "2" "$ts_count" "Should have 2 user message timestamps"

  # First timestamp should be the one from the fixture
  local first_ts
  first_ts=$(echo "$timestamps" | jq -r '.[0]' 2>/dev/null)
  assert_equals "2025-02-20T10:00:00Z" "$first_ts" "First user timestamp should match fixture"
}

test_transcript_cache_tokens() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local cache_read
  cache_read=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT cache_read_tokens FROM transcripts LIMIT 1;")
  assert_equals "80" "$cache_read" "cache_read_tokens should be 30+50=80"

  local cache_creation
  cache_creation=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT cache_creation_tokens FROM transcripts LIMIT 1;")
  assert_equals "30" "$cache_creation" "cache_creation_tokens should be 10+20=30"
}

test_transcript_user_content_length() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local content_len
  content_len=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT total_user_content_length FROM transcripts LIMIT 1;")
  # "Hello" (5) + "Thanks" (6) = 11
  assert_equals "11" "$content_len" "total_user_content_length should be 5+6=11"
}

test_transcript_stop_reason_counts() {
  create_comprehensive_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local stop_reasons
  stop_reasons=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT stop_reason_counts FROM transcripts LIMIT 1;")
  assert_not_empty "$stop_reasons" "stop_reason_counts should not be empty"

  # Comprehensive fixture: 2x tool_use, 1x end_turn
  local tool_use_count
  tool_use_count=$(echo "$stop_reasons" | jq '.tool_use // 0' 2>/dev/null)
  assert_equals "2" "$tool_use_count" "Should have 2 tool_use stop reasons"

  local end_turn_count
  end_turn_count=$(echo "$stop_reasons" | jq '.end_turn // 0' 2>/dev/null)
  assert_equals "1" "$end_turn_count" "Should have 1 end_turn stop reason"
}

test_transcript_thinking_blocks() {
  create_comprehensive_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local thinking_count
  thinking_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT thinking_message_count FROM transcripts LIMIT 1;")
  assert_equals "2" "$thinking_count" "Should have 2 messages with thinking blocks"

  local thinking_len
  thinking_len=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT thinking_total_length FROM transcripts LIMIT 1;")
  # "Let me think about this approach carefully and consider the options available" = 76
  # "Now I need to edit this file with the fix" = 42
  assert_equals "118" "$thinking_len" "Thinking total length should be 76+42=118"
}

test_transcript_service_tier() {
  create_comprehensive_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local tier
  tier=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT service_tier FROM transcripts LIMIT 1;")
  assert_equals "standard" "$tier" "service_tier should be 'standard'"
}

test_transcript_sidechain_detection() {
  create_sidechain_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local has_sc
  has_sc=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT has_sidechain FROM transcripts LIMIT 1;")
  assert_equals "1" "$has_sc" "has_sidechain should be 1 for sidechain session"
}

test_transcript_no_sidechain() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local has_sc
  has_sc=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT has_sidechain FROM transcripts LIMIT 1;")
  assert_equals "0" "$has_sc" "has_sidechain should be 0 for normal session"
}

test_transcript_system_errors() {
  create_comprehensive_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local err_count
  err_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT system_error_count FROM transcripts LIMIT 1;")
  assert_equals "1" "$err_count" "system_error_count should be 1"

  local retry_count
  retry_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT system_retry_count FROM transcripts LIMIT 1;")
  assert_equals "1" "$retry_count" "system_retry_count should be 1"
}

test_transcript_avg_turn_duration() {
  create_comprehensive_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local avg_ms
  avg_ms=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT avg_turn_duration_ms FROM transcripts LIMIT 1;")
  # Two turn_duration messages: 5000ms and 3000ms -> avg = 4000ms
  assert_equals "4000" "$avg_ms" "avg_turn_duration_ms should be (5000+3000)/2 = 4000"
}

test_transcript_tool_result_errors() {
  create_comprehensive_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local tool_errors
  tool_errors=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT tool_result_error_count FROM transcripts LIMIT 1;")
  assert_equals "1" "$tool_errors" "tool_result_error_count should be 1 (one isError=true)"
}

test_transcript_compaction_count() {
  create_comprehensive_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local compactions
  compactions=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT compaction_count FROM transcripts LIMIT 1;")
  assert_equals "1" "$compactions" "compaction_count should be 1"
}

test_transcript_cwd_extraction() {
  create_comprehensive_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local cwd
  cwd=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT cwd FROM transcripts LIMIT 1;")
  assert_equals "/home/dev/myproject" "$cwd" "cwd should be extracted from first message"
}

test_transcript_git_branch_extraction() {
  create_comprehensive_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local branch
  branch=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT git_branch FROM transcripts LIMIT 1;")
  assert_equals "feature/implement" "$branch" "git_branch should be extracted from first message"
}

test_transcript_assistant_timestamps() {
  create_comprehensive_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local timestamps
  timestamps=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT assistant_message_timestamps FROM transcripts LIMIT 1;")
  assert_not_empty "$timestamps" "assistant_message_timestamps should not be empty"

  # Comprehensive fixture has 3 assistant messages
  local ts_count
  ts_count=$(echo "$timestamps" | jq 'length' 2>/dev/null)
  assert_equals "3" "$ts_count" "Should have 3 assistant message timestamps"

  # First assistant timestamp should match fixture
  local first_ts
  first_ts=$(echo "$timestamps" | jq -r '.[0]' 2>/dev/null)
  assert_equals "2025-02-20T10:00:05Z" "$first_ts" "First assistant timestamp should match fixture"

  # Last assistant timestamp
  local last_ts
  last_ts=$(echo "$timestamps" | jq -r '.[-1]' 2>/dev/null)
  assert_equals "2025-02-20T10:00:30Z" "$last_ts" "Last assistant timestamp should match fixture"
}

test_transcript_background_task_count() {
  create_comprehensive_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local bg_count
  bg_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT background_task_count FROM transcripts LIMIT 1;")
  assert_equals "2" "$bg_count" "background_task_count should be 2 (enqueue + dequeue)"
}

test_transcript_web_search_count() {
  create_comprehensive_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local web_count
  web_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT web_search_count FROM transcripts LIMIT 1;")
  # First assistant: 1 search + 2 fetch = 3. Second assistant: 0 + 1 = 1. Third: 0. Total = 4
  assert_equals "4" "$web_count" "web_search_count should be (1+2)+(0+1)+0 = 4"
}

test_transcript_mid_session_update() {
  # Simulate a growing session: collect once, append more messages, collect again
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  # Verify initial state: 4 messages (2 user, 2 assistant)
  local msg_count
  msg_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT message_count FROM transcripts LIMIT 1;")
  assert_equals "4" "$msg_count" "Initial collection should have 4 messages"

  # Append more messages to the same JSONL file (simulates ongoing session)
  cat >> "$CLAUDE_TEST_DIR/test-session-001.jsonl" <<JSONL
{"type":"user","sessionId":"test-session-001","timestamp":"2025-02-20T10:00:20Z","message":{"role":"user","content":[{"type":"text","text":"Another question"}]}}
{"type":"assistant","sessionId":"test-session-001","timestamp":"2025-02-20T10:00:25Z","message":{"role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"text","text":"Another answer"}],"usage":{"input_tokens":300,"output_tokens":100}}}
JSONL

  # Re-collect — should detect file growth and UPDATE
  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  # Should now have 6 messages (same row, updated in place)
  msg_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT message_count FROM transcripts LIMIT 1;")
  assert_equals "6" "$msg_count" "After growth, should have 6 messages (updated in place)"

  # Should still be exactly 1 transcript row (not 2)
  local row_count
  row_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM transcripts;")
  assert_equals "1" "$row_count" "Should still be 1 row after UPDATE (not duplicate)"

  # Token counts should reflect the new messages too
  local input_tokens
  input_tokens=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT total_input_tokens FROM transcripts LIMIT 1;")
  assert_equals "600" "$input_tokens" "Input tokens should include new messages (100+200+300=600)"

  # synced_at should be reset to NULL (needs re-sync to cloud)
  local synced
  synced=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT synced_at FROM transcripts LIMIT 1;")
  assert_equals "" "$synced" "synced_at should be NULL after UPDATE (needs re-sync)"
}

test_transcript_truncated_file_recovery() {
  # Simulate a crash: valid JSONL lines followed by a truncated last line
  mkdir -p "$CLAUDE_TEST_DIR"
  cat > "$CLAUDE_TEST_DIR/test-session-truncated.jsonl" <<'JSONL'
{"type":"user","sessionId":"test-session-truncated","timestamp":"2025-02-20T10:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}
{"type":"assistant","sessionId":"test-session-truncated","timestamp":"2025-02-20T10:00:05Z","message":{"role":"assistant","model":"claude-sonnet-4-20250514","stop_reason":"end_turn","content":[{"type":"text","text":"Hi there"}],"usage":{"input_tokens":100,"output_tokens":50}}}
{"type":"user","sessionId":"test-session-truncated","timestamp":"2025-02-20T10:00:10Z","message":{"role":"user","conte
JSONL

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  # Should have indexed the session despite the truncated last line
  local count
  count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM transcripts WHERE session_id = 'test-session-truncated';")
  assert_equals "1" "$count" "Truncated file should still be indexed"

  # Should have recovered 2 valid messages (user + assistant)
  local msg_count
  msg_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT message_count FROM transcripts WHERE session_id = 'test-session-truncated';")
  assert_equals "2" "$msg_count" "Should recover 2 valid messages from truncated file"
}

# -----------------------------------------------------------------------------
# Tests: Message + Tool Call extraction (NOS Transcript Sync)
# -----------------------------------------------------------------------------

test_messages_basic_extraction() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  # Should have 4 messages (2 user, 2 assistant)
  local msg_count
  msg_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM messages;")
  assert_equals "4" "$msg_count" "Should have 4 message rows"

  # Check user message count
  local user_count
  user_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM messages WHERE role = 'user';")
  assert_equals "2" "$user_count" "Should have 2 user messages"

  # Check assistant message count
  local asst_count
  asst_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM messages WHERE role = 'assistant';")
  assert_equals "2" "$asst_count" "Should have 2 assistant messages"
}

test_messages_content() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  # First user message content should be "Hello"
  local first_content
  first_content=$(sqlite3 "$db" "SELECT content FROM messages WHERE role = 'user' ORDER BY message_index LIMIT 1;")
  assert_equals "Hello" "$first_content" "First user message should be 'Hello'"

  # First assistant message content should be "Hi there"
  local asst_content
  asst_content=$(sqlite3 "$db" "SELECT content FROM messages WHERE role = 'assistant' ORDER BY message_index LIMIT 1;")
  assert_equals "Hi there" "$asst_content" "First assistant message should be 'Hi there'"
}

test_messages_timestamps() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  local first_ts
  first_ts=$(sqlite3 "$db" "SELECT timestamp FROM messages ORDER BY message_index LIMIT 1;")
  assert_equals "2025-02-20T10:00:00Z" "$first_ts" "First message timestamp should match fixture"

  local last_ts
  last_ts=$(sqlite3 "$db" "SELECT timestamp FROM messages ORDER BY message_index DESC LIMIT 1;")
  assert_equals "2025-02-20T10:00:15Z" "$last_ts" "Last message timestamp should match fixture"
}

test_messages_session_id() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  # All messages should have the correct session_id
  local distinct_sessions
  distinct_sessions=$(sqlite3 "$db" "SELECT COUNT(DISTINCT session_id) FROM messages;")
  assert_equals "1" "$distinct_sessions" "All messages should have same session_id"

  local session_id
  session_id=$(sqlite3 "$db" "SELECT session_id FROM messages LIMIT 1;")
  assert_equals "test-session-001" "$session_id" "session_id should match fixture"
}

test_messages_message_index() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  # message_index should be sequential (0, 1, 2, 3)
  local indexes
  indexes=$(sqlite3 "$db" "SELECT GROUP_CONCAT(message_index, ',') FROM messages ORDER BY message_index;")
  assert_equals "0,1,2,3" "$indexes" "message_index should be 0,1,2,3"
}

test_messages_assistant_metadata() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  # First assistant message should have model, tokens
  local model
  model=$(sqlite3 "$db" "SELECT model FROM messages WHERE role = 'assistant' ORDER BY message_index LIMIT 1;")
  assert_equals "claude-sonnet-4-20250514" "$model" "Assistant message should have model"

  local input_tokens
  input_tokens=$(sqlite3 "$db" "SELECT input_tokens FROM messages WHERE role = 'assistant' ORDER BY message_index LIMIT 1;")
  assert_equals "100" "$input_tokens" "First assistant input_tokens should be 100"

  local output_tokens
  output_tokens=$(sqlite3 "$db" "SELECT output_tokens FROM messages WHERE role = 'assistant' ORDER BY message_index LIMIT 1;")
  assert_equals "50" "$output_tokens" "First assistant output_tokens should be 50"
}

test_tool_calls_extraction() {
  create_tool_call_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  # Should have 2 tool calls (Read + Edit in same message)
  local tc_count
  tc_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM tool_calls;")
  assert_equals "2" "$tc_count" "Should have 2 tool_call rows"

  # Check tool names
  local read_count
  read_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM tool_calls WHERE tool_name = 'Read';")
  assert_equals "1" "$read_count" "Should have 1 Read tool call"

  local edit_count
  edit_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM tool_calls WHERE tool_name = 'Edit';")
  assert_equals "1" "$edit_count" "Should have 1 Edit tool call"
}

test_tool_calls_full_input() {
  create_tool_call_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  # Read tool call should have full input JSON with file_path
  local read_input
  read_input=$(sqlite3 "$db" "SELECT input FROM tool_calls WHERE tool_name = 'Read';")
  local read_file_path
  read_file_path=$(echo "$read_input" | jq -r '.file_path' 2>/dev/null)
  assert_equals "/tmp/test.txt" "$read_file_path" "Read input should have file_path"

  # Edit tool call should have full input with old_string and new_string (NO truncation)
  local edit_input
  edit_input=$(sqlite3 "$db" "SELECT input FROM tool_calls WHERE tool_name = 'Edit';")
  local old_string
  old_string=$(echo "$edit_input" | jq -r '.old_string' 2>/dev/null)
  assert_equals "a" "$old_string" "Edit input should have old_string"

  local new_string
  new_string=$(echo "$edit_input" | jq -r '.new_string' 2>/dev/null)
  assert_equals "b" "$new_string" "Edit input should have new_string"
}

test_tool_calls_positioning() {
  create_tool_call_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  # Both tool calls should have message_index = 1 (second message, the assistant one)
  local msg_indexes
  msg_indexes=$(sqlite3 "$db" "SELECT GROUP_CONCAT(message_index, ',') FROM tool_calls ORDER BY tool_index;")
  assert_equals "1,1" "$msg_indexes" "Both tool calls should be in message_index 1"

  # tool_index should be 0 and 1
  local tool_indexes
  tool_indexes=$(sqlite3 "$db" "SELECT GROUP_CONCAT(tool_index, ',') FROM tool_calls ORDER BY tool_index;")
  assert_equals "0,1" "$tool_indexes" "tool_index should be 0,1"
}

test_tool_calls_tool_use_id() {
  create_tool_call_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  local read_id
  read_id=$(sqlite3 "$db" "SELECT tool_use_id FROM tool_calls WHERE tool_name = 'Read';")
  assert_equals "toolu_read1" "$read_id" "Read tool_use_id should match fixture"

  local edit_id
  edit_id=$(sqlite3 "$db" "SELECT tool_use_id FROM tool_calls WHERE tool_name = 'Edit';")
  assert_equals "toolu_edit1" "$edit_id" "Edit tool_use_id should match fixture"
}

test_messages_idempotency() {
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1
  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  # Running twice should NOT duplicate messages
  local msg_count
  msg_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM messages;")
  assert_equals "4" "$msg_count" "Running twice should still have 4 message rows (no duplicates)"

  # And no duplicate tool calls
  create_tool_call_fixture "$CLAUDE_TEST_DIR" "session-tc-idem"
  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1
  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local tc_count
  tc_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM tool_calls WHERE session_id = 'session-tc-idem';")
  assert_equals "2" "$tc_count" "Running twice should still have 2 tool_call rows for session"
}

test_messages_update_mode() {
  # Simulate growing session: collect once, append, collect again
  create_basic_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"
  local msg_count
  msg_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM messages WHERE session_id = 'test-session-001';")
  assert_equals "4" "$msg_count" "Initial: should have 4 messages"

  # Append more messages
  cat >> "$CLAUDE_TEST_DIR/test-session-001.jsonl" <<JSONL
{"type":"user","sessionId":"test-session-001","timestamp":"2025-02-20T10:00:20Z","message":{"role":"user","content":[{"type":"text","text":"Another question"}]}}
{"type":"assistant","sessionId":"test-session-001","timestamp":"2025-02-20T10:00:25Z","message":{"role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"text","text":"Another answer"}],"usage":{"input_tokens":300,"output_tokens":100}}}
JSONL

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  # Should now have 6 messages (deleted old, re-inserted all)
  msg_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM messages WHERE session_id = 'test-session-001';")
  assert_equals "6" "$msg_count" "After growth: should have 6 messages"

  # synced_at should be NULL (needs re-sync)
  local synced
  synced=$(sqlite3 "$db" "SELECT COALESCE(synced_at, 'NULL') FROM messages WHERE session_id = 'test-session-001' LIMIT 1;")
  assert_equals "NULL" "$synced" "synced_at should be NULL after update"
}

test_reparse_clears_messages_and_tool_calls() {
  create_basic_fixture "$CLAUDE_TEST_DIR"
  create_tool_call_fixture "$CLAUDE_TEST_DIR" "session-tc-reparse"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  # Verify data exists before reparse
  local msg_before
  msg_before=$(sqlite3 "$db" "SELECT COUNT(*) FROM messages;")
  assert_gt "$msg_before" "0" "Should have messages before reparse"

  local tc_before
  tc_before=$(sqlite3 "$db" "SELECT COUNT(*) FROM tool_calls;")
  assert_gt "$tc_before" "0" "Should have tool_calls before reparse"

  # Reparse should clear and re-collect
  (cd "$TEST_DIR" && bash "$COLLECT" --reparse) > /dev/null 2>&1

  # Should still have data (re-collected after clearing)
  local msg_after
  msg_after=$(sqlite3 "$db" "SELECT COUNT(*) FROM messages;")
  assert_equals "$msg_before" "$msg_after" "Should have same message count after reparse (cleared then re-collected)"

  local tc_after
  tc_after=$(sqlite3 "$db" "SELECT COUNT(*) FROM tool_calls;")
  assert_equals "$tc_before" "$tc_after" "Should have same tool_call count after reparse (cleared then re-collected)"
}

test_subagent_messages_session_id_normalized() {
  create_subagent_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  # Subagent session_id should be normalized as parent_session_id/agent_id
  local msg_session
  msg_session=$(sqlite3 "$db" "SELECT session_id FROM messages LIMIT 1;")
  assert_equals "parent-session-001/explore" "$msg_session" "Subagent message session_id should be normalized"

  # Transcript session_id should match
  local tr_session
  tr_session=$(sqlite3 "$db" "SELECT session_id FROM transcripts LIMIT 1;")
  assert_equals "$msg_session" "$tr_session" "Message session_id should match transcript session_id"

  # Tool calls should also have normalized session_id
  local tc_session
  tc_session=$(sqlite3 "$db" "SELECT session_id FROM tool_calls LIMIT 1;")
  assert_equals "parent-session-001/explore" "$tc_session" "Subagent tool_call session_id should be normalized"
}

test_comprehensive_messages_and_tools() {
  create_comprehensive_fixture "$CLAUDE_TEST_DIR"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  # Comprehensive fixture has: 2 user, 3 assistant messages (including tool_result user messages)
  # user messages: "Implement the feature" + tool_result (content block) + tool_result (content block)
  # assistant messages: thinking+Read, thinking+Edit, text-only
  # We count user/assistant messages from the JSONL (type=user, type=assistant)
  # There are 3 type=user and 3 type=assistant in the comprehensive fixture
  local asst_count
  asst_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM messages WHERE role = 'assistant';")
  assert_equals "3" "$asst_count" "Should have 3 assistant messages"

  # Should have 2 tool calls (Read + Edit)
  local tc_count
  tc_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM tool_calls;")
  assert_equals "2" "$tc_count" "Should have 2 tool calls (Read + Edit)"

  # Assistant message with text-only content should have the right text
  local text_msg
  text_msg=$(sqlite3 "$db" "SELECT content FROM messages WHERE role = 'assistant' ORDER BY message_index DESC LIMIT 1;")
  assert_equals "Done! The feature is implemented." "$text_msg" "Last assistant message should have text content"

  # Stop reason should be captured
  local stop_reason
  stop_reason=$(sqlite3 "$db" "SELECT stop_reason FROM messages WHERE role = 'assistant' ORDER BY message_index DESC LIMIT 1;")
  assert_equals "end_turn" "$stop_reason" "Last assistant should have stop_reason end_turn"
}

test_messages_multiple_sessions() {
  create_basic_fixture "$CLAUDE_TEST_DIR" "session-aaa"
  create_basic_fixture "$CLAUDE_TEST_DIR" "session-bbb"

  (cd "$TEST_DIR" && bash "$COLLECT") > /dev/null 2>&1

  local db="$TEST_DIR/.pm/tasks.db"

  # Should have 8 messages total (4 per session)
  local msg_count
  msg_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM messages;")
  assert_equals "8" "$msg_count" "Should have 8 messages for 2 sessions"

  # Each session should have 4 messages
  local aaa_count
  aaa_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM messages WHERE session_id = 'session-aaa';")
  assert_equals "4" "$aaa_count" "session-aaa should have 4 messages"

  local bbb_count
  bbb_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM messages WHERE session_id = 'session-bbb';")
  assert_equals "4" "$bbb_count" "session-bbb should have 4 messages"
}

# =============================================================================
# Run tests
# =============================================================================

echo ""
echo -e "${BOLD}N2O Transcripts — E2E Tests${NC}"
echo -e "${BOLD}===========================${NC}"
echo ""

run_test "Basic JSONL parsing"                     test_transcript_basic_parse
run_test "Token extraction sums"                   test_transcript_token_extraction
run_test "Tool call events"                        test_transcript_tool_call_events
run_test "Subagent detection"                      test_transcript_subagent_detection
run_test "Model extraction"                        test_transcript_model_extraction
run_test "Idempotency — skip already indexed"      test_transcript_idempotency
run_test "Reparse deletes and re-inserts"          test_transcript_reparse
run_test "Multiple JSONL files"                    test_transcript_multiple_files
run_test "Missing database exits 1"                test_transcript_no_db
run_test "Missing Claude dir exits 1"              test_transcript_no_claude_dir
run_test "Session-to-task linkage"                  test_transcript_session_to_task_linkage
run_test "User message timestamps"                  test_transcript_user_message_timestamps
run_test "Cache token extraction"                   test_transcript_cache_tokens
run_test "User content length"                      test_transcript_user_content_length
run_test "Stop reason counts"                       test_transcript_stop_reason_counts
run_test "Thinking block extraction"                 test_transcript_thinking_blocks
run_test "Service tier extraction"                   test_transcript_service_tier
run_test "Sidechain detection (true)"                test_transcript_sidechain_detection
run_test "Sidechain detection (false)"               test_transcript_no_sidechain
run_test "System error and retry counts"             test_transcript_system_errors
run_test "Average turn duration"                     test_transcript_avg_turn_duration
run_test "Tool result error count"                   test_transcript_tool_result_errors
run_test "Compaction count"                          test_transcript_compaction_count
run_test "Working directory extraction"              test_transcript_cwd_extraction
run_test "Git branch extraction"                     test_transcript_git_branch_extraction
run_test "Assistant message timestamps"              test_transcript_assistant_timestamps
run_test "Background task count"                     test_transcript_background_task_count
run_test "Web search/fetch count"                    test_transcript_web_search_count
run_test "Mid-session update (file grew)"            test_transcript_mid_session_update
run_test "Truncated file recovery (crash)"           test_transcript_truncated_file_recovery

echo ""
echo -e "${BOLD}Message + Tool Call Extraction (NOS Transcript Sync)${NC}"
echo ""

run_test "Messages: basic extraction"                 test_messages_basic_extraction
run_test "Messages: content matches fixture"          test_messages_content
run_test "Messages: timestamps"                       test_messages_timestamps
run_test "Messages: session_id"                       test_messages_session_id
run_test "Messages: message_index sequential"         test_messages_message_index
run_test "Messages: assistant metadata (model/tokens)" test_messages_assistant_metadata
run_test "Tool calls: extraction"                     test_tool_calls_extraction
run_test "Tool calls: full input JSON (no truncation)" test_tool_calls_full_input
run_test "Tool calls: message_index/tool_index"       test_tool_calls_positioning
run_test "Tool calls: tool_use_id"                    test_tool_calls_tool_use_id
run_test "Messages: idempotency (no duplicates)"      test_messages_idempotency
run_test "Messages: UPDATE_MODE (growing session)"    test_messages_update_mode
run_test "Reparse clears messages + tool_calls"       test_reparse_clears_messages_and_tool_calls
run_test "Subagent: session_id normalized"            test_subagent_messages_session_id_normalized
run_test "Comprehensive: messages + tools together"   test_comprehensive_messages_and_tools
run_test "Messages: multiple sessions"                test_messages_multiple_sessions

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
