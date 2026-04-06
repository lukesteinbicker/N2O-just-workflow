package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"n2o/cli/config"
	"n2o/cli/ui"
	"github.com/spf13/cobra"
)

var checkCmd = &cobra.Command{
	Use:   "check [project-path]",
	Short: "Verify N2O project health",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runCheck,
}

func init() {
	rootCmd.AddCommand(checkCmd)
}

func runCheck(cmd *cobra.Command, args []string) error {
	projectPath, err := resolveProjectPath(cmd, args)
	if err != nil {
		return err
	}

	ui.PrintHeader("N2O Project Health Check")
	fmt.Println()

	allPassed := true

	// Project config valid.
	cfg, err := config.LoadProject(projectPath)
	if err != nil {
		printCheck(false, "project config valid: "+err.Error())
		allPassed = false
	} else if cfg == nil {
		printCheck(false, "project config exists (run `n2o init`)")
		allPassed = false
	} else {
		printCheck(true, "project config valid")
		if cfg.Linear == nil || cfg.Linear.TeamID == "" {
			printCheck(false, "Linear team configured")
			allPassed = false
		} else {
			printCheck(true, fmt.Sprintf("Linear team configured (%s)", cfg.Linear.TeamKey))
		}
		if cfg.Linear != nil && len(cfg.Linear.StateMapping) > 0 {
			printCheck(true, fmt.Sprintf("Linear state mapping populated (%d states)", len(cfg.Linear.StateMapping)))
		} else {
			printCheck(false, "Linear state mapping populated")
			allPassed = false
		}
	}

	// Linear connectivity.
	lc, err := requireLinear()
	if err != nil {
		printCheck(false, "Linear API key available: "+err.Error())
		allPassed = false
	} else {
		me, err := lc.GetMe()
		if err != nil {
			printCheck(false, "Linear API reachable: "+err.Error())
			allPassed = false
		} else {
			printCheck(true, fmt.Sprintf("Linear API reachable (as %s)", me.DisplayName))
		}
	}

	// Skills installed.
	if AI != nil {
		skillsDir := filepath.Join(projectPath, AI.SkillsDir())
		if entries, err := os.ReadDir(skillsDir); err != nil || len(entries) == 0 {
			printCheck(false, "skills installed")
			allPassed = false
		} else {
			printCheck(true, fmt.Sprintf("skills installed (%d files)", len(entries)))
		}
	}

	// n2o on PATH.
	if _, err := exec.LookPath("n2o"); err != nil {
		printCheck(false, "n2o on PATH")
		allPassed = false
	} else {
		printCheck(true, "n2o on PATH")
	}

	fmt.Println()
	if allPassed {
		ui.PrintSuccess("All checks passed")
	} else {
		ui.PrintWarn("Some checks failed")
	}
	return nil
}

func printCheck(pass bool, msg string) {
	if pass {
		fmt.Printf("  %s %s\n", ui.Success("PASS"), msg)
	} else {
		fmt.Printf("  %s %s\n", ui.Error("FAIL"), msg)
	}
}
