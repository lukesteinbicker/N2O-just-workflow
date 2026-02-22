#!/bin/bash
# N2O SessionStart Hook
# Fires when a Claude Code session starts. Handles:
#   1. Whether the engineer needs to git pull
#   2. Whether the framework was recently updated (shows changelog once)
#   3. Auto-claim next available task and create worktree (coordination mode)
#
# Configured in .claude/settings.json, receives JSON on stdin.
# Stdout is injected into Claude's context.

# Only run on fresh startups (not resume/compact/clear)
input=$(cat)
source=$(echo "$input" | jq -r '.source // ""' 2>/dev/null)
if [[ "$source" != "startup" ]]; then
  exit 0
fi

cwd=$(echo "$input" | jq -r '.cwd // ""' 2>/dev/null)
if [[ -z "$cwd" ]]; then
  exit 0
fi
cd "$cwd" 2>/dev/null || exit 0

# Skip if not an N2O project
if [[ ! -f ".pm/config.json" ]]; then
  exit 0
fi

output=""

# --- Step 1: Git pull reminder (local-only, no network call) ---
if command -v git &>/dev/null && git rev-parse --git-dir &>/dev/null 2>&1; then
  # Detect default remote branch
  default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')
  if [[ -z "$default_branch" ]]; then
    default_branch="main"
  fi

  behind=$(git rev-list "HEAD..origin/$default_branch" --count 2>/dev/null || echo "0")
  if [[ "$behind" -gt 0 ]]; then
    output="${output}Your branch is ${behind} commit(s) behind origin/${default_branch}. Run \`git pull\` to get the latest updates.\n\n"
  fi
fi

# --- Step 2: Framework update notification (show once per version) ---
current_version=$(jq -r '.n2o_version // ""' .pm/config.json 2>/dev/null)
last_seen=$(cat .pm/.last_seen_version 2>/dev/null || echo "")

if [[ -n "$current_version" && "$current_version" != "$last_seen" ]]; then
  # Build notification
  notification="N2O framework updated to v${current_version}."

  # Parse CHANGELOG.md for entries for this version
  if [[ -f "CHANGELOG.md" ]]; then
    changelog_entries=""
    in_version=false
    while IFS= read -r line; do
      if [[ "$line" =~ ^##[[:space:]]+([0-9]+\.[0-9]+\.[0-9]+) ]]; then
        ver="${BASH_REMATCH[1]}"
        if [[ "$ver" == "$current_version" ]]; then
          in_version=true
          continue
        else
          if $in_version; then
            break
          fi
        fi
      fi
      if $in_version && [[ -n "$line" ]] && [[ ! "$line" =~ ^# ]]; then
        changelog_entries="${changelog_entries}  ${line}\n"
      fi
    done < "CHANGELOG.md"

    if [[ -n "$changelog_entries" ]]; then
      notification="${notification}\n${changelog_entries}"
    fi
  fi

  output="${output}${notification}"

  # Mark as seen so it only shows once
  echo "$current_version" > .pm/.last_seen_version 2>/dev/null || true
fi

# --- Step 3: Auto-claim task (coordination mode) ---
# If tasks.db exists and has available tasks, claim one and set up a worktree.
# The claim-task.sh script handles atomic claiming and worktree creation.
# Its JSON output is parsed here to produce context for Claude.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAIM_SCRIPT="$SCRIPT_DIR/coordination/claim-task.sh"

if [[ -f ".pm/tasks.db" && -x "$CLAIM_SCRIPT" ]]; then
  # Check if there are any available tasks before attempting claim
  available_count=$(sqlite3 .pm/tasks.db "SELECT COUNT(*) FROM available_tasks;" 2>/dev/null || echo "0")

  if [[ "$available_count" -gt 0 ]]; then
    # Attempt to claim — claim-task.sh outputs JSON on stdout, logs to stderr
    claim_json=$(bash "$CLAIM_SCRIPT" --session-id "${SESSION_ID:-unknown}" 2>/dev/null) || true

    if [[ -n "$claim_json" ]]; then
      # Parse the claim result
      task_title=$(echo "$claim_json" | jq -r '.title // ""' 2>/dev/null)
      task_sprint=$(echo "$claim_json" | jq -r '.sprint // ""' 2>/dev/null)
      task_num=$(echo "$claim_json" | jq -r '.task_num // ""' 2>/dev/null)
      task_desc=$(echo "$claim_json" | jq -r '.description // ""' 2>/dev/null)
      task_done_when=$(echo "$claim_json" | jq -r '.done_when // ""' 2>/dev/null)
      task_skills=$(echo "$claim_json" | jq -r '.skills // ""' 2>/dev/null)
      task_type=$(echo "$claim_json" | jq -r '.type // ""' 2>/dev/null)
      worktree_path=$(echo "$claim_json" | jq -r '.worktree_path // ""' 2>/dev/null)
      branch=$(echo "$claim_json" | jq -r '.branch // ""' 2>/dev/null)
      agent_id=$(echo "$claim_json" | jq -r '.agent_id // ""' 2>/dev/null)

      if [[ -n "$task_title" ]]; then
        output="${output}\n--- TASK AUTO-CLAIMED ---\n"
        output="${output}Agent: ${agent_id}\n"
        output="${output}Task: ${task_sprint}#${task_num} — ${task_title}\n"
        output="${output}Type: ${task_type}\n"
        output="${output}Branch: ${branch}\n"
        output="${output}Worktree: ${worktree_path}\n"
        if [[ -n "$task_desc" ]]; then
          output="${output}\nDescription:\n${task_desc}\n"
        fi
        if [[ -n "$task_done_when" ]]; then
          output="${output}\nDone when:\n${task_done_when}\n"
        fi
        if [[ -n "$task_skills" ]]; then
          output="${output}\nSkills to invoke: ${task_skills}\n"
        fi
        output="${output}\nYour working directory is: ${worktree_path}\n"
        output="${output}Begin implementation using /tdd-agent.\n"
        output="${output}--- END TASK ---\n"
      fi
    fi
  fi
fi

# Print output if we have any
if [[ -n "$output" ]]; then
  echo -e "$output"
fi
