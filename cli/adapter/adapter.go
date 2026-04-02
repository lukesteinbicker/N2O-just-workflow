package adapter

import "fmt"

// Adapter abstracts AI tool-specific behavior so the CLI
// isn't hardcoded to a single tool (e.g. Claude Code).
type Adapter interface {
	Name() string              // e.g. "claudecode"
	Label() string             // human-readable, e.g. "Claude Code"
	SkillsDir() string         // relative path, e.g. ".claude/skills"
	SkillsPathPrefix() string  // for sync filtering, e.g. ".claude/skills/"
	CommitTrailer() string     // e.g. "Assisted-by: Claude Code"
	SkillManifestName() string // e.g. "SKILL.md"
}

// All returns every registered adapter.
func All() []Adapter {
	return []Adapter{
		ClaudeCode{},
	}
}

// Get returns the adapter with the given name, or an error if not found.
func Get(name string) (Adapter, error) {
	for _, a := range All() {
		if a.Name() == name {
			return a, nil
		}
	}
	return nil, fmt.Errorf("unknown AI tool: %q", name)
}
