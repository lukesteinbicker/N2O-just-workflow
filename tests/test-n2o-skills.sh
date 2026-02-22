#!/bin/bash
set -uo pipefail

# =============================================================================
# Tests for: N2O skill definitions (YAML frontmatter, trigger descriptions)
# Pure bash — no external test frameworks required.
# Usage: bash tests/test-n2o-skills.sh
# =============================================================================

N2O_DIR="$(cd "$(dirname "$0")/.." && pwd)"
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

CURRENT_TEST=""

run_test() {
  local name="$1"
  local func="$2"
  CURRENT_TEST="$name"
  ((TOTAL++)) || true

  local result=0
  local err_file
  err_file=$(mktemp)

  if $func 2>"$err_file"; then
    echo -e "  ${GREEN}PASS${NC}  $name"
    ((PASS++)) || true
  else
    echo -e "  ${RED}FAIL${NC}  $name"
    local err_output
    err_output=$(cat "$err_file")
    if [[ -n "$err_output" ]]; then
      echo "$err_output" | while IFS= read -r line; do
        echo -e "        $line"
      done
    fi
    ((FAIL++)) || true
    FAILED_TESTS+=("$name")
  fi

  rm -f "$err_file"
}

assert_file_contains() {
  local path="$1"
  local pattern="$2"
  local msg="${3:-File $(basename "$path") should contain: $pattern}"
  if ! grep -qF "$pattern" "$path" 2>/dev/null; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

assert_file_matches() {
  local path="$1"
  local regex="$2"
  local msg="${3:-File $(basename "$path") should match regex: $regex}"
  if ! grep -qE "$regex" "$path" 2>/dev/null; then
    echo "    ASSERT FAILED: $msg" >&2
    return 1
  fi
}

# Extract YAML description field from a SKILL.md file
get_skill_description() {
  local skill_file="$1"
  # Extract the description line directly (it's always near the top)
  local raw
  raw=$(grep '^description:' "$skill_file" | head -1)
  # Strip prefix and surrounding quotes
  raw="${raw#description: }"
  raw="${raw#\"}"
  raw="${raw%\"}"
  echo "$raw"
}

# All 6 skill files
SKILL_FILES=(
  "$N2O_DIR/02-agents/pm-agent/SKILL.md"
  "$N2O_DIR/02-agents/tdd-agent/SKILL.md"
  "$N2O_DIR/02-agents/bug-workflow/SKILL.md"
  "$N2O_DIR/02-agents/detect-project/SKILL.md"
  "$N2O_DIR/03-patterns/react-best-practices/SKILL.md"
  "$N2O_DIR/03-patterns/web-design-guidelines/SKILL.md"
)

SKILL_NAMES=(
  "pm-agent"
  "tdd-agent"
  "bug-workflow"
  "detect-project"
  "react-best-practices"
  "web-design-guidelines"
)

PATTERN_SKILLS=(
  "$N2O_DIR/03-patterns/react-best-practices/SKILL.md"
  "$N2O_DIR/03-patterns/web-design-guidelines/SKILL.md"
)

# =============================================================================
# Task 1: YAML frontmatter quality tests
# =============================================================================

test_all_skills_have_yaml_frontmatter() {
  for skill_file in "${SKILL_FILES[@]}"; do
    local skill_name
    skill_name=$(basename "$(dirname "$skill_file")")
    # Check file starts with ---
    local first_line
    first_line=$(head -1 "$skill_file")
    if [[ "$first_line" != "---" ]]; then
      echo "    ASSERT FAILED: $skill_name/SKILL.md missing YAML frontmatter (no opening ---)" >&2
      return 1
    fi
    # Check has closing --- (line 2+ must contain ---)
    local closing
    closing=$(grep -n '^---$' "$skill_file" | sed -n '2p')
    if [[ -z "$closing" ]]; then
      echo "    ASSERT FAILED: $skill_name/SKILL.md missing closing --- in frontmatter" >&2
      return 1
    fi
  done
}

test_all_skills_have_name_field() {
  for skill_file in "${SKILL_FILES[@]}"; do
    local skill_name
    skill_name=$(basename "$(dirname "$skill_file")")
    if ! grep -q '^name:' "$skill_file"; then
      echo "    ASSERT FAILED: $skill_name/SKILL.md missing 'name:' in frontmatter" >&2
      return 1
    fi
  done
}

test_all_skills_have_description_field() {
  for skill_file in "${SKILL_FILES[@]}"; do
    local skill_name
    skill_name=$(basename "$(dirname "$skill_file")")
    if ! grep -q '^description:' "$skill_file"; then
      echo "    ASSERT FAILED: $skill_name/SKILL.md missing 'description:' in frontmatter" >&2
      return 1
    fi
  done
}

test_descriptions_have_trigger_phrases() {
  # Every skill description should contain trigger-related language
  for i in "${!SKILL_FILES[@]}"; do
    local skill_file="${SKILL_FILES[$i]}"
    local skill_name="${SKILL_NAMES[$i]}"
    local desc
    desc=$(get_skill_description "$skill_file")
    local desc_lower
    desc_lower=$(echo "$desc" | tr '[:upper:]' '[:lower:]')

    # Description should contain at least one of: "triggers:", "trigger", "use when", "invoke when", "use this"
    if [[ "$desc_lower" != *"trigger"* ]] && [[ "$desc_lower" != *"use when"* ]] && [[ "$desc_lower" != *"use this"* ]] && [[ "$desc_lower" != *"should be used when"* ]] && [[ "$desc_lower" != *"invoke when"* ]]; then
      echo "    ASSERT FAILED: $skill_name description lacks trigger language (no 'Triggers:', 'Use when', etc.)" >&2
      return 1
    fi
  done
}

test_descriptions_minimum_length() {
  # Descriptions should be substantive (at least 80 chars)
  for i in "${!SKILL_FILES[@]}"; do
    local skill_file="${SKILL_FILES[$i]}"
    local skill_name="${SKILL_NAMES[$i]}"
    local desc
    desc=$(get_skill_description "$skill_file")
    local len=${#desc}

    if [[ "$len" -lt 80 ]]; then
      echo "    ASSERT FAILED: $skill_name description too short ($len chars, minimum 80)" >&2
      return 1
    fi
  done
}

test_agent_skills_have_contextual_triggers() {
  # Agent skills (pm-agent, tdd-agent, bug-workflow) should have contextual triggers
  # beyond just keyword matching — things the user would naturally say
  local agent_files=(
    "$N2O_DIR/02-agents/pm-agent/SKILL.md"
    "$N2O_DIR/02-agents/tdd-agent/SKILL.md"
    "$N2O_DIR/02-agents/bug-workflow/SKILL.md"
  )
  local agent_names=("pm-agent" "tdd-agent" "bug-workflow")

  for i in "${!agent_files[@]}"; do
    local desc
    desc=$(get_skill_description "${agent_files[$i]}")

    # Should have multiple trigger phrases — count commas as a proxy
    local comma_count
    comma_count=$(echo "$desc" | tr -cd ',' | wc -c | tr -d ' ')
    if [[ "$comma_count" -lt 3 ]]; then
      echo "    ASSERT FAILED: ${agent_names[$i]} description has too few trigger phrases ($comma_count commas, need at least 3)" >&2
      return 1
    fi
  done
}

test_pattern_skills_have_ambient_language() {
  # Pattern skills should signal passive/ambient use
  for skill_file in "${PATTERN_SKILLS[@]}"; do
    local skill_name
    skill_name=$(basename "$(dirname "$skill_file")")
    local desc
    desc=$(get_skill_description "$skill_file")
    local desc_lower
    desc_lower=$(echo "$desc" | tr '[:upper:]' '[:lower:]')

    # Should contain ambient/passive language
    if [[ "$desc_lower" != *"consult"* ]] && [[ "$desc_lower" != *"review"* ]] && [[ "$desc_lower" != *"check"* ]] && [[ "$desc_lower" != *"guide"* ]] && [[ "$desc_lower" != *"ensure"* ]] && [[ "$desc_lower" != *"always"* ]] && [[ "$desc_lower" != *"writing"* ]] && [[ "$desc_lower" != *"refactoring"* ]] && [[ "$desc_lower" != *"automatically"* ]]; then
      echo "    ASSERT FAILED: $skill_name description lacks ambient/passive language" >&2
      return 1
    fi
  done
}

test_lint_skills_still_passes() {
  # The existing lint-skills.sh should still pass after our changes
  if ! bash "$N2O_DIR/scripts/lint-skills.sh" >/dev/null 2>&1; then
    echo "    ASSERT FAILED: scripts/lint-skills.sh no longer passes" >&2
    return 1
  fi
}

# =============================================================================
# Task 2: CLAUDE.md template & config tests
# =============================================================================

TEST_DIR=""

setup() {
  TEST_DIR=$(mktemp -d)
}

teardown() {
  if [[ -n "$TEST_DIR" && -d "$TEST_DIR" ]]; then
    rm -rf "$TEST_DIR"
  fi
  TEST_DIR=""
}

# Wrap run_test with setup/teardown for Task 2 tests that need temp dirs
run_test_with_setup() {
  local name="$1"
  local func="$2"
  CURRENT_TEST="$name"
  ((TOTAL++)) || true

  setup
  local err_file
  err_file=$(mktemp)

  if $func 2>"$err_file"; then
    echo -e "  ${GREEN}PASS${NC}  $name"
    ((PASS++)) || true
  else
    echo -e "  ${RED}FAIL${NC}  $name"
    local err_output
    err_output=$(cat "$err_file")
    if [[ -n "$err_output" ]]; then
      echo "$err_output" | while IFS= read -r line; do
        echo -e "        $line"
      done
    fi
    ((FAIL++)) || true
    FAILED_TESTS+=("$name")
  fi

  rm -f "$err_file"
  teardown
}

test_config_template_has_auto_invoke_skills() {
  # templates/config.json should have auto_invoke_skills field
  local val
  val=$(jq -r '.auto_invoke_skills' "$N2O_DIR/templates/config.json" 2>/dev/null)
  if [[ "$val" != "true" ]]; then
    echo "    ASSERT FAILED: templates/config.json missing auto_invoke_skills: true (got: $val)" >&2
    return 1
  fi
}

test_config_template_has_disabled_skills() {
  # templates/config.json should have disabled_skills field (empty array)
  local val
  val=$(jq -r '.disabled_skills | length' "$N2O_DIR/templates/config.json" 2>/dev/null)
  if [[ "$val" != "0" ]]; then
    echo "    ASSERT FAILED: templates/config.json disabled_skills should be empty array (length: $val)" >&2
    return 1
  fi
  # Verify it's actually an array
  local type
  type=$(jq -r '.disabled_skills | type' "$N2O_DIR/templates/config.json" 2>/dev/null)
  if [[ "$type" != "array" ]]; then
    echo "    ASSERT FAILED: templates/config.json disabled_skills should be an array (type: $type)" >&2
    return 1
  fi
}

test_claude_template_has_auto_invocation_instruction() {
  # templates/CLAUDE.md should have an agent instruction about auto-invocation
  if ! grep -q 'auto.invoc' "$N2O_DIR/templates/CLAUDE.md" 2>/dev/null && ! grep -q 'auto_invoke' "$N2O_DIR/templates/CLAUDE.md" 2>/dev/null; then
    echo "    ASSERT FAILED: templates/CLAUDE.md missing auto-invocation agent instruction" >&2
    return 1
  fi
}

test_claude_template_mentions_pattern_skills_ambient() {
  # templates/CLAUDE.md should describe pattern skills as ambient/passive
  local content
  content=$(cat "$N2O_DIR/templates/CLAUDE.md")
  local content_lower
  content_lower=$(echo "$content" | tr '[:upper:]' '[:lower:]')
  if [[ "$content_lower" != *"ambient"* ]] && [[ "$content_lower" != *"passive"* ]] && [[ "$content_lower" != *"automatically consult"* ]]; then
    echo "    ASSERT FAILED: templates/CLAUDE.md should describe pattern skills as ambient/passive" >&2
    return 1
  fi
}

test_claude_template_references_config() {
  # templates/CLAUDE.md should reference .pm/config.json for auto-invocation control
  if ! grep -q 'config.json' "$N2O_DIR/templates/CLAUDE.md" 2>/dev/null; then
    echo "    ASSERT FAILED: templates/CLAUDE.md should reference config.json for auto-invocation control" >&2
    return 1
  fi
}

test_claude_template_keeps_detect_project_instruction() {
  # The existing detect-project UNFILLED instruction should still be there
  if ! grep -q 'UNFILLED' "$N2O_DIR/templates/CLAUDE.md" 2>/dev/null; then
    echo "    ASSERT FAILED: templates/CLAUDE.md should still have UNFILLED markers for detect-project" >&2
    return 1
  fi
}

test_init_scaffolds_auto_invoke_config() {
  # n2o init should create config.json with auto_invoke_skills field
  "$N2O_DIR/n2o" init "$TEST_DIR" </dev/null >/dev/null 2>&1 || true

  if [[ ! -f "$TEST_DIR/.pm/config.json" ]]; then
    echo "    ASSERT FAILED: n2o init did not create .pm/config.json" >&2
    return 1
  fi

  local val
  val=$(jq -r '.auto_invoke_skills' "$TEST_DIR/.pm/config.json" 2>/dev/null)
  if [[ "$val" != "true" ]]; then
    echo "    ASSERT FAILED: scaffolded config.json missing auto_invoke_skills: true (got: $val)" >&2
    return 1
  fi

  local disabled
  disabled=$(jq -r '.disabled_skills | type' "$TEST_DIR/.pm/config.json" 2>/dev/null)
  if [[ "$disabled" != "array" ]]; then
    echo "    ASSERT FAILED: scaffolded config.json missing disabled_skills array (got: $disabled)" >&2
    return 1
  fi
}

test_init_scaffolds_claude_md_with_auto_invocation() {
  # n2o init should create CLAUDE.md with auto-invocation instructions
  "$N2O_DIR/n2o" init "$TEST_DIR" </dev/null >/dev/null 2>&1 || true

  if [[ ! -f "$TEST_DIR/CLAUDE.md" ]]; then
    echo "    ASSERT FAILED: n2o init did not create CLAUDE.md" >&2
    return 1
  fi

  if ! grep -q 'auto.invoc' "$TEST_DIR/CLAUDE.md" 2>/dev/null && ! grep -q 'auto_invoke' "$TEST_DIR/CLAUDE.md" 2>/dev/null; then
    echo "    ASSERT FAILED: scaffolded CLAUDE.md missing auto-invocation instruction" >&2
    return 1
  fi
}

# =============================================================================
# Run tests
# =============================================================================

echo ""
echo -e "${BOLD}N2O Skills — Tests${NC}"
echo -e "${BOLD}==================${NC}"

echo ""
echo -e "${BOLD}Task 1: YAML frontmatter & trigger descriptions${NC}"
run_test "All 6 skills have YAML frontmatter"                    test_all_skills_have_yaml_frontmatter
run_test "All skills have 'name' field"                          test_all_skills_have_name_field
run_test "All skills have 'description' field"                   test_all_skills_have_description_field
run_test "All descriptions contain trigger phrases"              test_descriptions_have_trigger_phrases
run_test "All descriptions are substantive (80+ chars)"          test_descriptions_minimum_length
run_test "Agent skills have contextual triggers"                 test_agent_skills_have_contextual_triggers
run_test "Pattern skills have ambient/passive language"          test_pattern_skills_have_ambient_language
run_test "lint-skills.sh still passes"                           test_lint_skills_still_passes

echo ""
echo -e "${BOLD}Task 2: CLAUDE.md template & config${NC}"
run_test "Config template has auto_invoke_skills: true"          test_config_template_has_auto_invoke_skills
run_test "Config template has disabled_skills: []"               test_config_template_has_disabled_skills
run_test "CLAUDE.md template has auto-invocation instruction"    test_claude_template_has_auto_invocation_instruction
run_test "CLAUDE.md template describes pattern skills as ambient" test_claude_template_mentions_pattern_skills_ambient
run_test "CLAUDE.md template references config.json"             test_claude_template_references_config
run_test "CLAUDE.md template keeps detect-project instruction"   test_claude_template_keeps_detect_project_instruction
run_test_with_setup "n2o init scaffolds auto_invoke_skills config" test_init_scaffolds_auto_invoke_config
run_test_with_setup "n2o init scaffolds CLAUDE.md with auto-invocation" test_init_scaffolds_claude_md_with_auto_invocation

# =============================================================================
# Summary
# =============================================================================

echo ""
echo -e "${BOLD}Results: $PASS passed, $FAIL failed, $TOTAL total${NC}"

if [[ ${#FAILED_TESTS[@]} -gt 0 ]]; then
  echo ""
  echo -e "${RED}Failed tests:${NC}"
  for t in "${FAILED_TESTS[@]}"; do
    echo -e "  - $t"
  done
  echo ""
  exit 1
fi

echo ""
echo -e "${GREEN}All tests passed.${NC}"
