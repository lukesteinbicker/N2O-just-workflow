package cmd

import (
	"fmt"

	"github.com/lukes/n2o/internal/db"
	"github.com/lukes/n2o/internal/ui"
	"github.com/spf13/cobra"
)

var (
	sprintName string
	sprintGoal string
)

var sprintCmd = &cobra.Command{
	Use:   "sprint",
	Short: "Manage sprints",
}

var sprintCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new sprint",
	RunE: func(cmd *cobra.Command, args []string) error {
		projectPath, err := resolveProjectPath(cmd, []string{})
		if err != nil {
			return err
		}
		database, err := db.Open(dbPath(projectPath))
		if err != nil {
			return err
		}
		defer database.Close()

		// Create a placeholder task to establish the sprint.
		// The sprint exists implicitly via tasks that reference it.
		_, err = database.Exec(
			"INSERT OR IGNORE INTO tasks (sprint, task_num, title, description, status) VALUES (?, 0, ?, ?, 'green')",
			sprintName, "Sprint: "+sprintName, sprintGoal,
		)
		if err != nil {
			return fmt.Errorf("create sprint: %w", err)
		}

		ui.PrintSuccess(fmt.Sprintf("Created sprint '%s'", sprintName))
		return nil
	},
}

var sprintArchiveCmd = &cobra.Command{
	Use:   "archive",
	Short: "Archive a sprint (delete verified tasks)",
	RunE: func(cmd *cobra.Command, args []string) error {
		projectPath, err := resolveProjectPath(cmd, []string{})
		if err != nil {
			return err
		}
		database, err := db.Open(dbPath(projectPath))
		if err != nil {
			return err
		}
		defer database.Close()

		// Delete verified tasks.
		result, err := database.Exec(
			"DELETE FROM tasks WHERE sprint = ? AND verified = 1",
			sprintName,
		)
		if err != nil {
			return fmt.Errorf("archive sprint: %w", err)
		}
		deleted, _ := result.RowsAffected()

		// Check remaining tasks.
		var remaining int
		_ = database.QueryRow("SELECT COUNT(*) FROM tasks WHERE sprint = ?", sprintName).Scan(&remaining)

		ui.PrintSuccess(fmt.Sprintf("Archived sprint '%s': %d verified tasks deleted, %d remaining",
			sprintName, deleted, remaining))
		return nil
	},
}

func init() {
	sprintCreateCmd.Flags().StringVar(&sprintName, "name", "", "sprint name")
	sprintCreateCmd.Flags().StringVar(&sprintGoal, "goal", "", "sprint goal")
	_ = sprintCreateCmd.MarkFlagRequired("name")

	sprintArchiveCmd.Flags().StringVar(&sprintName, "name", "", "sprint name")
	_ = sprintArchiveCmd.MarkFlagRequired("name")

	sprintCmd.AddCommand(sprintCreateCmd)
	sprintCmd.AddCommand(sprintArchiveCmd)
	rootCmd.AddCommand(sprintCmd)
}
