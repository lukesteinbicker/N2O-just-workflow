#!/bin/bash
# Atomically claim the next available task for this agent.
#
# Usage: ./scripts/coordination/claim-task.sh [--sprint <sprint>] [--agent-id <id>] [--session-id <id>]
# Example: ./scripts/coordination/claim-task.sh --sprint coordination
#
# This script:
# 1. Generates an agent ID (or uses the one provided)
# 2. Queries available_tasks for the best task (priority-ordered)
# 3. Atomically claims it: UPDATE ... WHERE owner IS NULL
# 4. Verifies claim with changes() — retries with next task if contention
# 5. Calls create-worktree.sh for the claimed task
# 6. Outputs task details as JSON on stdout
#
# Exit codes:
#   0 — task claimed successfully (JSON on stdout)
#   1 — error (missing db, invalid args, etc.)
#   2 — no available tasks

set -e

# Colors (stderr only)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# --- Parse arguments ---

SPRINT_FILTER=""
AGENT_ID=""
SESSION_ID=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --sprint)
            SPRINT_FILTER="$2"
            shift 2
            ;;
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --session-id)
            SESSION_ID="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Error: Unknown argument: $1${NC}" >&2
            echo "Usage: $0 [--sprint <sprint>] [--agent-id <id>] [--session-id <id>]" >&2
            exit 1
            ;;
    esac
done

# --- Locate project root ---

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$PROJECT_ROOT" ]; then
    echo -e "${RED}Error: Not inside a git repository${NC}" >&2
    exit 1
fi

DB_PATH="$PROJECT_ROOT/.pm/tasks.db"
if [ ! -f "$DB_PATH" ]; then
    echo -e "${RED}Error: Database not found at $DB_PATH${NC}" >&2
    exit 1
fi

# Find create-worktree.sh relative to this script's location (sibling in same dir)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CREATE_WORKTREE="$SCRIPT_DIR/create-worktree.sh"
if [ ! -f "$CREATE_WORKTREE" ]; then
    echo -e "${RED}Error: create-worktree.sh not found at $CREATE_WORKTREE${NC}" >&2
    exit 1
fi

# --- Generate agent ID if not provided ---

if [ -z "$AGENT_ID" ]; then
    HOSTNAME_SHORT=$(hostname -s 2>/dev/null || echo "local")
    AGENT_ID="agent-${HOSTNAME_SHORT}-$$-$(date +%s)"
fi

# --- Get available tasks ---

SPRINT_WHERE=""
if [ -n "$SPRINT_FILTER" ]; then
    SPRINT_WHERE="AND sprint = '$SPRINT_FILTER'"
fi

# Get candidates ordered by priority (available_tasks view already filters)
CANDIDATES=$(sqlite3 -json "$DB_PATH" "
    SELECT sprint, task_num, title, description, done_when, type, skills, priority
    FROM available_tasks
    WHERE 1=1 $SPRINT_WHERE
    ORDER BY priority ASC NULLS LAST, task_num ASC
    LIMIT 10;
" 2>/dev/null)

if [ -z "$CANDIDATES" ] || [ "$CANDIDATES" = "[]" ]; then
    echo -e "${YELLOW}No available tasks found.${NC}" >&2
    exit 2
fi

# --- Attempt atomic claim ---

CLAIMED=false
CLAIMED_SPRINT=""
CLAIMED_TASK_NUM=""
CLAIMED_TITLE=""
CLAIMED_DESCRIPTION=""
CLAIMED_DONE_WHEN=""
CLAIMED_TYPE=""
CLAIMED_SKILLS=""

# Parse candidates and try each one
COUNT=$(echo "$CANDIDATES" | jq 'length')
for i in $(seq 0 $((COUNT - 1))); do
    SPRINT=$(echo "$CANDIDATES" | jq -r ".[$i].sprint")
    TASK_NUM=$(echo "$CANDIDATES" | jq -r ".[$i].task_num")
    TITLE=$(echo "$CANDIDATES" | jq -r ".[$i].title")

    echo -e "Attempting to claim: ${SPRINT}#${TASK_NUM} — ${TITLE}" >&2

    # Atomic claim: UPDATE only if still unclaimed
    SESSION_SET=""
    if [ -n "$SESSION_ID" ]; then
        SESSION_SET=", session_id = '$SESSION_ID'"
    fi

    sqlite3 "$DB_PATH" "
        UPDATE tasks
        SET owner = '$AGENT_ID',
            status = 'red'
            $SESSION_SET
        WHERE sprint = '$SPRINT'
          AND task_num = $TASK_NUM
          AND owner IS NULL
          AND status = 'pending';
    "

    # Verify the claim succeeded (check if the row was actually updated)
    ACTUAL_OWNER=$(sqlite3 "$DB_PATH" "
        SELECT owner FROM tasks
        WHERE sprint = '$SPRINT' AND task_num = $TASK_NUM;
    ")

    if [ "$ACTUAL_OWNER" = "$AGENT_ID" ]; then
        CLAIMED=true
        CLAIMED_SPRINT="$SPRINT"
        CLAIMED_TASK_NUM="$TASK_NUM"
        CLAIMED_TITLE="$TITLE"
        CLAIMED_DESCRIPTION=$(echo "$CANDIDATES" | jq -r ".[$i].description // \"\"")
        CLAIMED_DONE_WHEN=$(echo "$CANDIDATES" | jq -r ".[$i].done_when // \"\"")
        CLAIMED_TYPE=$(echo "$CANDIDATES" | jq -r ".[$i].type // \"\"")
        CLAIMED_SKILLS=$(echo "$CANDIDATES" | jq -r ".[$i].skills // \"\"")
        echo -e "${GREEN}Claimed: ${SPRINT}#${TASK_NUM} — ${TITLE}${NC}" >&2
        break
    else
        echo -e "${YELLOW}Contention on ${SPRINT}#${TASK_NUM}, trying next...${NC}" >&2
    fi
done

if [ "$CLAIMED" = false ]; then
    echo -e "${RED}Failed to claim any task (all contested).${NC}" >&2
    exit 2
fi

# --- Create worktree ---

WORKTREE_PATH=$(bash "$CREATE_WORKTREE" "$CLAIMED_SPRINT" "$CLAIMED_TASK_NUM" 2>/dev/null)

if [ -z "$WORKTREE_PATH" ]; then
    echo -e "${RED}Error: Failed to create worktree${NC}" >&2
    # Unclaim the task since we can't set up the workspace
    sqlite3 "$DB_PATH" "
        UPDATE tasks
        SET owner = NULL, status = 'pending', session_id = NULL
        WHERE sprint = '$CLAIMED_SPRINT' AND task_num = $CLAIMED_TASK_NUM;
    "
    exit 1
fi

# --- Output JSON ---

# Use jq to safely encode strings (handles quotes, newlines, etc.)
jq -n \
    --arg agent_id "$AGENT_ID" \
    --arg sprint "$CLAIMED_SPRINT" \
    --argjson task_num "$CLAIMED_TASK_NUM" \
    --arg title "$CLAIMED_TITLE" \
    --arg description "$CLAIMED_DESCRIPTION" \
    --arg done_when "$CLAIMED_DONE_WHEN" \
    --arg type "$CLAIMED_TYPE" \
    --arg skills "$CLAIMED_SKILLS" \
    --arg worktree_path "$WORKTREE_PATH" \
    --arg branch "task/${CLAIMED_SPRINT}-${CLAIMED_TASK_NUM}" \
    '{
        agent_id: $agent_id,
        sprint: $sprint,
        task_num: $task_num,
        title: $title,
        description: $description,
        done_when: $done_when,
        type: $type,
        skills: $skills,
        worktree_path: $worktree_path,
        branch: $branch
    }'
