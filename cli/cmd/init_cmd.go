package cmd

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"n2o/cli/adapter"
	"n2o/cli/api"
	"n2o/cli/auth"
	"n2o/cli/config"
	"n2o/cli/db"
	"n2o/cli/ui"
	"github.com/spf13/cobra"
)

var initCmd = &cobra.Command{
	Use:   "init [project-path]",
	Short: "Initialize a new N2O project",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runInit,
}

func init() {
	rootCmd.AddCommand(initCmd)
}

func runInit(cmd *cobra.Command, args []string) error {
	projectPath := "."
	if len(args) > 0 {
		projectPath = args[0]
	}

	ui.PrintHeader("N2O Project Setup")
	fmt.Println()

	// Step 1: Authenticate if needed.
	if !auth.IsLoggedIn() {
		ui.PrintInfo("Not logged in — starting authentication...")
		fmt.Println()

		newCreds, err := auth.DeviceFlowLogin(AppURL)
		if err != nil {
			return fmt.Errorf("authentication failed: %w", err)
		}
		if err := auth.Save(newCreds); err != nil {
			return fmt.Errorf("saving credentials: %w", err)
		}
		ui.PrintSuccess("Authenticated")
		fmt.Println()
	}

	// Step 2: Download framework content from API.
	client, err := api.NewFromConfig()
	if err != nil {
		return fmt.Errorf("creating API client: %w", err)
	}
	if client == nil {
		return fmt.Errorf("not authenticated — run 'n2o login' first")
	}

	ui.PrintInfo("Downloading framework...")
	bundle, err := api.DownloadFramework(client)
	if err != nil {
		return fmt.Errorf("download framework: %w", err)
	}

	// Step 3: Select AI tool.
	allAdapters := adapter.All()
	options := make([]ui.SelectOption, len(allAdapters))
	for i, a := range allAdapters {
		options[i] = ui.SelectOption{Label: a.Label(), Value: a.Name()}
	}

	fmt.Println()
	toolName, err := ui.Select("AI tool:", options)
	if err != nil {
		return fmt.Errorf("selecting AI tool: %w", err)
	}

	AI, err = adapter.Get(toolName)
	if err != nil {
		return err
	}
	fmt.Println()

	// Step 4: Create directory structure.
	skillsDir := AI.SkillsDir()
	dirs := []string{".pm", ".pm/todo", ".pm/migrations", filepath.Dir(skillsDir), skillsDir}
	for _, dir := range dirs {
		target := filepath.Join(projectPath, dir)
		if err := os.MkdirAll(target, 0o755); err != nil {
			return fmt.Errorf("create directory %s: %w", dir, err)
		}
	}

	// Step 4: Write all files from the bundle.
	var schemaContent []byte
	for _, f := range bundle.Files {
		targetPath := filepath.Join(projectPath, f.Path)

		// Don't overwrite existing project files.
		if _, err := os.Stat(targetPath); err == nil {
			if !Quiet {
				fmt.Printf("  skipped %s (already exists)\n", f.Path)
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return fmt.Errorf("create parent for %s: %w", f.Path, err)
		}
		if err := os.WriteFile(targetPath, []byte(f.Content), 0o644); err != nil {
			return fmt.Errorf("write %s: %w", f.Path, err)
		}
		if !Quiet {
			fmt.Printf("  created %s\n", f.Path)
		}

		// Capture schema for DB init.
		if f.Path == ".pm/schema.sql" {
			schemaContent = []byte(f.Content)
		}
	}

	// Step 5: Initialize tasks.db from schema.
	if schemaContent != nil {
		tasksDB := dbPath(projectPath)
		if err := db.InitFromSchemaBytes(tasksDB, schemaContent); err != nil {
			return fmt.Errorf("init database: %w", err)
		}
		if !Quiet {
			fmt.Println("  initialized .pm/tasks.db")
		}
	}

	// Step 6: Ensure developer name is set.
	gcfg, _ := config.LoadGlobal()
	if gcfg == nil || gcfg.DeveloperName == "" {
		fmt.Println()
		fmt.Print("Developer name: ")
		reader := bufio.NewReader(os.Stdin)
		name, _ := reader.ReadString('\n')
		name = strings.TrimSpace(name)
		if name != "" {
			if gcfg == nil {
				gcfg = &config.GlobalConfig{}
			}
			gcfg.DeveloperName = name
			if err := config.SaveGlobal(gcfg); err != nil {
				return fmt.Errorf("saving global config: %w", err)
			}
		}
	}

	// Step 7: Update project config with framework version.
	projCfg, _ := config.LoadProject(projectPath)
	if projCfg == nil {
		projCfg = &config.ProjectConfig{}
	}
	projCfg.N2OVersion = bundle.Version
	projCfg.AITool = AI.Name()
	if err := config.SaveProject(projectPath, projCfg); err != nil {
		return fmt.Errorf("save project config: %w", err)
	}

	fmt.Println()
	ui.PrintSuccess("Project initialized successfully")
	return nil
}
