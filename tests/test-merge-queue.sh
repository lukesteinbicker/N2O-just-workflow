#!/bin/bash
set -uo pipefail

# =============================================================================
# E2E Tests for: scripts/coordination/merge-queue.sh
# Covers: clean merges, conflict detection, dependency gating, schema changes,
#         --once mode, --dry-run, --sprint filter, edge cases
# Pure bash — no external test frameworks required.
# Usage: bash tests/test-merge-queue.sh
# =============================================================================

N2O_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MERGE_QUEUE="$N2O_DIR/scripts/coordination/merge-queue.sh"
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
  TEST_DIR=$(cd "$(mktemp -d)" && pwd -P)
  mkdir -p "$TEST_DIR/.pm"
  sqlite3 "$TEST_DIR/.pm/tasks.db" < "$SCHEMA"
  git -C "$TEST_DIR" init -q
  git -C "$TEST_DIR" config user.email "test@test.com"
  git -C "$TEST_DIR" config user.name "Test"
  echo "initial" > "$TEST_DIR/README.md"
  git -C "$TEST_DIR" add README.md
  git -C "$TEST_DIR" commit -q -m "initial"
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
      grep "ASSERT FAILED" "$err_file" | head -3 | sed 's/^/    /'
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

assert_not_equals() {
  local not_expected="$1"
  local actual="$2"
  local msg="${3:-Should not equal '$not_expected'}"
  if [[ "$not_expected" = "$actual" ]]; then
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

assert_output_contains() {
  local output="$1"
  local pattern="$2"
  local msg="${3:-Output should contain: $pattern}"
  if [[ "$output" != *"$pattern"* ]]; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

# -----------------------------------------------------------------------------
# Helpers: seed tasks, create worktree with work, complete a task
# -----------------------------------------------------------------------------

seed_task() {
  local sprint="$1"
  local task_num="$2"
  local title="${3:-Task $task_num}"
  local status="${4:-pending}"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "INSERT INTO tasks (sprint, task_num, title, type, status) VALUES ('$sprint', $task_num, '$title', 'infra', '$status');"
}

# Create a worktree, add a file, commit, and mark task green
complete_task_in_worktree() {
  local sprint="$1"
  local task_num="$2"
  local filename="${3:-file${task_num}.txt}"

  # Create worktree
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "$sprint" "$task_num" >/dev/null 2>&1)

  # Do work and commit
  local wt_dir="$TEST_DIR/.worktrees/${sprint}-${task_num}"
  echo "work for task $task_num" > "$wt_dir/$filename"
  git -C "$wt_dir" add "$filename"
  git -C "$wt_dir" commit -q -m "task $task_num: add $filename"

  # Mark task green
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = '$sprint' AND task_num = $task_num;"
}

add_dependency() {
  local sprint="$1"
  local task_num="$2"
  local dep_sprint="$3"
  local dep_task="$4"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES ('$sprint', $task_num, '$dep_sprint', $dep_task);"
}

# =============================================================================
# Tests: Basic merge behavior
# =============================================================================

test_clean_merge_single_task() {
  seed_task "s" 1 "Add feature"
  complete_task_in_worktree "s" 1

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null)

  # File should be on the base branch
  local content
  content=$(cat "$TEST_DIR/file1.txt" 2>/dev/null || echo "")
  assert_equals "work for task 1" "$content" "Merged file should be on base branch"
}

test_merged_at_set_after_merge() {
  seed_task "s" 1 "Add feature"
  complete_task_in_worktree "s" 1

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null)

  local merged_at
  merged_at=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT merged_at FROM tasks WHERE sprint = 's' AND task_num = 1;")
  assert_not_equals "" "$merged_at" "merged_at should be set after merge"
}

test_commit_hash_set_after_merge() {
  seed_task "s" 1 "Add feature"
  complete_task_in_worktree "s" 1

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null)

  local commit_hash
  commit_hash=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT commit_hash FROM tasks WHERE sprint = 's' AND task_num = 1;")
  assert_not_equals "" "$commit_hash" "commit_hash should be set after merge"

  # Verify it's a valid git hash
  local valid
  valid=$(git -C "$TEST_DIR" cat-file -t "$commit_hash" 2>/dev/null || echo "invalid")
  assert_equals "commit" "$valid" "commit_hash should be a valid git commit"
}

test_worktree_cleaned_after_merge() {
  seed_task "s" 1 "Add feature"
  complete_task_in_worktree "s" 1

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null)

  assert_dir_not_exists "$TEST_DIR/.worktrees/s-1" "Worktree should be cleaned up after merge"
}

test_branch_deleted_after_merge() {
  seed_task "s" 1 "Add feature"
  complete_task_in_worktree "s" 1

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null)

  local branch_exists
  branch_exists=$(git -C "$TEST_DIR" show-ref --verify --quiet "refs/heads/task/s-1" 2>/dev/null && echo "yes" || echo "no")
  assert_equals "no" "$branch_exists" "Task branch should be deleted after merge"
}

test_multiple_tasks_merged_sequentially() {
  seed_task "s" 1 "Task one"
  seed_task "s" 2 "Task two"
  seed_task "s" 3 "Task three"
  complete_task_in_worktree "s" 1 "a.txt"
  complete_task_in_worktree "s" 2 "b.txt"
  complete_task_in_worktree "s" 3 "c.txt"

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null)

  # All files should be on base branch
  assert_file_exists "$TEST_DIR/a.txt" "a.txt should be merged"
  assert_file_exists "$TEST_DIR/b.txt" "b.txt should be merged"
  assert_file_exists "$TEST_DIR/c.txt" "c.txt should be merged"

  # All tasks should have merged_at
  local count
  count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM tasks WHERE merged_at IS NOT NULL;")
  assert_equals "3" "$count" "All 3 tasks should have merged_at set"
}

test_already_merged_task_skipped() {
  seed_task "s" 1 "Already done"
  complete_task_in_worktree "s" 1

  # Run twice
  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null)
  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null)

  # Should still only have 1 merge commit (plus initial)
  local merge_count
  merge_count=$(git -C "$TEST_DIR" log --oneline | grep -c "merge:" || echo "0")
  assert_equals "1" "$merge_count" "Should only merge once"
}

# =============================================================================
# Tests: Conflict handling
# =============================================================================

test_conflict_aborted_and_logged() {
  seed_task "s" 1 "Modify readme"
  seed_task "s" 2 "Also modify readme"

  # Task 1: modify README.md in worktree (same key, different value → unresolvable)
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 1 >/dev/null 2>&1)
  echo "title: Task One Version" > "$TEST_DIR/.worktrees/s-1/README.md"
  git -C "$TEST_DIR/.worktrees/s-1" add README.md
  git -C "$TEST_DIR/.worktrees/s-1" commit -q -m "task 1: modify readme"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 1;"

  # Task 2: modify same key differently (title: X vs title: Y → shared key → escalated)
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 2 >/dev/null 2>&1)
  echo "title: Task Two Version" > "$TEST_DIR/.worktrees/s-2/README.md"
  git -C "$TEST_DIR/.worktrees/s-2" add README.md
  git -C "$TEST_DIR/.worktrees/s-2" commit -q -m "task 2: modify readme"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 2;"

  # Run merge queue — task 1 should merge, task 2 should conflict (unresolvable)
  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null) || true

  # Task 1 should be merged
  local merged1
  merged1=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT merged_at FROM tasks WHERE sprint = 's' AND task_num = 1;")
  assert_not_equals "" "$merged1" "Task 1 should be merged"

  # Task 2 should NOT be merged
  local merged2
  merged2=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COALESCE(merged_at, '') FROM tasks WHERE sprint = 's' AND task_num = 2;")
  assert_equals "" "$merged2" "Task 2 should NOT be merged (conflict)"

  # Conflict report should exist
  assert_file_exists "$TEST_DIR/.pm/conflicts/s-2.md" "Conflict report should be created"
}

test_conflict_does_not_block_other_merges() {
  seed_task "s" 1 "Modify readme"
  seed_task "s" 2 "Also modify readme"
  seed_task "s" 3 "Independent work"

  # Task 1: modify README.md (same key → unresolvable when task 2 also changes it)
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 1 >/dev/null 2>&1)
  echo "title: Task One Version" > "$TEST_DIR/.worktrees/s-1/README.md"
  git -C "$TEST_DIR/.worktrees/s-1" add README.md
  git -C "$TEST_DIR/.worktrees/s-1" commit -q -m "task 1: modify readme"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 1;"

  # Task 2: conflict on README.md (same key, different value)
  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 2 >/dev/null 2>&1)
  echo "title: Task Two Version" > "$TEST_DIR/.worktrees/s-2/README.md"
  git -C "$TEST_DIR/.worktrees/s-2" add README.md
  git -C "$TEST_DIR/.worktrees/s-2" commit -q -m "task 2: modify readme"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 2;"

  # Task 3: independent file
  complete_task_in_worktree "s" 3 "independent.txt"

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null) || true

  # Task 1 and 3 should be merged, task 2 should conflict
  local merged1 merged3
  merged1=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT merged_at FROM tasks WHERE sprint = 's' AND task_num = 1;")
  merged3=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT merged_at FROM tasks WHERE sprint = 's' AND task_num = 3;")
  assert_not_equals "" "$merged1" "Task 1 should be merged"
  assert_not_equals "" "$merged3" "Task 3 should be merged despite task 2 conflict"
}

test_conflict_report_mentions_task() {
  seed_task "s" 1 "Modify readme"
  seed_task "s" 2 "Also modify readme"

  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 1 >/dev/null 2>&1)
  echo "title: First Version" > "$TEST_DIR/.worktrees/s-1/README.md"
  git -C "$TEST_DIR/.worktrees/s-1" add README.md
  git -C "$TEST_DIR/.worktrees/s-1" commit -q -m "task 1"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 1;"

  (cd "$TEST_DIR" && bash "$CREATE_SCRIPT" "s" 2 >/dev/null 2>&1)
  echo "title: Second Version" > "$TEST_DIR/.worktrees/s-2/README.md"
  git -C "$TEST_DIR/.worktrees/s-2" add README.md
  git -C "$TEST_DIR/.worktrees/s-2" commit -q -m "task 2"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 2;"

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null) || true

  local report
  report=$(cat "$TEST_DIR/.pm/conflicts/s-2.md" 2>/dev/null || echo "")
  assert_output_contains "$report" "Also modify readme" "Conflict report should contain task title"
  assert_output_contains "$report" "task/s-2" "Conflict report should contain branch name"
}

# =============================================================================
# Tests: Dependency-aware gating (available_tasks view)
# =============================================================================

test_dependency_gating_blocks_unmerged() {
  seed_task "s" 1 "Prerequisite"
  seed_task "s" 2 "Dependent" "pending"
  add_dependency "s" 2 "s" 1

  # Mark task 1 green but NOT merged
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 1;"

  # Task 2 should NOT be available (predecessor green but not merged)
  local available
  available=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM available_tasks WHERE sprint = 's' AND task_num = 2;")
  assert_equals "0" "$available" "Task 2 should be blocked (predecessor not merged)"
}

test_dependency_gating_unblocks_after_merge() {
  seed_task "s" 1 "Prerequisite"
  seed_task "s" 2 "Dependent" "pending"
  add_dependency "s" 2 "s" 1

  # Mark task 1 green AND merged
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green', merged_at = CURRENT_TIMESTAMP WHERE sprint = 's' AND task_num = 1;"

  # Task 2 should now be available
  local available
  available=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM available_tasks WHERE sprint = 's' AND task_num = 2;")
  assert_equals "1" "$available" "Task 2 should be available (predecessor green + merged)"
}

test_dependency_chain_requires_all_merged() {
  seed_task "s" 1 "First"
  seed_task "s" 2 "Second"
  seed_task "s" 3 "Third" "pending"
  add_dependency "s" 3 "s" 1
  add_dependency "s" 3 "s" 2

  # Task 1: green + merged; Task 2: green but NOT merged
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green', merged_at = CURRENT_TIMESTAMP WHERE sprint = 's' AND task_num = 1;"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 2;"

  local available
  available=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM available_tasks WHERE sprint = 's' AND task_num = 3;")
  assert_equals "0" "$available" "Task 3 blocked: task 2 is green but not merged"

  # Now merge task 2
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET merged_at = CURRENT_TIMESTAMP WHERE sprint = 's' AND task_num = 2;"

  available=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM available_tasks WHERE sprint = 's' AND task_num = 3;")
  assert_equals "1" "$available" "Task 3 available: both predecessors green + merged"
}

test_no_dependency_task_always_available() {
  seed_task "s" 1 "Independent"

  local available
  available=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM available_tasks WHERE sprint = 's' AND task_num = 1;")
  assert_equals "1" "$available" "Task with no dependencies should be available"
}

# =============================================================================
# Tests: Direct commits (no worktree branch)
# =============================================================================

test_no_branch_marks_merged() {
  seed_task "s" 1 "Direct commit task"
  sqlite3 "$TEST_DIR/.pm/tasks.db" "UPDATE tasks SET status = 'green' WHERE sprint = 's' AND task_num = 1;"

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null)

  local merged_at
  merged_at=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT merged_at FROM tasks WHERE sprint = 's' AND task_num = 1;")
  assert_not_equals "" "$merged_at" "Task without branch should be marked merged"
}

# =============================================================================
# Tests: Options
# =============================================================================

test_dry_run_no_merge() {
  seed_task "s" 1 "Feature"
  complete_task_in_worktree "s" 1

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once --dry-run 2>/dev/null)

  # File should NOT be on base branch
  local exists
  exists=$([ -f "$TEST_DIR/file1.txt" ] && echo "yes" || echo "no")
  assert_equals "no" "$exists" "Dry run should not actually merge"

  # merged_at should NOT be set
  local merged_at
  merged_at=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COALESCE(merged_at, '') FROM tasks WHERE sprint = 's' AND task_num = 1;")
  assert_equals "" "$merged_at" "Dry run should not set merged_at"
}

test_sprint_filter() {
  seed_task "sprint-a" 1 "Sprint A task"
  seed_task "sprint-b" 1 "Sprint B task"
  complete_task_in_worktree "sprint-a" 1 "a.txt"
  complete_task_in_worktree "sprint-b" 1 "b.txt"

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once --sprint "sprint-a" 2>/dev/null)

  # Sprint A should be merged
  local merged_a
  merged_a=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT merged_at FROM tasks WHERE sprint = 'sprint-a' AND task_num = 1;")
  assert_not_equals "" "$merged_a" "Sprint A task should be merged"

  # Sprint B should NOT be merged
  local merged_b
  merged_b=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COALESCE(merged_at, '') FROM tasks WHERE sprint = 'sprint-b' AND task_num = 1;")
  assert_equals "" "$merged_b" "Sprint B task should NOT be merged (filtered out)"
}

test_help_flag() {
  local output
  output=$(bash "$MERGE_QUEUE" --help 2>&1) || true
  assert_output_contains "$output" "Usage:"
  assert_output_contains "$output" "--once"
  assert_output_contains "$output" "--interval"
}

test_unknown_option_exits_with_message() {
  local rc=0
  local output
  output=$(bash "$MERGE_QUEUE" --bad-flag 2>&1) || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    echo "    ASSERT FAILED: Unknown option should exit non-zero" >&2
    return 1
  fi
  assert_output_contains "$output" "Unknown option" "Should mention 'Unknown option' in error"
  assert_output_contains "$output" "--bad-flag" "Should echo back the unrecognized flag"
}

# =============================================================================
# Tests: Edge cases
# =============================================================================

test_no_mergeable_tasks() {
  # Seed pending + red tasks (not green) — none should be merge-eligible
  seed_task "s" 1 "Pending task" "pending"
  seed_task "s" 2 "Red task" "red"

  local rc=0
  local output
  output=$(cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>&1) || rc=$?
  assert_equals "0" "$rc" "No mergeable tasks should exit 0"
  assert_output_contains "$output" "single-run" "Should display single-run mode in header"

  # Verify pending/red tasks did NOT get merged_at
  local merged_count
  merged_count=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT COUNT(*) FROM tasks WHERE merged_at IS NOT NULL;")
  assert_equals "0" "$merged_count" "Non-green tasks should not be merged"

  # Verify task statuses unchanged
  local status1 status2
  status1=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT status FROM tasks WHERE sprint = 's' AND task_num = 1;")
  status2=$(sqlite3 "$TEST_DIR/.pm/tasks.db" "SELECT status FROM tasks WHERE sprint = 's' AND task_num = 2;")
  assert_equals "pending" "$status1" "Pending task should stay pending"
  assert_equals "red" "$status2" "Red task should stay red"
}

test_merge_preserves_git_state() {
  seed_task "s" 1 "Feature"
  complete_task_in_worktree "s" 1

  # Remember starting branch
  local before_branch
  before_branch=$(git -C "$TEST_DIR" rev-parse --abbrev-ref HEAD)

  (cd "$TEST_DIR" && bash "$MERGE_QUEUE" --once 2>/dev/null)

  # Should still be on same branch
  local after_branch
  after_branch=$(git -C "$TEST_DIR" rev-parse --abbrev-ref HEAD)
  assert_equals "$before_branch" "$after_branch" "Should stay on same branch after merge"

  # Working directory should have no modified/staged/conflicted files
  # (exclude untracked with -uno since .pm/ is always untracked in tests)
  local git_status
  git_status=$(git -C "$TEST_DIR" status --porcelain -uno)
  assert_equals "" "$git_status" "No modified or conflicted files after merge"
}

# =============================================================================
# Run all tests
# =============================================================================

echo ""
echo -e "${BOLD}N2O Merge Queue — E2E Tests${NC}"
echo -e "${BOLD}===========================${NC}"

echo ""
echo -e "${BOLD}Clean merge behavior${NC}"
run_test "Single task clean merge"                        test_clean_merge_single_task
run_test "Sets merged_at after merge"                     test_merged_at_set_after_merge
run_test "Sets commit_hash after merge"                   test_commit_hash_set_after_merge
run_test "Cleans up worktree after merge"                 test_worktree_cleaned_after_merge
run_test "Deletes branch after merge"                     test_branch_deleted_after_merge
run_test "Multiple tasks merged sequentially"             test_multiple_tasks_merged_sequentially
run_test "Already-merged task is skipped"                 test_already_merged_task_skipped

echo ""
echo -e "${BOLD}Conflict handling${NC}"
run_test "Conflict aborted and logged"                    test_conflict_aborted_and_logged
run_test "Conflict does not block other merges"           test_conflict_does_not_block_other_merges
run_test "Conflict report mentions task details"          test_conflict_report_mentions_task

echo ""
echo -e "${BOLD}Dependency-aware gating${NC}"
run_test "Unmerged predecessor blocks dependent"          test_dependency_gating_blocks_unmerged
run_test "Merged predecessor unblocks dependent"          test_dependency_gating_unblocks_after_merge
run_test "Chain requires ALL predecessors merged"         test_dependency_chain_requires_all_merged
run_test "No-dependency task always available"             test_no_dependency_task_always_available

echo ""
echo -e "${BOLD}Direct commits (no worktree)${NC}"
run_test "No branch → marks as merged"                    test_no_branch_marks_merged

echo ""
echo -e "${BOLD}Options${NC}"
run_test "--dry-run does not merge"                       test_dry_run_no_merge
run_test "--sprint filters to one sprint"                 test_sprint_filter
run_test "--help shows usage"                             test_help_flag
run_test "Unknown option exits with message"               test_unknown_option_exits_with_message

echo ""
echo -e "${BOLD}Edge cases${NC}"
run_test "No mergeable tasks exits cleanly"               test_no_mergeable_tasks
run_test "Merge preserves git branch state"               test_merge_preserves_git_state

echo ""
printf '  '
printf '%0.s-' $(seq 1 56)
echo ""
echo -e "  Total:   $TOTAL"
echo -e "  ${GREEN}Passed:${NC}  $PASS"
if [[ $FAIL -gt 0 ]]; then
  echo -e "  ${RED}Failed:${NC}  $FAIL"
  echo ""
  echo -e "  ${RED}Failed tests:${NC}"
  for t in "${FAILED_TESTS[@]}"; do
    echo -e "    - $t"
  done
  echo ""
  exit 1
else
  echo -e "  Failed:  0"
  echo ""
  echo -e "  ${GREEN}All tests passed.${NC}"
fi
