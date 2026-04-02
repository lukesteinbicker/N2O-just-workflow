package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/lukes/n2o/internal/config"
	"github.com/lukes/n2o/internal/db"
	"github.com/lukes/n2o/internal/ui"
	"github.com/spf13/cobra"
)

var initCmd = &cobra.Command{
	Use:   "init <project-path>",
	Short: "Initialize a new N2O project",
	Args:  cobra.ExactArgs(1),
	RunE:  runInit,
}

func init() {
	rootCmd.AddCommand(initCmd)
}

func runInit(cmd *cobra.Command, args []string) error {
	projectPath := args[0]

	// Load framework path from global config.
	gcfg, err := config.LoadGlobal()
	if err != nil {
		return fmt.Errorf("load global config (run 'n2o setup' first): %w", err)
	}
	frameworkPath := gcfg.FrameworkPath

	// Load manifest.
	manifestPath := filepath.Join(frameworkPath, "n2o-manifest.json")
	manifestData, err := os.ReadFile(manifestPath)
	if err != nil {
		return fmt.Errorf("read manifest: %w", err)
	}
	var manifest struct {
		Version            string            `json:"version"`
		DirectoryStructure []string          `json:"directory_structure"`
		Scaffolds          map[string]string `json:"scaffolds"`
	}
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		return fmt.Errorf("parse manifest: %w", err)
	}

	ui.PrintHeader("Initializing N2O project: " + projectPath)
	fmt.Println()

	// Create directory structure.
	for _, dir := range manifest.DirectoryStructure {
		target := filepath.Join(projectPath, dir)
		if err := os.MkdirAll(target, 0o755); err != nil {
			return fmt.Errorf("create directory %s: %w", dir, err)
		}
		if !Quiet {
			fmt.Printf("  created %s/\n", dir)
		}
	}

	// Scaffold project files from templates.
	for dest, src := range manifest.Scaffolds {
		targetPath := filepath.Join(projectPath, dest)
		if _, err := os.Stat(targetPath); err == nil {
			if !Quiet {
				fmt.Printf("  skipped %s (already exists)\n", dest)
			}
			continue
		}
		srcPath := filepath.Join(frameworkPath, src)
		if err := copyFile(srcPath, targetPath); err != nil {
			return fmt.Errorf("scaffold %s: %w", dest, err)
		}
		if !Quiet {
			fmt.Printf("  created %s\n", dest)
		}
	}

	// Copy skills to .claude/skills/.
	skillsDir := filepath.Join(projectPath, ".claude", "skills")
	frameworkSkills := filepath.Join(frameworkPath, "skills")
	if _, err := os.Stat(frameworkSkills); err == nil {
		if err := copyDir(frameworkSkills, skillsDir); err != nil {
			return fmt.Errorf("copy skills: %w", err)
		}
		if !Quiet {
			fmt.Println("  synced skills to .claude/skills/")
		}
	}

	// Initialize tasks.db from schema.sql if not exists.
	tasksDB := filepath.Join(projectPath, ".pm", "tasks.db")
	if _, err := os.Stat(tasksDB); os.IsNotExist(err) {
		schemaPath := filepath.Join(frameworkPath, ".pm", "schema.sql")
		if err := db.InitFromSchema(tasksDB, schemaPath); err != nil {
			return fmt.Errorf("init database: %w", err)
		}
		if !Quiet {
			fmt.Println("  initialized .pm/tasks.db")
		}
	} else if !Quiet {
		fmt.Println("  skipped .pm/tasks.db (already exists)")
	}

	// Update project config with framework version.
	projCfg, _ := config.LoadProject(projectPath)
	if projCfg == nil {
		projCfg = &config.ProjectConfig{}
	}
	projCfg.N2OVersion = manifest.Version
	if err := config.SaveProject(projectPath, projCfg); err != nil {
		return fmt.Errorf("save project config: %w", err)
	}

	fmt.Println()
	ui.PrintSuccess("Project initialized successfully")
	return nil
}

func copyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		target := filepath.Join(dst, rel)

		if info.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		return copyFile(path, target)
	})
}
