package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type GlobalConfig struct {
	DeveloperName string `json:"developer_name,omitempty"`
}

type CommandsConfig struct {
	Test      string `json:"test,omitempty"`
	Typecheck string `json:"typecheck,omitempty"`
	Lint      string `json:"lint,omitempty"`
	Build     string `json:"build,omitempty"`
}

type LinearConfig struct {
	TeamID       string            `json:"team_id,omitempty"`
	TeamKey      string            `json:"team_key,omitempty"` // e.g. "ENG"
	TeamName     string            `json:"team_name,omitempty"`
	ProjectID    string            `json:"project_id,omitempty"`
	ProjectName  string            `json:"project_name,omitempty"`
	ActiveCycle     string            `json:"active_cycle,omitempty"`
	ActiveMilestone string            `json:"active_milestone,omitempty"` // Linear ProjectMilestone ID
	StateMapping    map[string]string `json:"state_mapping,omitempty"`    // "In Progress" -> state UUID
}

type ProjectConfig struct {
	N2OVersion       string         `json:"n2o_version,omitempty"`
	ProjectName      string         `json:"project_name,omitempty"`
	AITool           string         `json:"ai_tool,omitempty"`
	Linear           *LinearConfig  `json:"linear,omitempty"`
	Commands         CommandsConfig `json:"commands,omitempty"`
	Team             []string       `json:"team,omitempty"`
	ClaimTasks       bool           `json:"claim_tasks,omitempty"`
	AutoInvokeSkills bool           `json:"auto_invoke_skills,omitempty"`
	DisabledSkills   []string       `json:"disabled_skills,omitempty"`
}

func globalConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".n2o", "config.json"), nil
}

func LoadGlobal() (*GlobalConfig, error) {
	p, err := globalConfigPath()
	if err != nil {
		return nil, err
	}
	return loadJSON[GlobalConfig](p)
}

func SaveGlobal(cfg *GlobalConfig) error {
	p, err := globalConfigPath()
	if err != nil {
		return err
	}
	return saveJSON(p, cfg)
}

func LoadProject(projectPath string) (*ProjectConfig, error) {
	p := filepath.Join(projectPath, ".pm", "config.json")
	return loadJSON[ProjectConfig](p)
}

func SaveProject(projectPath string, cfg *ProjectConfig) error {
	p := filepath.Join(projectPath, ".pm", "config.json")
	return saveJSON(p, cfg)
}

func loadJSON[T any](path string) (*T, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg T
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func saveJSON(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}
