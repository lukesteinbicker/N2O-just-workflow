package adapter

// ClaudeCode implements Adapter for Claude Code.
type ClaudeCode struct{}

func (ClaudeCode) Name() string              { return "claudecode" }
func (ClaudeCode) Label() string             { return "Claude Code" }
func (ClaudeCode) SkillsDir() string         { return ".claude/skills" }
func (ClaudeCode) SkillsPathPrefix() string  { return ".claude/skills/" }
func (ClaudeCode) CommitTrailer() string     { return "Assisted-by: Claude Code" }
func (ClaudeCode) SkillManifestName() string { return "SKILL.md" }
