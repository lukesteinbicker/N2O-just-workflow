package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/lukes/n2o/internal/config"
	"github.com/lukes/n2o/internal/ui"
	"github.com/spf13/cobra"
)

var (
	syncDryRun bool
	syncForce  bool
	syncOnly   string
)

var syncCmd = &cobra.Command{
	Use:   "sync [project-path]",
	Short: "Sync framework files to project",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runSync,
}

func init() {
	syncCmd.Flags().BoolVar(&syncDryRun, "dry-run", false, "show what would change without writing")
	syncCmd.Flags().BoolVar(&syncForce, "force", false, "overwrite even if project files are newer")
	syncCmd.Flags().StringVar(&syncOnly, "only", "", "sync only a specific category (skills, schema)")
	rootCmd.AddCommand(syncCmd)
}

func runSync(cmd *cobra.Command, args []string) error {
	projectPath, err := resolveProjectPath(cmd, args)
	if err != nil {
		return err
	}

	gcfg, err := config.LoadGlobal()
	if err != nil {
		return fmt.Errorf("load global config (run 'n2o setup' first): %w", err)
	}
	frameworkPath := gcfg.FrameworkPath

	// Load manifest for version.
	manifestData, err := os.ReadFile(filepath.Join(frameworkPath, "n2o-manifest.json"))
	if err != nil {
		return fmt.Errorf("read manifest: %w", err)
	}
	var manifest struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		return fmt.Errorf("parse manifest: %w", err)
	}

	if !Quiet {
		ui.PrintHeader("Syncing N2O framework -> " + projectPath)
		fmt.Println()
	}

	var synced int

	// Sync skills.
	if syncOnly == "" || syncOnly == "skills" {
		frameworkSkills := filepath.Join(frameworkPath, "skills")
		projectSkills := filepath.Join(projectPath, ".claude", "skills")
		if _, err := os.Stat(frameworkSkills); err == nil {
			count, err := syncDir(frameworkSkills, projectSkills)
			if err != nil {
				return fmt.Errorf("sync skills: %w", err)
			}
			synced += count
		}
	}

	// Sync schema.sql.
	if syncOnly == "" || syncOnly == "schema" {
		src := filepath.Join(frameworkPath, ".pm", "schema.sql")
		dst := filepath.Join(projectPath, ".pm", "schema.sql")
		if _, err := os.Stat(src); err == nil {
			updated, err := syncFile(src, dst)
			if err != nil {
				return fmt.Errorf("sync schema: %w", err)
			}
			if updated {
				synced++
			}
		}
	}

	// Update version in project config.
	if syncOnly == "" {
		projCfg, _ := config.LoadProject(projectPath)
		if projCfg == nil {
			projCfg = &config.ProjectConfig{}
		}
		if projCfg.N2OVersion != manifest.Version {
			projCfg.N2OVersion = manifest.Version
			if !syncDryRun {
				if err := config.SaveProject(projectPath, projCfg); err != nil {
					return fmt.Errorf("save project config: %w", err)
				}
			}
			if !Quiet {
				fmt.Printf("  updated version -> %s\n", manifest.Version)
			}
			synced++
		}
	}

	fmt.Println()
	if synced == 0 {
		ui.PrintSuccess("Everything up to date")
	} else {
		ui.PrintSuccess(fmt.Sprintf("Synced %d file(s)", synced))
	}
	return nil
}

func syncDir(src, dst string) (int, error) {
	var count int
	return count, filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(src, path)
		target := filepath.Join(dst, rel)

		updated, err := syncFile(path, target)
		if err != nil {
			return err
		}
		if updated {
			count++
		}
		return nil
	})
}

func syncFile(src, dst string) (bool, error) {
	srcInfo, err := os.Stat(src)
	if err != nil {
		return false, err
	}

	dstInfo, err := os.Stat(dst)
	if err == nil && !syncForce {
		// Skip if destination is newer.
		if dstInfo.ModTime().After(srcInfo.ModTime()) {
			return false, nil
		}
		// Skip if same size and mod time (quick check).
		if dstInfo.Size() == srcInfo.Size() && dstInfo.ModTime().Equal(srcInfo.ModTime()) {
			return false, nil
		}
	}

	// Compare contents to avoid unnecessary writes.
	srcData, err := os.ReadFile(src)
	if err != nil {
		return false, err
	}
	if dstData, err := os.ReadFile(dst); err == nil {
		if string(srcData) == string(dstData) {
			return false, nil
		}
	}

	rel := dst
	if cwd, err := os.Getwd(); err == nil {
		if r, err := filepath.Rel(cwd, dst); err == nil && !strings.HasPrefix(r, "..") {
			rel = r
		}
	}

	if syncDryRun {
		if !Quiet {
			fmt.Printf("  would update %s\n", rel)
		}
		return true, nil
	}

	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return false, err
	}
	if err := os.WriteFile(dst, srcData, 0o644); err != nil {
		return false, err
	}
	if !Quiet {
		fmt.Printf("  updated %s\n", rel)
	}
	return true, nil
}
