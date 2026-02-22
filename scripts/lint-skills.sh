#!/bin/bash
set -euo pipefail

# =============================================================================
# lint-skills.sh — Validate SKILL.md files have required phase-transition markers
#
# Usage:
#   bash scripts/lint-skills.sh              # Check all skills
#   bash scripts/lint-skills.sh tdd-agent    # Check specific skill
#   bash scripts/lint-skills.sh --list       # List all known skills
#
# Exit codes:
#   0 — All checks passed
#   1 — One or more markers missing
#
# Compatible with bash 3.2+ (macOS default)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
N2O_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Counters
TOTAL_SKILLS=0
PASSED_SKILLS=0
FAILED_SKILLS=0

# =============================================================================
# Manifest: required phases per skill
#
# Stored as parallel arrays for bash 3.2 compatibility (no associative arrays).
# =============================================================================

SKILL_NAMES=(    "tdd-agent"                           "pm-agent"                                                                                        "bug-workflow")
SKILL_FILES=(    "02-agents/tdd-agent/SKILL.md"        "02-agents/pm-agent/SKILL.md"                                                                     "02-agents/bug-workflow/SKILL.md")
SKILL_PHASES=(   "RED GREEN REFACTOR AUDIT FIX_AUDIT CODIFY COMMIT REPORT" \
                 "IDEATION AUDIT_CODE REFINEMENT PRE_TASK_CHECKLIST SPRINT_PLANNING POST_LOAD_AUDIT START_IMPLEMENTATION" \
                 "REPRODUCE INVESTIGATE SCOPE HYPOTHESIS TASK")
SKILL_EVENTS=(   "task_completed"                      ""                                                                                                "")

# =============================================================================
# Helpers
# =============================================================================

print_header() {
  echo ""
  echo -e "${BOLD}$1${NC}"
  printf '  '
  printf '%0.s-' $(seq 1 56)
  echo ""
}

print_result() {
  local status="$1"
  local label="$2"
  if [ "$status" = "pass" ]; then
    echo -e "  ${GREEN}PASS${NC}  $label"
  elif [ "$status" = "fail" ]; then
    echo -e "  ${RED}FAIL${NC}  $label"
  elif [ "$status" = "warn" ]; then
    echo -e "  ${YELLOW}WARN${NC}  $label"
  fi
}

# Find array index for a skill name. Returns -1 if not found.
find_skill_index() {
  local name="$1"
  local i=0
  while [ $i -lt ${#SKILL_NAMES[@]} ]; do
    if [ "${SKILL_NAMES[$i]}" = "$name" ]; then
      echo "$i"
      return 0
    fi
    i=$((i + 1))
  done
  echo "-1"
  return 1
}

# =============================================================================
# Lint a single skill by index
# =============================================================================

lint_skill() {
  local idx="$1"
  local skill_name="${SKILL_NAMES[$idx]}"
  local skill_file="${SKILL_FILES[$idx]}"
  local phases="${SKILL_PHASES[$idx]}"
  local events="${SKILL_EVENTS[$idx]}"
  local full_path="$N2O_ROOT/$skill_file"

  local missing=0
  local present=0

  print_header "$skill_name  ($skill_file)"

  # Check file exists
  if [ ! -f "$full_path" ]; then
    print_result "fail" "SKILL.md not found at $skill_file"
    FAILED_SKILLS=$((FAILED_SKILLS + 1))
    TOTAL_SKILLS=$((TOTAL_SKILLS + 1))
    return 1
  fi

  # Check each required phase marker
  for phase in $phases; do
    # Pattern: INSERT INTO workflow_events ... phase_entered ... PHASE_NAME
    if grep -q "INSERT INTO workflow_events.*phase_entered.*'${phase}'" "$full_path" 2>/dev/null; then
      print_result "pass" "phase_entered: $phase"
      present=$((present + 1))
    else
      print_result "fail" "phase_entered: $phase  (missing INSERT INTO workflow_events)"
      missing=$((missing + 1))
    fi
  done

  # Check each required event type
  if [ -n "$events" ]; then
    for event in $events; do
      if grep -q "INSERT INTO workflow_events.*'${event}'" "$full_path" 2>/dev/null; then
        print_result "pass" "event: $event"
        present=$((present + 1))
      else
        print_result "fail" "event: $event  (missing INSERT INTO workflow_events)"
        missing=$((missing + 1))
      fi
    done
  fi

  # Skill result
  echo ""
  if [ "$missing" -eq 0 ]; then
    echo -e "  ${GREEN}All $present markers present.${NC}"
    PASSED_SKILLS=$((PASSED_SKILLS + 1))
  else
    echo -e "  ${RED}$missing missing${NC}, $present present."
    FAILED_SKILLS=$((FAILED_SKILLS + 1))
  fi

  TOTAL_SKILLS=$((TOTAL_SKILLS + 1))

  if [ "$missing" -gt 0 ]; then
    return 1
  fi
  return 0
}

# =============================================================================
# Main
# =============================================================================

main() {
  local target="${1:-all}"

  echo -e "${BOLD}N2O Skill Linter${NC}"
  echo -e "${DIM}Validating phase-transition markers in SKILL.md files${NC}"

  # Handle --list flag
  if [ "$target" = "--list" ]; then
    echo ""
    echo "Known skills:"
    local i=0
    while [ $i -lt ${#SKILL_NAMES[@]} ]; do
      echo "  ${SKILL_NAMES[$i]}  (${SKILL_FILES[$i]})"
      i=$((i + 1))
    done
    exit 0
  fi

  local exit_code=0

  if [ "$target" = "all" ]; then
    # Check all skills
    local i=0
    while [ $i -lt ${#SKILL_NAMES[@]} ]; do
      lint_skill "$i" || exit_code=1
      i=$((i + 1))
    done
  else
    # Check a specific skill
    local idx
    idx="$(find_skill_index "$target")" || true
    if [ "$idx" = "-1" ]; then
      echo -e "${RED}Unknown skill: $target${NC}"
      echo -n "Known skills:"
      local i=0
      while [ $i -lt ${#SKILL_NAMES[@]} ]; do
        echo -n " ${SKILL_NAMES[$i]}"
        i=$((i + 1))
      done
      echo ""
      exit 1
    fi
    lint_skill "$idx" || exit_code=1
  fi

  # Summary
  print_header "Summary"
  echo -e "  Skills checked:  $TOTAL_SKILLS"
  echo -e "  ${GREEN}Passed:${NC}         $PASSED_SKILLS"
  if [ "$FAILED_SKILLS" -gt 0 ]; then
    echo -e "  ${RED}Failed:${NC}         $FAILED_SKILLS"
  else
    echo -e "  Failed:         0"
  fi
  echo ""

  if [ "$exit_code" -eq 0 ] && [ "$FAILED_SKILLS" -eq 0 ]; then
    echo -e "${GREEN}All checks passed.${NC}"
  else
    echo -e "${RED}Some checks failed. Add missing workflow_events INSERTs to the SKILL.md files listed above.${NC}"
    exit_code=1
  fi

  exit "$exit_code"
}

main "$@"
