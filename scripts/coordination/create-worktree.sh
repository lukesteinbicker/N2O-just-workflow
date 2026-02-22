#!/bin/bash
# Create an isolated git worktree for an agent working on a task.
#
# Usage: ./scripts/coordination/create-worktree.sh <sprint> <task_num>
# Example: ./scripts/coordination/create-worktree.sh coordination 1
#
# This script:
# 1. Creates a branch task/{sprint}-{task_num} from current HEAD
# 2. Creates a worktree at .worktrees/{sprint}-{task_num}/
# 3. Copies .pm/tasks.db into the worktree for local reads
# 4. Outputs the worktree path on success
#
# The worktree is a fully independent working directory backed by the same
# .git database. Each agent gets its own worktree so uncommitted changes
# are invisible to other agents.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# --- Argument validation ---

if [ $# -lt 2 ]; then
    echo -e "${RED}Error: Missing arguments${NC}" >&2
    echo "Usage: $0 <sprint> <task_num>" >&2
    echo "Example: $0 coordination 1" >&2
    exit 1
fi

SPRINT="$1"
TASK_NUM="$2"

# --- Locate project root (find .git directory) ---

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$PROJECT_ROOT" ]; then
    echo -e "${RED}Error: Not inside a git repository${NC}" >&2
    exit 1
fi

DB_PATH="$PROJECT_ROOT/.pm/tasks.db"
BRANCH_NAME="task/${SPRINT}-${TASK_NUM}"
WORKTREE_DIR="$PROJECT_ROOT/.worktrees/${SPRINT}-${TASK_NUM}"

# --- Validate task exists ---

if [ ! -f "$DB_PATH" ]; then
    echo -e "${RED}Error: Database not found at $DB_PATH${NC}" >&2
    exit 1
fi

TASK_TITLE=$(sqlite3 "$DB_PATH" "SELECT title FROM tasks WHERE sprint = '$SPRINT' AND task_num = $TASK_NUM;")
if [ -z "$TASK_TITLE" ]; then
    echo -e "${RED}Error: Task not found: sprint='$SPRINT', task_num=$TASK_NUM${NC}" >&2
    exit 1
fi

# --- Handle existing worktree (re-claim after crash) ---

if [ -d "$WORKTREE_DIR" ]; then
    echo -e "${YELLOW}Warning: Worktree already exists at $WORKTREE_DIR${NC}" >&2
    echo -e "${YELLOW}Removing stale worktree and recreating...${NC}" >&2
    git -C "$PROJECT_ROOT" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || rm -rf "$WORKTREE_DIR"
fi

# --- Handle existing branch ---

if git -C "$PROJECT_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME" 2>/dev/null; then
    echo -e "${YELLOW}Warning: Branch $BRANCH_NAME already exists, reusing it${NC}" >&2
    git -C "$PROJECT_ROOT" worktree add "$WORKTREE_DIR" "$BRANCH_NAME" >&2 2>&1
else
    # Create new branch from HEAD and worktree in one step
    git -C "$PROJECT_ROOT" worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" >&2 2>&1
fi

# --- Copy tasks.db for local reads ---

mkdir -p "$WORKTREE_DIR/.pm"
cp "$DB_PATH" "$WORKTREE_DIR/.pm/tasks.db"

# --- Copy config if it exists ---

if [ -f "$PROJECT_ROOT/.pm/config.json" ]; then
    cp "$PROJECT_ROOT/.pm/config.json" "$WORKTREE_DIR/.pm/config.json"
fi

# --- Output ---

echo -e "${GREEN}Worktree created for Task #$TASK_NUM ($SPRINT)${NC}" >&2
echo -e "  Title:    $TASK_TITLE" >&2
echo -e "  Branch:   $BRANCH_NAME" >&2
echo -e "  Path:     $WORKTREE_DIR" >&2

# Print just the path to stdout (for scripting)
echo "$WORKTREE_DIR"
