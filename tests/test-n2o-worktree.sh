#!/bin/bash
set -uo pipefail

# =============================================================================
# E2E Tests for: scripts/coordination/create-worktree.sh
#                scripts/coordination/cleanup-worktree.sh
# Covers: worktree creation, isolation, re-claim recovery, cleanup,
#         uncommitted changes protection, edge cases
# Pure bash — no external test frameworks required.
# Usage: bash tests/test-n2o-worktree.sh
# =============================================================================

N2O_DIR="$(cd "$(dirname "$0")/.." && pwd)"
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
  # git rev-parse --show-toplevel resolves symlinks, so paths must match
  TEST_DIR=$(cd "$(mktemp -d)" && pwd -P)
  mkdir -p "$TEST_DIR/.pm"
  sqlite3 "$TEST_DIR/.pm/tasks.db" < "$SCHEMA"
  git -C "$TEST_DIR" init -q
  git -C "$TEST_DIR" config user.email "test@test.com"
  git -C "$TEST_DIR" config user.name "Test"
  # Initial commit so we have a HEAD
  echo "initial" > "$TEST_DIR/README.md"
  git -C "$TEST_DIR" add README.md
  git -C "$TEST_DIR" commit -q -m "initial"
  # Seed a few tasks
  sqlite3 "$TEST_DIR/.pm/tasks.db" "INSERT INTO tasks (sprint, task_num, title, type, status) VALUES ('test-sprint', 1, 'Task One', 'infra', 'pending');"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "INSERT INTO tasks (sprint, task_num, title, type, status) VALUES ('test-sprint', 2, 'Task Two', 'frontend', 'pending');"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "INSERT INTO tasks (sprint, task_num, title, type, status) VALUES ('test-sprint', 3, 'Task Three', 'database', 'pending');"
  # Add a config.json
  echo '{"project_name":"test"}' > "$TEST_DIR/.pm/config.json"
}

teardown() {
  if [[ -n "$TEST_DIR" && -d "$TEST_DIR" ]]; then
    # Clean up any worktrees before removing the dir
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

# -----------------------------------------------------------------------------
# create-worktree tests
# -----------------------------------------------------------------------------

test_create_missing_args() {
  local rc=0
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" 2>/dev/null) || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    echo "    ASSERT FAILED: Missing args should exit non-zero" >&2
    return 1
  fi
}

test_create_nonexistent_task() {
  local rc=0
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "fake" 99 2>/dev/null) || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    echo "    ASSERT FAILED: Nonexistent task should exit non-zero" >&2
    return 1
  fi
}

test_create_success() {
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1)
  assert_dir_exists "$TEST_DIR/.worktrees/test-sprint-1"
}

test_create_returns_path() {
  local path
  path=$(cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 2>/dev/null)
  assert_equals "$TEST_DIR/.worktrees/test-sprint-1" "$path" "Should return worktree path on stdout"
}

test_create_branch_exists() {
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1)
  local branch_exists
  branch_exists=$(git -C "$TEST_DIR" show-ref --verify --quiet "refs/heads/task/test-sprint-1" && echo "yes" || echo "no")
  assert_equals "yes" "$branch_exists" "Branch task/test-sprint-1 should exist"
}

test_create_copies_tasks_db() {
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1)
  assert_file_exists "$TEST_DIR/.worktrees/test-sprint-1/.pm/tasks.db" "tasks.db should be copied to worktree"
  # Verify it's a real copy with data
  local count
  count=$(sqlite3 "$TEST_DIR/.worktrees/test-sprint-1/.pm/tasks.db" "SELECT COUNT(*) FROM tasks;")
  if [[ "$count" -lt 1 ]]; then
    echo "    ASSERT FAILED: Copied tasks.db should have tasks (got $count)" >&2
    return 1
  fi
}

test_create_copies_config() {
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1)
  assert_file_exists "$TEST_DIR/.worktrees/test-sprint-1/.pm/config.json" "config.json should be copied to worktree"
}

test_create_isolation() {
  # Create two worktrees
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1)
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 2 >/dev/null 2>&1)

  # Write a file in worktree 1
  echo "agent1 was here" > "$TEST_DIR/.worktrees/test-sprint-1/agent1.txt"

  # File should NOT exist in worktree 2
  assert_file_not_exists "$TEST_DIR/.worktrees/test-sprint-2/agent1.txt" "File from worktree 1 should not be visible in worktree 2"

  # File should NOT exist in main working dir
  assert_file_not_exists "$TEST_DIR/agent1.txt" "File from worktree 1 should not be visible in main dir"
}

test_create_reclaim_existing() {
  # Create worktree
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1)
  assert_dir_exists "$TEST_DIR/.worktrees/test-sprint-1"

  # Re-create (simulate crash recovery)
  local rc=0
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1) || rc=$?
  assert_equals 0 "$rc" "Re-claim should succeed"
  assert_dir_exists "$TEST_DIR/.worktrees/test-sprint-1"
}

test_create_three_concurrent() {
  # Create 3 worktrees
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1)
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 2 >/dev/null 2>&1)
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 3 >/dev/null 2>&1)

  # All three should exist
  assert_dir_exists "$TEST_DIR/.worktrees/test-sprint-1"
  assert_dir_exists "$TEST_DIR/.worktrees/test-sprint-2"
  assert_dir_exists "$TEST_DIR/.worktrees/test-sprint-3"

  # Git should list 4 worktrees (main + 3)
  local count
  count=$(git -C "$TEST_DIR" worktree list | wc -l | tr -d ' ')
  assert_equals "4" "$count" "Should have 4 worktrees (main + 3)"
}

# -----------------------------------------------------------------------------
# cleanup-worktree tests
# -----------------------------------------------------------------------------

test_cleanup_success() {
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1)
  assert_dir_exists "$TEST_DIR/.worktrees/test-sprint-1"

  (cd "$TEST_DIR" && bash "$CLEANUP_SCRIPT" "test-sprint" 1 2>/dev/null)
  assert_dir_not_exists "$TEST_DIR/.worktrees/test-sprint-1" "Worktree directory should be removed"
}

test_cleanup_deletes_merged_branch() {
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1)
  # Branch was created from HEAD with no new commits, so it's "merged"
  (cd "$TEST_DIR" && bash "$CLEANUP_SCRIPT" "test-sprint" 1 2>/dev/null)

  local branch_exists
  branch_exists=$(git -C "$TEST_DIR" show-ref --verify --quiet "refs/heads/task/test-sprint-1" 2>/dev/null && echo "yes" || echo "no")
  assert_equals "no" "$branch_exists" "Merged branch should be deleted"
}

test_cleanup_keeps_unmerged_branch() {
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1)

  # Make a commit on the worktree branch so it's unmerged
  echo "new work" > "$TEST_DIR/.worktrees/test-sprint-1/new-file.txt"
  git -C "$TEST_DIR/.worktrees/test-sprint-1" add new-file.txt
  git -C "$TEST_DIR/.worktrees/test-sprint-1" commit -q -m "new work on task branch"

  (cd "$TEST_DIR" && bash "$CLEANUP_SCRIPT" "test-sprint" 1 2>/dev/null)

  # Worktree removed but branch should still exist
  assert_dir_not_exists "$TEST_DIR/.worktrees/test-sprint-1"
  local branch_exists
  branch_exists=$(git -C "$TEST_DIR" show-ref --verify --quiet "refs/heads/task/test-sprint-1" 2>/dev/null && echo "yes" || echo "no")
  assert_equals "yes" "$branch_exists" "Unmerged branch should be kept"
}

test_cleanup_blocks_uncommitted() {
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1)

  # Stage a file without committing
  echo "dirty" > "$TEST_DIR/.worktrees/test-sprint-1/dirty.txt"
  git -C "$TEST_DIR/.worktrees/test-sprint-1" add dirty.txt

  local rc=0
  (cd "$TEST_DIR" && bash "$CLEANUP_SCRIPT" "test-sprint" 1 2>/dev/null) || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    echo "    ASSERT FAILED: Should fail with uncommitted changes" >&2
    return 1
  fi

  # Worktree should still exist
  assert_dir_exists "$TEST_DIR/.worktrees/test-sprint-1"
}

test_cleanup_force_uncommitted() {
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1)

  echo "dirty" > "$TEST_DIR/.worktrees/test-sprint-1/dirty.txt"
  git -C "$TEST_DIR/.worktrees/test-sprint-1" add dirty.txt

  local rc=0
  (cd "$TEST_DIR" && bash "$CLEANUP_SCRIPT" "test-sprint" 1 --force 2>/dev/null) || rc=$?
  assert_equals 0 "$rc" "Force cleanup should succeed"
  assert_dir_not_exists "$TEST_DIR/.worktrees/test-sprint-1"
}

test_cleanup_nonexistent_graceful() {
  # Cleanup a worktree that doesn't exist
  local rc=0
  (cd "$TEST_DIR" && bash "$CLEANUP_SCRIPT" "test-sprint" 99 2>/dev/null) || rc=$?
  assert_equals 0 "$rc" "Cleaning up nonexistent worktree should exit 0"
}

test_cleanup_missing_args() {
  local rc=0
  (cd "$TEST_DIR" && bash "$CLEANUP_SCRIPT" 2>/dev/null) || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    echo "    ASSERT FAILED: Missing args should exit non-zero" >&2
    return 1
  fi
}

# -----------------------------------------------------------------------------
# Full lifecycle tests
# -----------------------------------------------------------------------------

test_full_lifecycle() {
  # Create 3 worktrees
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1)
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 2 >/dev/null 2>&1)
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 3 >/dev/null 2>&1)

  # Write independent files in each
  echo "work1" > "$TEST_DIR/.worktrees/test-sprint-1/file1.txt"
  echo "work2" > "$TEST_DIR/.worktrees/test-sprint-2/file2.txt"
  echo "work3" > "$TEST_DIR/.worktrees/test-sprint-3/file3.txt"

  # Commit in each
  git -C "$TEST_DIR/.worktrees/test-sprint-1" add file1.txt && git -C "$TEST_DIR/.worktrees/test-sprint-1" commit -q -m "task 1 work"
  git -C "$TEST_DIR/.worktrees/test-sprint-2" add file2.txt && git -C "$TEST_DIR/.worktrees/test-sprint-2" commit -q -m "task 2 work"
  git -C "$TEST_DIR/.worktrees/test-sprint-3" add file3.txt && git -C "$TEST_DIR/.worktrees/test-sprint-3" commit -q -m "task 3 work"

  # Merge all into main
  local main_branch
  main_branch=$(git -C "$TEST_DIR" rev-parse --abbrev-ref HEAD)
  git -C "$TEST_DIR" merge --no-ff -q "task/test-sprint-1" -m "merge task 1"
  git -C "$TEST_DIR" merge --no-ff -q "task/test-sprint-2" -m "merge task 2"
  git -C "$TEST_DIR" merge --no-ff -q "task/test-sprint-3" -m "merge task 3"

  # Cleanup all
  (cd "$TEST_DIR" && bash "$CLEANUP_SCRIPT" "test-sprint" 1 2>/dev/null)
  (cd "$TEST_DIR" && bash "$CLEANUP_SCRIPT" "test-sprint" 2 2>/dev/null)
  (cd "$TEST_DIR" && bash "$CLEANUP_SCRIPT" "test-sprint" 3 2>/dev/null)

  # All worktrees gone
  assert_dir_not_exists "$TEST_DIR/.worktrees/test-sprint-1"
  assert_dir_not_exists "$TEST_DIR/.worktrees/test-sprint-2"
  assert_dir_not_exists "$TEST_DIR/.worktrees/test-sprint-3"

  # All branches deleted (they were merged)
  local branches
  branches=$(git -C "$TEST_DIR" branch | grep "task/" || echo "")
  assert_equals "" "$branches" "All task branches should be deleted after merge"

  # All files present on main
  assert_file_exists "$TEST_DIR/file1.txt"
  assert_file_exists "$TEST_DIR/file2.txt"
  assert_file_exists "$TEST_DIR/file3.txt"
}

test_shared_git_database() {
  # Create a worktree
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "test-sprint" 1 >/dev/null 2>&1)

  # Commit in the worktree
  echo "feature" > "$TEST_DIR/.worktrees/test-sprint-1/feature.txt"
  git -C "$TEST_DIR/.worktrees/test-sprint-1" add feature.txt
  git -C "$TEST_DIR/.worktrees/test-sprint-1" commit -q -m "add feature"

  # The commit should be visible from the main repo's git log (shared .git database)
  local commit_exists
  commit_exists=$(git -C "$TEST_DIR" log --all --oneline | grep -c "add feature")
  if [[ "$commit_exists" -lt 1 ]]; then
    echo "    ASSERT FAILED: Commit from worktree should be visible in main repo's git log --all" >&2
    return 1
  fi
}

# =============================================================================
# Run tests
# =============================================================================

echo ""
echo -e "${BOLD}N2O Worktree (create/cleanup) — E2E Tests${NC}"
echo -e "${BOLD}===========================================${NC}"

echo ""
echo -e "${BOLD}create-worktree.sh — Argument Validation${NC}"
run_test "Missing all args exits non-zero"              test_create_missing_args
run_test "Nonexistent task exits non-zero"              test_create_nonexistent_task

echo ""
echo -e "${BOLD}create-worktree.sh — Success Cases${NC}"
run_test "Creates worktree directory"                   test_create_success
run_test "Returns worktree path on stdout"              test_create_returns_path
run_test "Creates task branch"                          test_create_branch_exists
run_test "Copies tasks.db to worktree"                  test_create_copies_tasks_db
run_test "Copies config.json to worktree"               test_create_copies_config

echo ""
echo -e "${BOLD}create-worktree.sh — Isolation & Concurrency${NC}"
run_test "Files isolated between worktrees"             test_create_isolation
run_test "Re-claim existing worktree succeeds"          test_create_reclaim_existing
run_test "Three concurrent worktrees"                   test_create_three_concurrent

echo ""
echo -e "${BOLD}cleanup-worktree.sh — Success Cases${NC}"
run_test "Removes worktree directory"                   test_cleanup_success
run_test "Deletes merged branch"                        test_cleanup_deletes_merged_branch
run_test "Keeps unmerged branch"                        test_cleanup_keeps_unmerged_branch

echo ""
echo -e "${BOLD}cleanup-worktree.sh — Edge Cases${NC}"
run_test "Blocks cleanup with uncommitted changes"      test_cleanup_blocks_uncommitted
run_test "Force flag overrides uncommitted check"       test_cleanup_force_uncommitted
run_test "Nonexistent worktree exits gracefully"        test_cleanup_nonexistent_graceful
run_test "Missing args exits non-zero"                  test_cleanup_missing_args

echo ""
echo -e "${BOLD}Full Lifecycle${NC}"
run_test "Create 3, commit, merge, cleanup all"         test_full_lifecycle
run_test "Worktree commits visible via shared .git"     test_shared_git_database

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
