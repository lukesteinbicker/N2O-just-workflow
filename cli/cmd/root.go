package cmd

import (
	"fmt"
	"os"

	"n2o/cli/adapter"
	"n2o/cli/api"
	"n2o/cli/auth"
	"n2o/cli/config"
	"n2o/cli/linear"
	"github.com/spf13/cobra"
)

// Version is set at build time via ldflags:
//
//	go build -ldflags "-X n2o/cli/cmd.Version=1.0.0"
var Version = "dev"

// AppURL is the N2O platform URL used for authentication and API calls.
var AppURL = "https://api.n2o.com"

// Quiet suppresses non-essential output when set.
var Quiet bool

// AI is the active AI tool adapter. Resolved from project config on each command.
var AI adapter.Adapter

var rootCmd = &cobra.Command{
	Use:     "n2o",
	Short:   "N2O workflow CLI",
	Version: Version,
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		// init sets AI itself — skip resolution for it.
		if cmd.Name() == "init" {
			return nil
		}

		projectPath, err := resolveProjectPath(cmd, args)
		if err != nil {
			return nil // best-effort; some commands don't need a project
		}

		cfg, err := config.LoadProject(projectPath)
		if err != nil || cfg == nil || cfg.AITool == "" {
			return nil // no project config yet — AI stays nil
		}

		AI, err = adapter.Get(cfg.AITool)
		if err != nil {
			return fmt.Errorf("loading AI tool from config: %w", err)
		}
		return nil
	},
}

func init() {
	rootCmd.PersistentFlags().BoolVarP(&Quiet, "quiet", "q", false, "suppress non-essential output")
	api.DefaultAppURL = AppURL
}

// Execute runs the root command.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// resolveProjectPath returns the project path from the flag, positional arg, or cwd.
func resolveProjectPath(cmd *cobra.Command, args []string) (string, error) {
	if len(args) > 0 {
		return args[0], nil
	}
	return os.Getwd()
}

// requireLinear loads the Linear API key from credentials and returns a
// configured Linear client. Returns an error with a clear recovery action if
// the key is missing or the user is not authenticated.
func requireLinear() (*linear.Client, error) {
	creds, err := auth.Load()
	if err != nil {
		return nil, fmt.Errorf("loading credentials: %w", err)
	}
	if creds == nil {
		return nil, fmt.Errorf("not authenticated — run `n2o login` then `n2o init`")
	}
	if creds.LinearAPIKey == "" {
		return nil, fmt.Errorf("no Linear API key found — run `n2o init` to pull one from the N2O API")
	}
	return linear.New(creds.LinearAPIKey), nil
}

// loadProjectConfig loads the project config from the current working
// directory and validates that Linear team/state mapping is present.
func loadProjectConfig() (string, *config.ProjectConfig, error) {
	projectPath, err := os.Getwd()
	if err != nil {
		return "", nil, err
	}
	cfg, err := config.LoadProject(projectPath)
	if err != nil || cfg == nil {
		return projectPath, nil, fmt.Errorf("project not initialized — run `n2o init`")
	}
	if cfg.Linear == nil || cfg.Linear.TeamID == "" {
		return projectPath, cfg, fmt.Errorf("Linear team not configured — run `n2o init`")
	}
	return projectPath, cfg, nil
}
