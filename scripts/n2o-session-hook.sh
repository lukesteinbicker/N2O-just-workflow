#!/bin/bash
# N2O SessionStart Hook
# Fires when a Claude Code session starts. Checks:
#   1. Whether the engineer needs to git pull
#   2. Whether the framework was recently updated (shows changelog once)
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

# Print output if we have any
if [[ -n "$output" ]]; then
  echo -e "$output"
fi
