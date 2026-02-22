#!/bin/bash
set -euo pipefail

# =============================================================================
# collect-transcripts.sh — Parse Claude Code JSONL transcripts into the DB
#
# Reads JSONL session files from ~/.claude/projects/{encoded-path}/,
# extracts metadata, tool calls, and token usage, and inserts into
# the transcripts and workflow_events tables in .pm/tasks.db.
#
# Usage:
#   scripts/collect-transcripts.sh          # run from project root
#   scripts/collect-transcripts.sh --quiet  # suppress progress details
# =============================================================================

# Colors (matching n2o CLI)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}i${NC}  $1"; }
log_success() { echo -e "${GREEN}✓${NC}  $1"; }
log_warn()    { echo -e "${YELLOW}!${NC}  $1"; }
log_error()   { echo -e "${RED}x${NC}  $1" >&2; }
log_header()  { echo -e "\n${BOLD}$1${NC}"; }

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
for cmd in jq sqlite3; do
  if ! command -v "$cmd" &>/dev/null; then
    log_error "Required dependency '$cmd' not found. Please install it."
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------
PROJECT_ROOT="$(pwd)"
DB="$PROJECT_ROOT/.pm/tasks.db"

if [[ ! -f "$DB" ]]; then
  log_error "Database not found at $DB. Run 'n2o init' first."
  exit 1
fi

# Encode the project path: replace / with -, strip leading -
ENCODED_PATH="${PROJECT_ROOT//\//-}"
ENCODED_PATH="${ENCODED_PATH#-}"

CLAUDE_DIR="$HOME/.claude/projects/-${ENCODED_PATH}"

if [[ ! -d "$CLAUDE_DIR" ]]; then
  # Try without the leading dash (some versions)
  CLAUDE_DIR="$HOME/.claude/projects/${ENCODED_PATH}"
  if [[ ! -d "$CLAUDE_DIR" ]]; then
    log_error "Claude projects directory not found."
    log_error "  Tried: $HOME/.claude/projects/-${ENCODED_PATH}"
    log_error "  Tried: $HOME/.claude/projects/${ENCODED_PATH}"
    exit 1
  fi
fi

log_header "Collecting transcripts"
log_info "Project: $PROJECT_ROOT"
log_info "Claude dir: $CLAUDE_DIR"
log_info "Database: $DB"

# ---------------------------------------------------------------------------
# Find all JSONL files
# ---------------------------------------------------------------------------
JSONL_FILES=()
while IFS= read -r -d '' f; do
  JSONL_FILES+=("$f")
done < <(find "$CLAUDE_DIR" -name '*.jsonl' -print0 2>/dev/null)

TOTAL=${#JSONL_FILES[@]}
if [[ $TOTAL -eq 0 ]]; then
  log_warn "No JSONL files found in $CLAUDE_DIR"
  exit 0
fi

log_info "Found $TOTAL JSONL file(s)"

# ---------------------------------------------------------------------------
# Ensure tables exist (idempotent — CREATE IF NOT EXISTS in schema)
# ---------------------------------------------------------------------------

NEW_COUNT=0
SKIP_COUNT=0

# ---------------------------------------------------------------------------
# Process each JSONL file
# ---------------------------------------------------------------------------
for jsonl_file in "${JSONL_FILES[@]}"; do

  # Skip non-session files (memory, etc.)
  basename_file="$(basename "$jsonl_file")"
  if [[ "$basename_file" != *.jsonl ]]; then
    continue
  fi

  # Check if already indexed by file_path
  existing=$(sqlite3 "$DB" "SELECT COUNT(*) FROM transcripts WHERE file_path = '$(echo "$jsonl_file" | sed "s/'/''/g")';")
  if [[ "$existing" -gt 0 ]]; then
    ((SKIP_COUNT++)) || true
    continue
  fi

  # Determine if this is a subagent transcript
  parent_session_id=""
  agent_id=""
  if [[ "$jsonl_file" == */subagents/* ]]; then
    # Path: .../sessions/{parent-uuid}/subagents/agent-{id}.jsonl
    # Extract parent session UUID from the directory structure
    parent_dir="$(dirname "$(dirname "$jsonl_file")")"
    parent_session_id="$(basename "$parent_dir")"
    # Extract agent ID from filename: agent-{id}.jsonl -> {id}
    agent_id="${basename_file#agent-}"
    agent_id="${agent_id%.jsonl}"
  fi

  # -------------------------------------------------------------------------
  # Extract session metadata with a single jq pass
  # -------------------------------------------------------------------------
  # We extract all needed data in one jq invocation for performance.
  # Output format: JSON object with all fields we need.
  metadata=$(jq -r -s '
    # Filter to only user/assistant/system messages (skip progress, file-history-snapshot, etc.)
    [.[] | select(.type == "user" or .type == "assistant" or .type == "system")] as $msgs |

    # Session ID from first message with a sessionId
    ($msgs | map(select(.sessionId != null)) | first // {sessionId: "unknown"}) as $first_with_sid |

    # Counts
    ($msgs | length) as $total |
    ([.[] | select(.type == "user")] | length) as $user_count |
    ([.[] | select(.type == "assistant")] | length) as $assistant_count |

    # Tool calls: count tool_use entries across all assistant message content
    [.[] | select(.type == "assistant") | .message.content[]? | select(.type == "tool_use")] as $tool_calls |
    ($tool_calls | length) as $tool_call_count |

    # Token totals from assistant messages
    ([.[] | select(.type == "assistant") | .message.usage.input_tokens // 0] | add // 0) as $input_tokens |
    ([.[] | select(.type == "assistant") | .message.usage.output_tokens // 0] | add // 0) as $output_tokens |

    # Model from first assistant message that has one
    ([.[] | select(.type == "assistant" and .message.model != null)] | first // null) as $model_msg |

    # Timestamps
    ([.[] | select(.timestamp != null) | .timestamp] | first // null) as $start_ts |
    ([.[] | select(.timestamp != null) | .timestamp] | last // null) as $end_ts |

    {
      session_id: $first_with_sid.sessionId,
      message_count: $total,
      user_message_count: $user_count,
      assistant_message_count: $assistant_count,
      tool_call_count: $tool_call_count,
      total_input_tokens: $input_tokens,
      total_output_tokens: $output_tokens,
      model: (if $model_msg then $model_msg.message.model else null end),
      started_at: $start_ts,
      ended_at: $end_ts,
      tool_calls: [.[] | select(.type == "assistant") |
        .timestamp as $ts |
        .message.content[]? | select(.type == "tool_use") |
        {
          tool_name: .name,
          tool_use_id: .id,
          timestamp: $ts,
          skill_name: (if .name == "Skill" then (.input.skill // null) else null end)
        }
      ]
    }
  ' "$jsonl_file" 2>/dev/null)

  if [[ -z "$metadata" || "$metadata" == "null" ]]; then
    log_warn "Could not parse: $basename_file (skipping)"
    continue
  fi

  # Extract fields from the metadata JSON
  session_id=$(echo "$metadata" | jq -r '.session_id // "unknown"')
  message_count=$(echo "$metadata" | jq -r '.message_count // 0')
  user_message_count=$(echo "$metadata" | jq -r '.user_message_count // 0')
  assistant_message_count=$(echo "$metadata" | jq -r '.assistant_message_count // 0')
  tool_call_count=$(echo "$metadata" | jq -r '.tool_call_count // 0')
  total_input_tokens=$(echo "$metadata" | jq -r '.total_input_tokens // 0')
  total_output_tokens=$(echo "$metadata" | jq -r '.total_output_tokens // 0')
  model=$(echo "$metadata" | jq -r '.model // empty')
  started_at=$(echo "$metadata" | jq -r '.started_at // empty')
  ended_at=$(echo "$metadata" | jq -r '.ended_at // empty')
  file_size=$(stat -f%z "$jsonl_file" 2>/dev/null || stat --printf="%s" "$jsonl_file" 2>/dev/null || echo "0")

  # For subagents, use the parent session ID from the directory, but the
  # subagent's own sessionId is actually the parent's sessionId in the JSONL.
  # The agent_id comes from the filename.
  if [[ -n "$parent_session_id" ]]; then
    # In subagent JSONL files, sessionId == parent session ID.
    # We store that as parent_session_id, and compose a unique session_id.
    parent_session_id="$session_id"
    session_id="${session_id}/${agent_id}"
  fi

  # -------------------------------------------------------------------------
  # Insert into transcripts table
  # -------------------------------------------------------------------------
  # Escape single quotes for SQL
  sql_session_id="${session_id//\'/\'\'}"
  sql_file_path="${jsonl_file//\'/\'\'}"
  sql_model="${model//\'/\'\'}"
  sql_parent="${parent_session_id//\'/\'\'}"
  sql_agent="${agent_id//\'/\'\'}"

  # Build nullable fields
  parent_val="NULL"; [[ -n "$parent_session_id" ]] && parent_val="'$sql_parent'"
  agent_val="NULL";  [[ -n "$agent_id" ]] && agent_val="'$sql_agent'"
  model_val="NULL";  [[ -n "$model" ]] && model_val="'$sql_model'"
  start_val="NULL";  [[ -n "$started_at" ]] && start_val="'$started_at'"
  end_val="NULL";    [[ -n "$ended_at" ]] && end_val="'$ended_at'"

  sqlite3 "$DB" "INSERT INTO transcripts (
    session_id, parent_session_id, agent_id, file_path, file_size_bytes,
    message_count, user_message_count, assistant_message_count,
    tool_call_count, total_input_tokens, total_output_tokens,
    model, started_at, ended_at
  ) VALUES (
    '$sql_session_id', $parent_val, $agent_val, '$sql_file_path', $file_size,
    $message_count, $user_message_count, $assistant_message_count,
    $tool_call_count, $total_input_tokens, $total_output_tokens,
    $model_val, $start_val, $end_val
  );"

  # -------------------------------------------------------------------------
  # Insert tool calls into workflow_events
  # -------------------------------------------------------------------------
  tool_calls_json=$(echo "$metadata" | jq -c '.tool_calls[]' 2>/dev/null)

  if [[ -n "$tool_calls_json" ]]; then
    # Build a batch SQL statement for efficiency
    sql_batch="BEGIN TRANSACTION;"

    while IFS= read -r tc; do
      tc_tool_name=$(echo "$tc" | jq -r '.tool_name')
      tc_tool_use_id=$(echo "$tc" | jq -r '.tool_use_id')
      tc_timestamp=$(echo "$tc" | jq -r '.timestamp // empty')
      tc_skill_name=$(echo "$tc" | jq -r '.skill_name // empty')

      # Determine event_type
      if [[ "$tc_tool_name" == "Task" ]]; then
        event_type="subagent_spawn"
      else
        event_type="tool_call"
      fi

      # Build nullable fields
      ts_val="CURRENT_TIMESTAMP"; [[ -n "$tc_timestamp" ]] && ts_val="'$tc_timestamp'"
      skill_val="NULL"; [[ -n "$tc_skill_name" ]] && skill_val="'${tc_skill_name//\'/\'\'}'"
      evt_agent_val="NULL"; [[ -n "$agent_id" ]] && evt_agent_val="'$sql_agent'"

      sql_batch+="INSERT INTO workflow_events (
  timestamp, session_id, event_type, tool_name, tool_use_id, skill_name, agent_id
) VALUES (
  $ts_val, '$sql_session_id', '$event_type',
  '${tc_tool_name//\'/\'\'}', '${tc_tool_use_id//\'/\'\'}',
  $skill_val, $evt_agent_val
);"
    done <<< "$tool_calls_json"

    sql_batch+="COMMIT;"
    sqlite3 "$DB" "$sql_batch"
  fi

  ((NEW_COUNT++)) || true

  # Progress indicator
  if [[ -n "$parent_session_id" ]]; then
    log_success "Indexed subagent: $agent_id ($message_count msgs, $tool_call_count tools, ${total_input_tokens}+${total_output_tokens} tokens)"
  else
    log_success "Indexed session: ${session_id:0:8}... ($message_count msgs, $tool_call_count tools, ${total_input_tokens}+${total_output_tokens} tokens)"
  fi
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
log_header "Summary"
log_info "Total JSONL files: $TOTAL"
log_success "New sessions indexed: $NEW_COUNT"
if [[ $SKIP_COUNT -gt 0 ]]; then
  log_warn "Already indexed (skipped): $SKIP_COUNT"
fi

# Quick stats
transcript_count=$(sqlite3 "$DB" "SELECT COUNT(*) FROM transcripts;")
event_count=$(sqlite3 "$DB" "SELECT COUNT(*) FROM workflow_events;")
total_tokens_in=$(sqlite3 "$DB" "SELECT COALESCE(SUM(total_input_tokens), 0) FROM transcripts;")
total_tokens_out=$(sqlite3 "$DB" "SELECT COALESCE(SUM(total_output_tokens), 0) FROM transcripts;")

echo ""
log_info "Database totals:"
log_info "  Transcripts: $transcript_count"
log_info "  Workflow events: $event_count"
log_info "  Total input tokens: $total_tokens_in"
log_info "  Total output tokens: $total_tokens_out"
