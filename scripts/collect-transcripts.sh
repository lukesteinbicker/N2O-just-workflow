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
#   scripts/collect-transcripts.sh            # run from project root
#   scripts/collect-transcripts.sh --quiet    # suppress progress details
#   scripts/collect-transcripts.sh --reparse  # delete all data and re-parse from scratch
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
# Argument parsing
# ---------------------------------------------------------------------------
REPARSE=false
QUIET=false
for arg in "$@"; do
  case "$arg" in
    --reparse) REPARSE=true ;;
    --quiet) QUIET=true ;;
  esac
done

# In quiet mode, suppress non-error output
if $QUIET; then
  log_info()    { :; }
  log_success() { :; }
  log_warn()    { :; }
  log_header()  { :; }
fi

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
# Skill version lookup
# ---------------------------------------------------------------------------

# Get the version of a skill from its SKILL.md frontmatter.
# Usage: get_skill_version <skill_name>
# Searches 02-agents/*/SKILL.md, 03-patterns/*/SKILL.md, .claude/skills/*/SKILL.md
get_skill_version() {
  local skill_name="$1"
  local skill_file=""

  # Search in known skill directories
  for dir in "02-agents" "03-patterns" ".claude/skills"; do
    local candidate="$PROJECT_ROOT/$dir/$skill_name/SKILL.md"
    if [[ -f "$candidate" ]]; then
      skill_file="$candidate"
      break
    fi
  done

  if [[ -z "$skill_file" ]]; then
    echo ""
    return
  fi

  # Extract version from YAML frontmatter using sed
  local version
  version=$(sed -n '/^---$/,/^---$/{ /^version:/{ s/^version:[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}[[:space:]]*$/\1/p; }; }' "$skill_file")
  echo "$version"
}

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
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
# Handle --reparse: delete all existing transcript/event data
# ---------------------------------------------------------------------------
if [[ "$REPARSE" == "true" ]]; then
  log_warn "Reparse mode: deleting all existing transcript and event data"
  sqlite3 "$DB" "DELETE FROM workflow_events; DELETE FROM transcripts; DELETE FROM messages; DELETE FROM tool_calls;"
  log_info "Cleared workflow_events, transcripts, messages, and tool_calls tables"
fi

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

  # Check if already indexed by file_path (skip this check during --reparse)
  # If already indexed but the file has grown, re-collect (UPDATE instead of INSERT)
  UPDATE_MODE=false
  if [[ "$REPARSE" != "true" ]]; then
    sql_escaped_path="$(echo "$jsonl_file" | sed "s/'/''/g")"
    existing_info=$(sqlite3 "$DB" "SELECT file_size_bytes FROM transcripts WHERE file_path = '$sql_escaped_path';" 2>/dev/null)
    if [[ -n "$existing_info" ]]; then
      current_size=$(stat -f%z "$jsonl_file" 2>/dev/null || stat --printf="%s" "$jsonl_file" 2>/dev/null || echo "0")
      if [[ "$current_size" -le "$existing_info" ]]; then
        # File hasn't grown — skip
        ((SKIP_COUNT++)) || true
        continue
      fi
      # File grew since last collection (still-running session) — re-collect and UPDATE
      UPDATE_MODE=true
    fi
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
  #
  # Resilience: if the last line is truncated (crash/shutdown), jq -s
  # fails on the whole file. Pre-validate by checking if jq can slurp it;
  # if not, strip the last line into a temp file and use that instead.
  jq_input="$jsonl_file"
  if ! jq -e '.' "$jsonl_file" >/dev/null 2>&1; then
    trimmed=$(mktemp)
    sed '$d' "$jsonl_file" > "$trimmed" 2>/dev/null
    if jq -e '.' "$trimmed" >/dev/null 2>&1; then
      jq_input="$trimmed"
      log_warn "Truncated last line in $basename_file (recovered $(wc -l < "$trimmed" | tr -d ' ') of $(wc -l < "$jsonl_file" | tr -d ' ') lines)"
    else
      rm -f "$trimmed"
      log_warn "Skipping unparseable file: $basename_file"
      continue
    fi
    # trimmed gets cleaned up after the jq pass below
  fi
  metadata=$(jq -r -s '
    # Filter to user/assistant/system messages for core counts
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

    # Cache token totals from assistant messages
    ([.[] | select(.type == "assistant") | .message.usage.cache_read_input_tokens // 0] | add // 0) as $cache_read |
    ([.[] | select(.type == "assistant") | .message.usage.cache_creation_input_tokens // 0] | add // 0) as $cache_creation |

    # User message timestamps (for inter-message gap analysis)
    ([.[] | select(.type == "user") | .timestamp] | map(select(. != null))) as $user_ts |

    # User content length (proxy for prompt verbosity)
    ([.[] | select(.type == "user") | .message.content | if type == "array" then [.[] | select(.type == "text") | .text | length] | add // 0 elif type == "string" then length else 0 end] | add // 0) as $user_content_len |

    # Model from first assistant message that has one
    ([.[] | select(.type == "assistant" and .message.model != null)] | first // null) as $model_msg |

    # Timestamps (across ALL message types including progress)
    ([.[] | select(.timestamp != null) | .timestamp] | first // null) as $start_ts |
    ([.[] | select(.timestamp != null) | .timestamp] | last // null) as $end_ts |

    # --- Comprehensive JSONL extraction (migration 006) ---

    # Stop reason distribution from assistant messages
    ([.[] | select(.type == "assistant") | .message.stop_reason // empty] |
      group_by(.) | map({key: .[0], value: length}) | from_entries) as $stop_reasons |

    # Thinking blocks: count messages with thinking content and total length
    ([.[] | select(.type == "assistant") |
      [.message.content[]? | select(.type == "thinking") | .text | length] |
      select(length > 0) | add] | map(select(. != null))) as $thinking_lengths |
    ($thinking_lengths | length) as $thinking_msg_count |
    ($thinking_lengths | add // 0) as $thinking_total_len |

    # Service tier from first assistant message that has it
    ([.[] | select(.type == "assistant" and .message.usage.service_tier != null)] |
      first // null) as $service_tier_msg |

    # Sidechain: any user message with isSidechain=true
    ([.[] | select(.type == "user" and .isSidechain == true)] | length > 0) as $has_sidechain |

    # System message subtypes
    ([.[] | select(.type == "system" and .subtype == "error")] | length) as $sys_errors |
    ([.[] | select(.type == "system" and .subtype == "retry")] | length) as $sys_retries |
    ([.[] | select(.type == "system" and .subtype == "compaction")] | length) as $compactions |

    # Turn durations from system turn_duration messages
    ([.[] | select(.type == "system" and .subtype == "turn_duration") | .durationMs // 0] |
      if length > 0 then (add / length | floor) else null end) as $avg_turn_ms |

    # Tool result errors from user messages with toolUseResult
    ([.[] | select(.type == "user") | .toolUseResult // empty |
      if type == "array" then .[] else . end |
      select(.isError == true)] | length) as $tool_result_errors |

    # --- Session context fields (migration 007) ---

    # Working directory from first message that has cwd
    ([.[] | select(.cwd != null) | .cwd] | first // null) as $cwd |

    # Git branch from first message that has gitBranch
    ([.[] | select(.gitBranch != null) | .gitBranch] | first // null) as $git_branch |

    # Assistant message timestamps (for idle time / decision time analysis)
    ([.[] | select(.type == "assistant") | .timestamp] | map(select(. != null))) as $assistant_ts |

    # Background task count (queue-operation messages = async work)
    ([.[] | select(.type == "queue-operation")] | length) as $bg_tasks |

    # Web search/fetch count from assistant server_tool_use
    ([.[] | select(.type == "assistant") |
      (.message.usage.server_tool_use.web_search_requests // 0) +
      (.message.usage.server_tool_use.web_fetch_requests // 0)
    ] | add // 0) as $web_searches |

    {
      session_id: $first_with_sid.sessionId,
      message_count: $total,
      user_message_count: $user_count,
      assistant_message_count: $assistant_count,
      tool_call_count: $tool_call_count,
      total_input_tokens: $input_tokens,
      total_output_tokens: $output_tokens,
      cache_read_tokens: $cache_read,
      cache_creation_tokens: $cache_creation,
      user_message_timestamps: $user_ts,
      total_user_content_length: $user_content_len,
      model: (if $model_msg then $model_msg.message.model else null end),
      started_at: $start_ts,
      ended_at: $end_ts,
      stop_reason_counts: $stop_reasons,
      thinking_message_count: $thinking_msg_count,
      thinking_total_length: $thinking_total_len,
      service_tier: (if $service_tier_msg then $service_tier_msg.message.usage.service_tier else null end),
      has_sidechain: $has_sidechain,
      system_error_count: $sys_errors,
      system_retry_count: $sys_retries,
      avg_turn_duration_ms: $avg_turn_ms,
      tool_result_error_count: $tool_result_errors,
      compaction_count: $compactions,
      cwd: $cwd,
      git_branch: $git_branch,
      assistant_message_timestamps: $assistant_ts,
      background_task_count: $bg_tasks,
      web_search_count: $web_searches,
      tool_calls: [.[] | select(.type == "assistant") |
        .timestamp as $ts |
        .message.usage as $usage |
        [.message.content[]? | select(.type == "tool_use")] as $all_tools |
        ($all_tools | length) as $tool_count |
        $all_tools[] |
        {
          tool_name: .name,
          tool_use_id: .id,
          timestamp: $ts,
          skill_name: (if .name == "Skill" then (.input.skill // null) else null end),
          input_tokens: ($usage.input_tokens // null),
          output_tokens: ($usage.output_tokens // null),
          tool_calls_in_msg: $tool_count,
          file_path: (
            if .name == "Read" then (.input.file_path // null)
            elif .name == "Edit" then (.input.file_path // null)
            elif .name == "Write" then (.input.file_path // null)
            elif .name == "Glob" then (.input.pattern // null)
            elif .name == "Grep" then (.input.path // null)
            else null end
          ),
          is_write: (if .name == "Edit" or .name == "Write" then true else false end)
        }
      ],

      # --- Full messages for messages table (NOS transcript sync) ---
      full_messages: [.[] | select(.type == "user" or .type == "assistant") |
        select(.message.content != null) |
        {
          role: .type,
          content: (if (.message.content | type) == "array" then
            [.message.content[] | select(.type == "text") | .text // ""] | join("\n")
          elif (.message.content | type) == "string" then
            .message.content
          else "" end),
          timestamp: (.timestamp // null),
          model: (.message.model // null),
          input_tokens: (.message.usage.input_tokens // null),
          output_tokens: (.message.usage.output_tokens // null),
          stop_reason: (.message.stop_reason // null)
        }
      ],

      # --- Full tool calls for tool_calls table (NOS transcript sync) ---
      full_tool_calls: (
        # Assign sequential message_index to user+assistant messages, then extract tool_use blocks
        [.[] | select(.type == "user" or .type == "assistant") | select(.message.content != null)] |
        to_entries | map(
          .key as $midx | .value |
          select(.type == "assistant") |
          .timestamp as $ts |
          (if (.message.content | type) == "array" then
            [.message.content[] | select(.type == "tool_use")]
          else [] end) |
          to_entries[] |
          {
            message_index: $midx,
            tool_index: .key,
            tool_use_id: (.value.id // null),
            tool_name: .value.name,
            input: (.value.input // {}),
            timestamp: $ts
          }
        )
      )
    }
  ' "$jq_input" 2>/dev/null) || true

  # Clean up temp file if we created one
  [[ "$jq_input" != "$jsonl_file" ]] && rm -f "$jq_input"

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
  cache_read_tokens=$(echo "$metadata" | jq -r '.cache_read_tokens // 0')
  cache_creation_tokens=$(echo "$metadata" | jq -r '.cache_creation_tokens // 0')
  user_message_timestamps=$(echo "$metadata" | jq -c '.user_message_timestamps // []')
  total_user_content_length=$(echo "$metadata" | jq -r '.total_user_content_length // 0')
  model=$(echo "$metadata" | jq -r '.model // empty')
  started_at=$(echo "$metadata" | jq -r '.started_at // empty')
  ended_at=$(echo "$metadata" | jq -r '.ended_at // empty')
  # Comprehensive JSONL extraction (migration 006)
  stop_reason_counts=$(echo "$metadata" | jq -c '.stop_reason_counts // {}')
  thinking_message_count=$(echo "$metadata" | jq -r '.thinking_message_count // 0')
  thinking_total_length=$(echo "$metadata" | jq -r '.thinking_total_length // 0')
  service_tier=$(echo "$metadata" | jq -r '.service_tier // empty')
  has_sidechain=$(echo "$metadata" | jq -r 'if .has_sidechain then 1 else 0 end')
  system_error_count=$(echo "$metadata" | jq -r '.system_error_count // 0')
  system_retry_count=$(echo "$metadata" | jq -r '.system_retry_count // 0')
  avg_turn_duration_ms=$(echo "$metadata" | jq -r '.avg_turn_duration_ms // empty')
  tool_result_error_count=$(echo "$metadata" | jq -r '.tool_result_error_count // 0')
  compaction_count=$(echo "$metadata" | jq -r '.compaction_count // 0')
  # Session context fields (migration 007)
  session_cwd=$(echo "$metadata" | jq -r '.cwd // empty')
  git_branch=$(echo "$metadata" | jq -r '.git_branch // empty')
  assistant_message_timestamps=$(echo "$metadata" | jq -c '.assistant_message_timestamps // []')
  background_task_count=$(echo "$metadata" | jq -r '.background_task_count // 0')
  web_search_count=$(echo "$metadata" | jq -r '.web_search_count // 0')
  file_size=$(stat -f%z "$jsonl_file" 2>/dev/null || stat --printf="%s" "$jsonl_file" 2>/dev/null || echo "0")

  # Calculate estimated cost based on model rate card (per million tokens)
  # Rates loaded from templates/rates.json (ships with framework, updated on n2o sync)
  estimated_cost="NULL"
  if [[ -n "$model" && "$total_input_tokens" -gt 0 ]]; then
    input_rate=0; output_rate=0

    # Try to load rates from rates.json (framework or project copy)
    rates_file=""
    for candidate in "$PROJECT_ROOT/templates/rates.json" "$PROJECT_ROOT/.pm/rates.json"; do
      [[ -f "$candidate" ]] && rates_file="$candidate" && break
    done

    if [[ -n "$rates_file" ]]; then
      # Determine model family from model string
      model_family="sonnet"
      case "$model" in
        *opus*)   model_family="opus" ;;
        *sonnet*) model_family="sonnet" ;;
        *haiku*)  model_family="haiku" ;;
      esac
      input_rate=$(jq -r ".models.${model_family}.input // 3" "$rates_file")
      output_rate=$(jq -r ".models.${model_family}.output // 15" "$rates_file")
    else
      # Fallback: hardcoded rates (sonnet default)
      case "$model" in
        *opus*)   input_rate=15;     output_rate=75 ;;
        *sonnet*) input_rate=3;      output_rate=15 ;;
        *haiku*)  input_rate="0.25"; output_rate="1.25" ;;
        *)        input_rate=3;      output_rate=15 ;;
      esac
    fi

    estimated_cost=$(awk "BEGIN {printf \"%.6f\", ($total_input_tokens * $input_rate + $total_output_tokens * $output_rate) / 1000000}")
  fi

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
  # Session-to-task linkage (Gap 1)
  # Look up the task claimed by this session to populate sprint/task_num
  # -------------------------------------------------------------------------
  task_sprint=""
  task_num=""
  # Use the base session_id (without subagent suffix) for lookup
  lookup_session="$session_id"
  [[ -n "$parent_session_id" ]] && lookup_session="$parent_session_id"
  task_info=$(sqlite3 "$DB" "SELECT sprint || '|' || task_num FROM tasks WHERE session_id = '${lookup_session//\'/\'\'}' LIMIT 1;" 2>/dev/null)
  if [[ -n "$task_info" ]]; then
    task_sprint="${task_info%%|*}"
    task_num="${task_info##*|}"
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
  sql_user_ts="${user_message_timestamps//\'/\'\'}"
  sql_stop_reasons="${stop_reason_counts//\'/\'\'}"
  sql_service_tier="${service_tier//\'/\'\'}"
  sql_cwd="${session_cwd//\'/\'\'}"
  sql_git_branch="${git_branch//\'/\'\'}"
  sql_assistant_ts="${assistant_message_timestamps//\'/\'\'}"

  # Build nullable fields
  parent_val="NULL"; [[ -n "$parent_session_id" ]] && parent_val="'$sql_parent'"
  agent_val="NULL";  [[ -n "$agent_id" ]] && agent_val="'$sql_agent'"
  model_val="NULL";  [[ -n "$model" ]] && model_val="'$sql_model'"
  start_val="NULL";  [[ -n "$started_at" ]] && start_val="'$started_at'"
  end_val="NULL";    [[ -n "$ended_at" ]] && end_val="'$ended_at'"
  sprint_val="NULL"; [[ -n "$task_sprint" ]] && sprint_val="'${task_sprint//\'/\'\'}'"
  tasknum_val="NULL"; [[ -n "$task_num" ]] && tasknum_val="$task_num"
  service_tier_val="NULL"; [[ -n "$service_tier" ]] && service_tier_val="'$sql_service_tier'"
  avg_turn_ms_val="NULL"; [[ -n "$avg_turn_duration_ms" ]] && avg_turn_ms_val="$avg_turn_duration_ms"
  cwd_val="NULL"; [[ -n "$session_cwd" ]] && cwd_val="'$sql_cwd'"
  git_branch_val="NULL"; [[ -n "$git_branch" ]] && git_branch_val="'$sql_git_branch'"

  if [[ "$UPDATE_MODE" == "true" ]]; then
    # File grew since last collection — UPDATE existing row with fresh data
    sqlite3 "$DB" "UPDATE transcripts SET
      file_size_bytes = $file_size,
      message_count = $message_count, user_message_count = $user_message_count,
      assistant_message_count = $assistant_message_count,
      tool_call_count = $tool_call_count,
      total_input_tokens = $total_input_tokens, total_output_tokens = $total_output_tokens,
      estimated_cost_usd = $estimated_cost, model = $model_val,
      started_at = $start_val, ended_at = $end_val,
      sprint = $sprint_val, task_num = $tasknum_val,
      user_message_timestamps = '$sql_user_ts',
      cache_read_tokens = $cache_read_tokens, cache_creation_tokens = $cache_creation_tokens,
      total_user_content_length = $total_user_content_length,
      stop_reason_counts = '$sql_stop_reasons',
      thinking_message_count = $thinking_message_count, thinking_total_length = $thinking_total_length,
      service_tier = $service_tier_val, has_sidechain = $has_sidechain,
      system_error_count = $system_error_count, system_retry_count = $system_retry_count,
      avg_turn_duration_ms = $avg_turn_ms_val,
      tool_result_error_count = $tool_result_error_count, compaction_count = $compaction_count,
      cwd = $cwd_val, git_branch = $git_branch_val,
      assistant_message_timestamps = '$sql_assistant_ts',
      background_task_count = $background_task_count, web_search_count = $web_search_count,
      synced_at = NULL, sync_attempts = 0, sync_error = NULL
    WHERE file_path = '$sql_file_path';" 2>/dev/null || { log_warn "Failed to update: $basename_file (skipping)"; continue; }
  else
    sqlite3 "$DB" "INSERT INTO transcripts (
      session_id, parent_session_id, agent_id, file_path, file_size_bytes,
      message_count, user_message_count, assistant_message_count,
      tool_call_count, total_input_tokens, total_output_tokens,
      estimated_cost_usd, model, started_at, ended_at,
      sprint, task_num,
      user_message_timestamps, cache_read_tokens, cache_creation_tokens,
      total_user_content_length,
      stop_reason_counts, thinking_message_count, thinking_total_length,
      service_tier, has_sidechain, system_error_count, system_retry_count,
      avg_turn_duration_ms, tool_result_error_count, compaction_count,
      cwd, git_branch, assistant_message_timestamps,
      background_task_count, web_search_count
    ) VALUES (
      '$sql_session_id', $parent_val, $agent_val, '$sql_file_path', $file_size,
      $message_count, $user_message_count, $assistant_message_count,
      $tool_call_count, $total_input_tokens, $total_output_tokens,
      $estimated_cost, $model_val, $start_val, $end_val,
      $sprint_val, $tasknum_val,
      '$sql_user_ts', $cache_read_tokens, $cache_creation_tokens,
      $total_user_content_length,
      '$sql_stop_reasons', $thinking_message_count, $thinking_total_length,
      $service_tier_val, $has_sidechain, $system_error_count, $system_retry_count,
      $avg_turn_ms_val, $tool_result_error_count, $compaction_count,
      $cwd_val, $git_branch_val, '$sql_assistant_ts',
      $background_task_count, $web_search_count
    );" 2>/dev/null || { log_warn "Failed to insert: $basename_file (skipping)"; continue; }
  fi

  # -------------------------------------------------------------------------
  # Git diff stats (Gap 5) — populate lines_added/lines_removed on linked tasks
  # -------------------------------------------------------------------------
  if [[ -n "$task_sprint" && -n "$task_num" ]]; then
    commit_hash=$(sqlite3 "$DB" "SELECT commit_hash FROM tasks WHERE sprint = '${task_sprint//\'/\'\'}' AND task_num = $task_num;" 2>/dev/null)
    if [[ -n "$commit_hash" && "$commit_hash" != "NULL" ]]; then
      diff_stats=$(git diff --numstat "${commit_hash}^" "$commit_hash" 2>/dev/null | awk '{ added += $1; removed += $2 } END { print added+0 "|" removed+0 }')
      if [[ -n "$diff_stats" ]]; then
        diff_added="${diff_stats%%|*}"
        diff_removed="${diff_stats##*|}"
        sqlite3 "$DB" "UPDATE tasks SET lines_added = $diff_added, lines_removed = $diff_removed WHERE sprint = '${task_sprint//\'/\'\'}' AND task_num = $task_num AND lines_added IS NULL;" 2>/dev/null || true
      fi
    fi
  fi

  # -------------------------------------------------------------------------
  # Insert tool calls into workflow_events
  # -------------------------------------------------------------------------
  tool_calls_json=$(echo "$metadata" | jq -c '.tool_calls[]' 2>/dev/null)

  if [[ -n "$tool_calls_json" ]]; then
    # Build a batch SQL statement for efficiency
    sql_batch="BEGIN TRANSACTION;"

    # If updating a growing session, delete old events first to avoid duplicates
    if [[ "$UPDATE_MODE" == "true" ]]; then
      sql_batch+="DELETE FROM workflow_events WHERE session_id = '$sql_session_id' AND event_type IN ('tool_call', 'skill_invoked', 'subagent_spawn');"
    fi

    while IFS= read -r tc; do
      tc_tool_name=$(echo "$tc" | jq -r '.tool_name')
      tc_tool_use_id=$(echo "$tc" | jq -r '.tool_use_id')
      tc_timestamp=$(echo "$tc" | jq -r '.timestamp // empty')
      tc_skill_name=$(echo "$tc" | jq -r '.skill_name // empty')
      tc_input_tokens=$(echo "$tc" | jq -r '.input_tokens // empty')
      tc_output_tokens=$(echo "$tc" | jq -r '.output_tokens // empty')
      tc_tool_calls_in_msg=$(echo "$tc" | jq -r '.tool_calls_in_msg // empty')
      tc_file_path=$(echo "$tc" | jq -r '.file_path // empty')
      tc_is_write=$(echo "$tc" | jq -r 'if .is_write then "true" else "false" end')

      # Determine event_type
      if [[ "$tc_tool_name" == "Task" ]]; then
        event_type="subagent_spawn"
      elif [[ "$tc_tool_name" == "Skill" && -n "$tc_skill_name" ]]; then
        event_type="skill_invoked"
      else
        event_type="tool_call"
      fi

      # Build nullable fields
      ts_val="CURRENT_TIMESTAMP"; [[ -n "$tc_timestamp" ]] && ts_val="'$tc_timestamp'"
      skill_val="NULL"; [[ -n "$tc_skill_name" ]] && skill_val="'${tc_skill_name//\'/\'\'}'"
      skill_version_val="NULL"
      if [[ -n "$tc_skill_name" ]]; then
        sv=$(get_skill_version "$tc_skill_name")
        if [[ -n "$sv" ]]; then
          skill_version_val="'${sv//\'/\'\'}'"
        fi
      fi
      evt_agent_val="NULL"; [[ -n "$agent_id" ]] && evt_agent_val="'$sql_agent'"
      input_tokens_val="NULL"; [[ -n "$tc_input_tokens" ]] && input_tokens_val="$tc_input_tokens"
      output_tokens_val="NULL"; [[ -n "$tc_output_tokens" ]] && output_tokens_val="$tc_output_tokens"
      tool_calls_in_msg_val="NULL"; [[ -n "$tc_tool_calls_in_msg" ]] && tool_calls_in_msg_val="$tc_tool_calls_in_msg"

      # Build metadata JSON with file_path and is_write
      if [[ -n "$tc_file_path" ]]; then
        metadata_val="'{\"file_path\": \"${tc_file_path//\"/\\\"}\", \"is_write\": ${tc_is_write}}'"
      elif [[ "$tc_is_write" == "true" ]]; then
        metadata_val="'{\"file_path\": null, \"is_write\": true}'"
      else
        metadata_val="NULL"
      fi

      sql_batch+="INSERT INTO workflow_events (
  timestamp, session_id, sprint, task_num, event_type, tool_name, tool_use_id, skill_name, skill_version, agent_id,
  input_tokens, output_tokens, tool_calls_in_msg, metadata
) VALUES (
  $ts_val, '$sql_session_id', $sprint_val, $tasknum_val, '$event_type',
  '${tc_tool_name//\'/\'\'}', '${tc_tool_use_id//\'/\'\'}',
  $skill_val, $skill_version_val, $evt_agent_val,
  $input_tokens_val, $output_tokens_val, $tool_calls_in_msg_val, $metadata_val
);"
    done <<< "$tool_calls_json"

    sql_batch+="COMMIT;"
    sqlite3 "$DB" "$sql_batch"
  fi

  # -------------------------------------------------------------------------
  # Insert messages into messages table (NOS transcript sync)
  # -------------------------------------------------------------------------
  full_messages_json=$(echo "$metadata" | jq -c '.full_messages[]' 2>/dev/null)

  if [[ -n "$full_messages_json" ]]; then
    msg_sql="BEGIN TRANSACTION;"

    # In UPDATE_MODE, delete old messages first (delete+re-insert pattern)
    if [[ "$UPDATE_MODE" == "true" ]]; then
      msg_sql+="DELETE FROM messages WHERE session_id = '$sql_session_id';"
    fi

    msg_idx=0
    while IFS= read -r msg; do
      msg_role=$(echo "$msg" | jq -r '.role')
      msg_content=$(echo "$msg" | jq -r '.content // empty')
      msg_ts=$(echo "$msg" | jq -r '.timestamp // empty')
      msg_model=$(echo "$msg" | jq -r '.model // empty')
      msg_in_tok=$(echo "$msg" | jq -r '.input_tokens // empty')
      msg_out_tok=$(echo "$msg" | jq -r '.output_tokens // empty')
      msg_stop=$(echo "$msg" | jq -r '.stop_reason // empty')

      # Escape single quotes for SQL (use $'...' syntax for bash compatibility)
      sql_content="${msg_content//\'/$'\'\''}"
      model_val="NULL"; [[ -n "$msg_model" ]] && model_val="'${msg_model//\'/$'\'\''}'"
      msg_ts_val="NULL"; [[ -n "$msg_ts" ]] && msg_ts_val="'$msg_ts'"
      in_tok_val="NULL"; [[ -n "$msg_in_tok" ]] && in_tok_val="$msg_in_tok"
      out_tok_val="NULL"; [[ -n "$msg_out_tok" ]] && out_tok_val="$msg_out_tok"
      stop_val="NULL"; [[ -n "$msg_stop" ]] && stop_val="'${msg_stop//\'/$'\'\''}'"

      msg_sql+="INSERT OR REPLACE INTO messages (session_id, message_index, role, content, timestamp, model, input_tokens, output_tokens, stop_reason) VALUES ('$sql_session_id', $msg_idx, '$msg_role', '$sql_content', $msg_ts_val, $model_val, $in_tok_val, $out_tok_val, $stop_val);"

      ((msg_idx++)) || true
    done <<< "$full_messages_json"

    msg_sql+="COMMIT;"
    sqlite3 "$DB" "$msg_sql" 2>/dev/null || log_warn "Failed to insert messages for: $basename_file"
  fi

  # -------------------------------------------------------------------------
  # Insert tool calls into tool_calls table (NOS transcript sync)
  # -------------------------------------------------------------------------
  full_tc_json=$(echo "$metadata" | jq -c '.full_tool_calls[]' 2>/dev/null)

  if [[ -n "$full_tc_json" ]]; then
    tc_sql="BEGIN TRANSACTION;"

    # In UPDATE_MODE, delete old tool_calls first
    if [[ "$UPDATE_MODE" == "true" ]]; then
      tc_sql+="DELETE FROM tool_calls WHERE session_id = '$sql_session_id';"
    fi

    while IFS= read -r ftc; do
      ftc_msg_idx=$(echo "$ftc" | jq -r '.message_index')
      ftc_tool_idx=$(echo "$ftc" | jq -r '.tool_index')
      ftc_tool_use_id=$(echo "$ftc" | jq -r '.tool_use_id // empty')
      ftc_tool_name=$(echo "$ftc" | jq -r '.tool_name')
      ftc_input=$(echo "$ftc" | jq -c '.input // {}')
      ftc_ts=$(echo "$ftc" | jq -r '.timestamp // empty')

      # Escape single quotes for SQL (use $'...' syntax for bash compatibility)
      sql_ftc_input="${ftc_input//\'/$'\'\''}"
      sql_ftc_name="${ftc_tool_name//\'/$'\'\''}"
      ftc_id_val="NULL"; [[ -n "$ftc_tool_use_id" ]] && ftc_id_val="'${ftc_tool_use_id//\'/$'\'\''}'"
      ftc_ts_val="NULL"; [[ -n "$ftc_ts" ]] && ftc_ts_val="'$ftc_ts'"

      tc_sql+="INSERT OR REPLACE INTO tool_calls (session_id, message_index, tool_index, tool_use_id, tool_name, input, timestamp) VALUES ('$sql_session_id', $ftc_msg_idx, $ftc_tool_idx, $ftc_id_val, '$sql_ftc_name', '$sql_ftc_input', $ftc_ts_val);"
    done <<< "$full_tc_json"

    tc_sql+="COMMIT;"
    sqlite3 "$DB" "$tc_sql" 2>/dev/null || log_warn "Failed to insert tool_calls for: $basename_file"
  fi

  ((NEW_COUNT++)) || true

  # Progress indicator
  verb="Indexed"
  [[ "$UPDATE_MODE" == "true" ]] && verb="Updated"
  if [[ -n "$parent_session_id" ]]; then
    log_success "$verb subagent: $agent_id ($message_count msgs, $tool_call_count tools, ${total_input_tokens}+${total_output_tokens} tokens)"
  else
    log_success "$verb session: ${session_id:0:8}... ($message_count msgs, $tool_call_count tools, ${total_input_tokens}+${total_output_tokens} tokens)"
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

# ---------------------------------------------------------------------------
# Sync to Supabase (single batch, non-blocking)
# ---------------------------------------------------------------------------
# Run once at the end rather than per-transcript to avoid spawning N processes.
# Fire-and-forget in background so it doesn't block the SessionEnd hook timeout.
SYNC_SCRIPT="$PROJECT_ROOT/scripts/coordination/sync-task-state.sh"
if [[ $NEW_COUNT -gt 0 && -f "$SYNC_SCRIPT" ]]; then
  bash "$SYNC_SCRIPT" sync-transcripts 2>/dev/null &
  log_info "  Cloud sync: started in background ($NEW_COUNT new)"
else
  synced_count=$(sqlite3 "$DB" "SELECT COUNT(*) FROM transcripts WHERE synced_at IS NOT NULL;")
  unsynced_count=$(sqlite3 "$DB" "SELECT COUNT(*) FROM transcripts WHERE synced_at IS NULL AND (sync_attempts < 5 OR sync_attempts IS NULL);")
  stuck_count=$(sqlite3 "$DB" "SELECT COUNT(*) FROM transcripts WHERE synced_at IS NULL AND sync_attempts >= 5;")
  log_info "  Synced to cloud: $synced_count"
  if [[ "$unsynced_count" -gt 0 ]]; then
    log_warn "  Unsynced: $unsynced_count (run: bash scripts/coordination/sync-task-state.sh sync-transcripts)"
  fi
  if [[ "$stuck_count" -gt 0 ]]; then
    log_error "  Permanently failed: $stuck_count (check: sqlite3 .pm/tasks.db \"SELECT session_id, sync_error FROM transcripts WHERE sync_attempts >= 5;\")"
  fi
fi
