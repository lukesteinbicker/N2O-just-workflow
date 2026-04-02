package cmd

import (
	"database/sql"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"n2o/cli/config"
	"n2o/cli/ui"
	"github.com/spf13/cobra"

	_ "modernc.org/sqlite"
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

	// Check: tasks.db exists.
	tasksDB := dbPath(projectPath)
	if _, err := os.Stat(tasksDB); err != nil {
		printCheck(false, "tasks.db exists")
		allPassed = false
	} else {
		printCheck(true, "tasks.db exists")

		// Check: schema tables exist.
		database, err := sql.Open("sqlite", tasksDB)
		if err != nil {
			printCheck(false, "tasks.db readable: "+err.Error())
			allPassed = false
		} else {
			defer database.Close()
			tables := []string{"tasks", "task_dependencies", "workflow_events", "transcripts"}
			for _, t := range tables {
				var name string
				err := database.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", t).Scan(&name)
				if err != nil {
					printCheck(false, fmt.Sprintf("table '%s' exists", t))
					allPassed = false
				} else {
					printCheck(true, fmt.Sprintf("table '%s' exists", t))
				}
			}
		}
	}

	// Check: skills installed.
	skillsDir := filepath.Join(projectPath, AI.SkillsDir())
	if entries, err := os.ReadDir(skillsDir); err != nil || len(entries) == 0 {
		printCheck(false, "skills installed")
		allPassed = false
	} else {
		printCheck(true, fmt.Sprintf("skills installed (%d files)", len(entries)))
	}

	// Check: config valid.
	if _, err := config.LoadProject(projectPath); err != nil {
		printCheck(false, "project config valid: "+err.Error())
		allPassed = false
	} else {
		printCheck(true, "project config valid")
	}

	// Check: n2o on PATH.
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
