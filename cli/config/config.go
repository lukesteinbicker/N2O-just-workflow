package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type GlobalConfig struct {
	FrameworkPath string `json:"framework_path,omitempty"`
	DeveloperName string `json:"developer_name,omitempty"`
	AutoSync      bool   `json:"auto_sync,omitempty"`
}

type DatabaseConfig struct {
	Type   string `json:"type,omitempty"`
	EnvVar string `json:"env_var,omitempty"`
}

type CommandsConfig struct {
	Test      string `json:"test,omitempty"`
	Typecheck string `json:"typecheck,omitempty"`
	Lint      string `json:"lint,omitempty"`
	Build     string `json:"build,omitempty"`
}

type ProjectConfig struct {
	N2OVersion       string         `json:"n2o_version,omitempty"`
	ProjectName      string         `json:"project_name,omitempty"`
	Commands         CommandsConfig `json:"commands,omitempty"`
	Database         DatabaseConfig `json:"database,omitempty"`
	PMTool           string         `json:"pm_tool,omitempty"`
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
