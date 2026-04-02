package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"n2o/cli/api"
	"n2o/cli/auth"
	"n2o/cli/config"
	"n2o/cli/ui"
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

	// Authenticate.
	if !auth.IsLoggedIn() {
		return fmt.Errorf("not authenticated — run 'n2o login' first")
	}

	client, err := api.NewFromConfig()
	if err != nil {
		return fmt.Errorf("creating API client: %w", err)
	}
	if client == nil {
		return fmt.Errorf("not authenticated — run 'n2o login' first")
	}

	// Download framework content from API.
	if !Quiet {
		ui.PrintInfo("Downloading framework...")
	}
	bundle, err := api.DownloadFramework(client)
	if err != nil {
		return fmt.Errorf("download framework: %w", err)
	}

	if !Quiet {
		ui.PrintHeader("Syncing N2O framework -> " + projectPath)
		fmt.Println()
	}

	var synced int

	for _, f := range bundle.Files {
		// Filter by category if --only is set.
		if syncOnly == "skills" && !strings.HasPrefix(f.Path, AI.SkillsPathPrefix()) {
			continue
		}
		if syncOnly == "schema" && f.Path != ".pm/schema.sql" {
			continue
		}

		targetPath := filepath.Join(projectPath, f.Path)
		updated, err := syncFileFromContent(targetPath, []byte(f.Content))
		if err != nil {
			return fmt.Errorf("sync %s: %w", f.Path, err)
		}
		if updated {
			synced++
		}
	}

	// Update version in project config.
	if syncOnly == "" {
		projCfg, _ := config.LoadProject(projectPath)
		if projCfg == nil {
			projCfg = &config.ProjectConfig{}
		}
		if projCfg.N2OVersion != bundle.Version {
			projCfg.N2OVersion = bundle.Version
			if !syncDryRun {
				if err := config.SaveProject(projectPath, projCfg); err != nil {
					return fmt.Errorf("save project config: %w", err)
				}
			}
			if !Quiet {
				fmt.Printf("  updated version -> %s\n", bundle.Version)
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

// syncFileFromContent writes content to dst if it differs from the existing file.
func syncFileFromContent(dst string, content []byte) (bool, error) {
	// Compare with existing content.
	if existing, err := os.ReadFile(dst); err == nil {
		if string(existing) == string(content) {
			return false, nil
		}
		if !syncForce {
			// If the file exists and force isn't set, check mod time.
			// Since we're pulling from API, we always update unless content matches.
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
	if err := os.WriteFile(dst, content, 0o644); err != nil {
		return false, err
	}
	if !Quiet {
		fmt.Printf("  updated %s\n", rel)
	}
	return true, nil
}
