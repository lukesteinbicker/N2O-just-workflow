package adapter

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// ClaudeCode implements Adapter for Claude Code.
type ClaudeCode struct{}

func (ClaudeCode) Name() string               { return "claudecode" }
func (ClaudeCode) Label() string              { return "Claude Code" }
func (ClaudeCode) SkillsDir() string          { return ".claude/skills" }
func (ClaudeCode) SkillsPathPrefix() string   { return ".claude/skills/" }
func (ClaudeCode) CommitTrailer() string      { return "Assisted-by: Claude Code" }
func (ClaudeCode) SkillManifestName() string  { return "SKILL.md" }

// claudeCodeAllowlist is the set of Bash command patterns that n2o injects
// into .claude/settings.json so agents can run them without approval prompts.
var claudeCodeAllowlist = []string{
	"Bash(n2o task list*)",
	"Bash(n2o task available*)",
	"Bash(n2o task claim *)",
	"Bash(n2o task status *)",
	"Bash(n2o task block *)",
	"Bash(n2o task unblock *)",
	"Bash(n2o task commit *)",
	"Bash(n2o task create *)",
	"Bash(n2o task dep *)",
	"Bash(n2o task verify *)",
	"Bash(n2o sprint create *)",
	"Bash(n2o sprint archive *)",
}

// WritePermissions merges the n2o allowlist into .claude/settings.json,
// preserving any existing user entries. Destructive commands (login, sync)
// are intentionally excluded.
func (ClaudeCode) WritePermissions(projectPath string) error {
	settingsPath := filepath.Join(projectPath, ".claude", "settings.json")

	var settings map[string]any
	if data, err := os.ReadFile(settingsPath); err == nil {
		if err := json.Unmarshal(data, &settings); err != nil {
			return fmt.Errorf("parsing %s: %w", settingsPath, err)
		}
	}
	if settings == nil {
		settings = map[string]any{}
	}

	perms, _ := settings["permissions"].(map[string]any)
	if perms == nil {
		perms = map[string]any{}
	}

	existing, _ := perms["allow"].([]any)
	seen := make(map[string]bool, len(existing))
	for _, v := range existing {
		if s, ok := v.(string); ok {
			seen[s] = true
		}
	}

	merged := append([]any{}, existing...)
	for _, rule := range claudeCodeAllowlist {
		if !seen[rule] {
			merged = append(merged, rule)
			seen[rule] = true
		}
	}

	perms["allow"] = merged
	settings["permissions"] = perms

	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		return fmt.Errorf("create .claude dir: %w", err)
	}

	out, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(settingsPath, append(out, '\n'), 0o644)
}
