#!/bin/bash
# Attempt to auto-resolve merge conflicts in a single file.
#
# Usage: ./scripts/coordination/resolve-conflict.sh <file> [OPTIONS]
#
# Options:
#   --dry-run     Show what would be resolved without modifying the file
#   --verbose     Print classification details for each conflict hunk
#
# Called during a git merge conflict state. The file must contain conflict
# markers (<<<<<<< / ======= / >>>>>>>). Attempts pure-bash resolution
# for common conflict patterns. Does NOT call AI/LLM — that would be a
# future enhancement.
#
# Exit codes:
#   0 — All conflict hunks resolved (file modified in place)
#   1 — One or more hunks could not be resolved (file written with partial
#        resolution: resolved hunks applied, escalated hunks keep markers)
#   2 — Error (bad args, file not found, no conflict markers)
#
# Resolution strategies (tried per-hunk, in order):
#   1. Identical changes: both sides made the same change → keep one
#   2. Import merging: both sides are import/require/use lines → keep all unique
#   3. One-side-empty: one side added content, other is unchanged → keep addition
#   4. Disjoint additions: both sides added different content → keep both
#   5. Escalate: hunk cannot be auto-resolved
#
# Reference: specs/coordination.md Goal D (Conflict Resolution)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
DIM='\033[2m'
NC='\033[0m'

# --- Argument parsing ---

FILE=""
DRY_RUN=false
VERBOSE=false

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)  DRY_RUN=true; shift ;;
    --verbose)  VERBOSE=true; shift ;;
    --help|-h)
      sed -n '/^# Attempt to auto-resolve/,/^[^#]/{/^[^#]/d; s/^# \{0,1\}//; p;}' "$0"
      exit 0
      ;;
    -*)
      echo -e "${RED}Unknown option: $1${NC}" >&2
      exit 2
      ;;
    *)
      FILE="$1"; shift ;;
  esac
done

if [ -z "$FILE" ]; then
  echo -e "${RED}Error: No file specified${NC}" >&2
  echo "Usage: $0 <file> [--dry-run] [--verbose]" >&2
  exit 2
fi

if [ ! -f "$FILE" ]; then
  echo -e "${RED}Error: File not found: $FILE${NC}" >&2
  exit 2
fi

# Check for conflict markers
if ! grep -q '^<<<<<<< ' "$FILE"; then
  echo -e "${RED}Error: No conflict markers found in $FILE${NC}" >&2
  exit 2
fi

# --- Helpers ---

log() {
  if [ "$VERBOSE" = true ]; then
    echo -e "$1" >&2
  fi
}

# Check if a line looks like an import statement
is_import_line() {
  local line="$1"
  # Skip empty/whitespace lines
  if echo "$line" | grep -qE '^\s*$'; then
    return 0  # empty lines are fine in import blocks
  fi
  # JavaScript/TypeScript imports
  echo "$line" | grep -qE '^\s*(import\s|export\s.*from\s|const\s+\w+\s*=\s*require\(|let\s+\w+\s*=\s*require\(|var\s+\w+\s*=\s*require\()' && return 0
  # Python imports
  echo "$line" | grep -qE '^\s*(import\s+\w|from\s+\w.+import\s)' && return 0
  # Rust use statements
  echo "$line" | grep -qE '^\s*use\s+' && return 0
  # Go imports (single line)
  echo "$line" | grep -qE '^\s*"[^"]*"\s*$' && return 0
  # Go import keyword
  echo "$line" | grep -qE '^\s*import\s' && return 0
  # Comment lines (allowed in import blocks)
  echo "$line" | grep -qE '^\s*(//|#|/\*)' && return 0
  return 1
}

# Check if ALL non-empty lines in a block are imports
block_is_imports() {
  local block="$1"
  if [ -z "$block" ]; then
    return 1  # empty block is NOT imports
  fi
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    if ! is_import_line "$line"; then
      return 1
    fi
  done <<< "$block"
  return 0
}

# Merge two import blocks: keep unique lines, preserve order (ours first)
merge_imports() {
  local ours="$1"
  local theirs="$2"
  local result=""

  # Start with all of ours
  result="$ours"

  # Add unique lines from theirs
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    # Skip if line already exists in ours (exact match)
    if ! echo "$ours" | grep -qFx "$line"; then
      result="$result
$line"
    fi
  done <<< "$theirs"

  echo "$result"
}

# Check if a line is trivial syntax (braces, empty, whitespace-only)
is_trivial_line() {
  local line="$1"
  # Empty or whitespace
  echo "$line" | grep -qE '^\s*$' && return 0
  # Strip whitespace and check if it's just punctuation
  local stripped
  stripped=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  case "$stripped" in
    "{"  | "}"  | "("  | ")"  | "["  | "]"  | ";"  | ","  ) return 0 ;;
    "};" | ");" | "}," | ")," | "{}" ) return 0 ;;
    "end" | "else" | "elif" | "fi" | "done" | "esac" | "then" | "do" ) return 0 ;;
  esac
  return 1
}

# Extract the "key" from a line (first identifier/word before : = ( etc.)
line_key() {
  local line="$1"
  # Strip leading whitespace, extract first word-like token
  echo "$line" | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*[:=(/].*//' | sed 's/[[:space:]]*$//'
}

# Check if two blocks are disjoint additions (no shared content or shared keys)
blocks_are_disjoint() {
  local ours="$1"
  local theirs="$2"

  # Collect non-trivial keys from theirs
  local theirs_keys=""
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    is_trivial_line "$line" && continue
    local key
    key=$(line_key "$line")
    [ -z "$key" ] && continue
    theirs_keys="${theirs_keys}${key}
"
  done <<< "$theirs"

  while IFS= read -r line; do
    [ -z "$line" ] && continue
    is_trivial_line "$line" && continue

    # Check exact line match
    if echo "$theirs" | grep -qFx "$line"; then
      return 1  # shared non-trivial line
    fi

    # Check if same key exists in theirs (e.g., "timeout: 5000" vs "timeout: 10000")
    local key
    key=$(line_key "$line")
    if [ -n "$key" ] && echo "$theirs_keys" | grep -qFx "$key"; then
      return 1  # same key modified differently
    fi
  done <<< "$ours"
  return 0
}

# --- Main: parse and resolve conflict hunks ---

# Read the file and process it hunk by hunk.
# We build the resolved output line by line.

RESOLVED_CONTENT=""
IN_CONFLICT=false
OURS_BLOCK=""
THEIRS_BLOCK=""
IN_OURS=false
IN_THEIRS=false
TOTAL_HUNKS=0
RESOLVED_HUNKS=0
ESCALATED_HUNKS=0
RESOLUTION_LOG=""

while IFS= read -r line || [ -n "$line" ]; do
  if echo "$line" | grep -qE '^<<<<<<< '; then
    # Start of conflict hunk
    IN_CONFLICT=true
    IN_OURS=true
    IN_THEIRS=false
    OURS_BLOCK=""
    THEIRS_BLOCK=""
    TOTAL_HUNKS=$((TOTAL_HUNKS + 1))
    continue
  fi

  if [ "$IN_CONFLICT" = true ] && echo "$line" | grep -qE '^======='; then
    # Switch from ours to theirs
    IN_OURS=false
    IN_THEIRS=true
    continue
  fi

  if echo "$line" | grep -qE '^>>>>>>> '; then
    # End of conflict hunk — attempt resolution
    IN_CONFLICT=false
    IN_OURS=false
    IN_THEIRS=false

    local_resolved=false
    local_strategy=""
    local_content=""

    # Strategy 1: Identical changes → keep one copy
    if [ "$OURS_BLOCK" = "$THEIRS_BLOCK" ]; then
      local_content="$OURS_BLOCK"
      local_resolved=true
      local_strategy="identical"
      log "  ${GREEN}Hunk $TOTAL_HUNKS: identical${NC} — both sides made the same change"
    fi

    # Strategy 2: Both sides are imports → merge unique imports
    if [ "$local_resolved" = false ] && block_is_imports "$OURS_BLOCK" && block_is_imports "$THEIRS_BLOCK"; then
      local_content=$(merge_imports "$OURS_BLOCK" "$THEIRS_BLOCK")
      local_resolved=true
      local_strategy="import_merge"
      log "  ${GREEN}Hunk $TOTAL_HUNKS: import_merge${NC} — merged unique import lines"
    fi

    # Strategy 3: One side is empty → keep the non-empty side
    if [ "$local_resolved" = false ]; then
      ours_trimmed=$(echo "$OURS_BLOCK" | sed '/^$/d')
      theirs_trimmed=$(echo "$THEIRS_BLOCK" | sed '/^$/d')

      if [ -z "$ours_trimmed" ] && [ -n "$theirs_trimmed" ]; then
        local_content="$THEIRS_BLOCK"
        local_resolved=true
        local_strategy="keep_theirs"
        log "  ${GREEN}Hunk $TOTAL_HUNKS: keep_theirs${NC} — ours empty, keeping theirs"
      elif [ -n "$ours_trimmed" ] && [ -z "$theirs_trimmed" ]; then
        local_content="$OURS_BLOCK"
        local_resolved=true
        local_strategy="keep_ours"
        log "  ${GREEN}Hunk $TOTAL_HUNKS: keep_ours${NC} — theirs empty, keeping ours"
      fi
    fi

    # Strategy 4: Disjoint additions → keep both (ours first, then theirs)
    if [ "$local_resolved" = false ]; then
      if blocks_are_disjoint "$OURS_BLOCK" "$THEIRS_BLOCK"; then
        local_content="$OURS_BLOCK
$THEIRS_BLOCK"
        local_resolved=true
        local_strategy="disjoint_merge"
        log "  ${GREEN}Hunk $TOTAL_HUNKS: disjoint_merge${NC} — both sides added different content"
      fi
    fi

    # Strategy 5: Escalate
    if [ "$local_resolved" = false ]; then
      local_strategy="escalated"
      ESCALATED_HUNKS=$((ESCALATED_HUNKS + 1))
      log "  ${RED}Hunk $TOTAL_HUNKS: escalated${NC} — overlapping modifications"
      # Put conflict markers back
      local_content="<<<<<<< HEAD
$OURS_BLOCK
=======
$THEIRS_BLOCK
>>>>>>> theirs"
    else
      RESOLVED_HUNKS=$((RESOLVED_HUNKS + 1))
    fi

    RESOLUTION_LOG="${RESOLUTION_LOG}hunk${TOTAL_HUNKS}:${local_strategy};"

    # Append resolved content
    if [ -z "$RESOLVED_CONTENT" ]; then
      RESOLVED_CONTENT="$local_content"
    else
      RESOLVED_CONTENT="$RESOLVED_CONTENT
$local_content"
    fi
    continue
  fi

  # Accumulate content
  if [ "$IN_OURS" = true ]; then
    if [ -z "$OURS_BLOCK" ]; then
      OURS_BLOCK="$line"
    else
      OURS_BLOCK="$OURS_BLOCK
$line"
    fi
  elif [ "$IN_THEIRS" = true ]; then
    if [ -z "$THEIRS_BLOCK" ]; then
      THEIRS_BLOCK="$line"
    else
      THEIRS_BLOCK="$THEIRS_BLOCK
$line"
    fi
  else
    # Normal line (outside conflict)
    if [ -z "$RESOLVED_CONTENT" ]; then
      RESOLVED_CONTENT="$line"
    else
      RESOLVED_CONTENT="$RESOLVED_CONTENT
$line"
    fi
  fi
done < "$FILE"

# --- Output results ---

if [ "$TOTAL_HUNKS" -eq 0 ]; then
  echo -e "${RED}Error: No conflict hunks found despite conflict markers${NC}" >&2
  exit 2
fi

# Print summary
echo -e "${DIM}File:${NC} $FILE" >&2
echo -e "${DIM}Hunks:${NC} $TOTAL_HUNKS total, ${GREEN}$RESOLVED_HUNKS resolved${NC}, ${RED}$ESCALATED_HUNKS escalated${NC}" >&2
echo -e "${DIM}Strategies:${NC} $RESOLUTION_LOG" >&2

if [ "$ESCALATED_HUNKS" -gt 0 ]; then
  # Some hunks couldn't be resolved
  if [ "$DRY_RUN" = false ]; then
    # Write partial resolution (resolved hunks applied, unresolved keep markers)
    echo "$RESOLVED_CONTENT" > "$FILE"
  fi
  exit 1
fi

# All hunks resolved
if [ "$DRY_RUN" = false ]; then
  echo "$RESOLVED_CONTENT" > "$FILE"
fi
echo -e "${GREEN}All $TOTAL_HUNKS hunks resolved.${NC}" >&2
exit 0
