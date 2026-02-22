#!/bin/bash
# Remove a git worktree after a task is merged or abandoned.
#
# Usage: ./scripts/coordination/cleanup-worktree.sh <sprint> <task_num> [--force]
# Example: ./scripts/coordination/cleanup-worktree.sh coordination 1
#
# This script:
# 1. Removes the worktree at .worktrees/{sprint}-{task_num}/
# 2. Deletes the branch if it has been merged into the base branch
# 3. If the branch is NOT merged, warns and keeps it (unless --force)
#
# Pass --force to remove even if there are uncommitted changes or unmerged branch.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# --- Argument validation ---

if [ $# -lt 2 ]; then
    echo -e "${RED}Error: Missing arguments${NC}" >&2
    echo "Usage: $0 <sprint> <task_num> [--force]" >&2
    echo "Example: $0 coordination 1" >&2
    exit 1
fi

SPRINT="$1"
TASK_NUM="$2"
FORCE=false
if [ "${3:-}" = "--force" ]; then
    FORCE=true
fi

# --- Locate project root ---

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$PROJECT_ROOT" ]; then
    echo -e "${RED}Error: Not inside a git repository${NC}" >&2
    exit 1
fi

BRANCH_NAME="task/${SPRINT}-${TASK_NUM}"
WORKTREE_DIR="$PROJECT_ROOT/.worktrees/${SPRINT}-${TASK_NUM}"

# Determine the base branch to check merges against.
# Prefer main, then master, then whatever HEAD points to.
if git -C "$PROJECT_ROOT" show-ref --verify --quiet refs/heads/main 2>/dev/null; then
    BASE_BRANCH="main"
elif git -C "$PROJECT_ROOT" show-ref --verify --quiet refs/heads/master 2>/dev/null; then
    BASE_BRANCH="master"
else
    BASE_BRANCH="$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)"
fi

# --- Check worktree exists ---

if [ ! -d "$WORKTREE_DIR" ]; then
    echo -e "${YELLOW}Warning: Worktree does not exist at $WORKTREE_DIR${NC}" >&2
    echo -e "${YELLOW}Nothing to clean up.${NC}" >&2

    # Still try to delete the branch if it exists and is merged
    if git -C "$PROJECT_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME" 2>/dev/null; then
        if git -C "$PROJECT_ROOT" branch --merged "$BASE_BRANCH" | grep -q "$BRANCH_NAME"; then
            git -C "$PROJECT_ROOT" branch -d "$BRANCH_NAME" 2>/dev/null
            echo -e "${GREEN}Deleted merged branch: $BRANCH_NAME${NC}" >&2
        fi
    fi
    exit 0
fi

# --- Check for uncommitted changes ---

if [ "$FORCE" = false ]; then
    if ! git -C "$WORKTREE_DIR" diff --quiet 2>/dev/null || ! git -C "$WORKTREE_DIR" diff --cached --quiet 2>/dev/null; then
        echo -e "${RED}Error: Worktree has uncommitted changes${NC}" >&2
        echo -e "  Path: $WORKTREE_DIR" >&2
        echo -e "  Use --force to remove anyway, or commit/stash changes first." >&2
        exit 1
    fi
fi

# --- Remove files we created during worktree setup ---
# create-worktree.sh copies .pm/tasks.db and config.json into the worktree.
# These untracked files cause `git worktree remove` to fail, so clean them first.

rm -rf "$WORKTREE_DIR/.pm"

# --- Remove the worktree ---

if [ "$FORCE" = true ]; then
    git -C "$PROJECT_ROOT" worktree remove --force "$WORKTREE_DIR"
else
    git -C "$PROJECT_ROOT" worktree remove "$WORKTREE_DIR"
fi

echo -e "${GREEN}Worktree removed: $WORKTREE_DIR${NC}" >&2

# --- Delete the branch if merged ---

if git -C "$PROJECT_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME" 2>/dev/null; then
    # Check if branch is merged into current branch (usually main/master)
    if git -C "$PROJECT_ROOT" branch --merged "$BASE_BRANCH" | grep -q "$BRANCH_NAME"; then
        git -C "$PROJECT_ROOT" branch -d "$BRANCH_NAME"
        echo -e "${GREEN}Deleted merged branch: $BRANCH_NAME${NC}" >&2
    elif [ "$FORCE" = true ]; then
        git -C "$PROJECT_ROOT" branch -D "$BRANCH_NAME"
        echo -e "${YELLOW}Force-deleted unmerged branch: $BRANCH_NAME${NC}" >&2
    else
        echo -e "${YELLOW}Branch $BRANCH_NAME is NOT merged — keeping it.${NC}" >&2
        echo -e "${YELLOW}Use --force to delete anyway.${NC}" >&2
    fi
fi

# --- Prune stale worktree refs ---

git -C "$PROJECT_ROOT" worktree prune 2>/dev/null

echo -e "${GREEN}Cleanup complete for Task #$TASK_NUM ($SPRINT)${NC}" >&2
