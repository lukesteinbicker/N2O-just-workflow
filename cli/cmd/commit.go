package cmd

import (
	"fmt"
	"os/exec"
	"strings"

	"github.com/lukes/n2o/internal/db"
	"github.com/lukes/n2o/internal/task"
	"github.com/lukes/n2o/internal/ui"
	"github.com/spf13/cobra"
)

var (
	commitSprint string
	commitTask   int
)

var commitCmd = &cobra.Command{
	Use:   "commit",
	Short: "Create a conventional commit for a task",
	RunE:  runCommit,
}

func init() {
	commitCmd.Flags().StringVar(&commitSprint, "sprint", "", "sprint name (required)")
	commitCmd.Flags().IntVar(&commitTask, "task", 0, "task number (required)")
	_ = commitCmd.MarkFlagRequired("sprint")
	_ = commitCmd.MarkFlagRequired("task")
	rootCmd.AddCommand(commitCmd)
}

func runCommit(cmd *cobra.Command, args []string) error {
	projectPath, err := resolveProjectPath(cmd, []string{})
	if err != nil {
		return err
	}

	database, err := db.Open(dbPath(projectPath))
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer database.Close()

	tasks, err := task.List(database, commitSprint, "")
	if err != nil {
		return fmt.Errorf("list tasks: %w", err)
	}

	var t *task.Task
	for i := range tasks {
		if tasks[i].TaskNum == commitTask {
			t = &tasks[i]
			break
		}
	}
	if t == nil {
		return fmt.Errorf("task %s/%d not found", commitSprint, commitTask)
	}

	// Build conventional commit message.
	commitType := "feat"
	switch t.Type {
	case "docs":
		commitType = "docs"
	case "infra":
		commitType = "chore"
	case "e2e":
		commitType = "test"
	}

	scope := t.Type
	if scope == "" {
		scope = "task"
	}

	msg := fmt.Sprintf("%s(%s): %s", commitType, scope, t.Title)

	// Add trailers.
	var trailers []string
	trailers = append(trailers, fmt.Sprintf("Sprint: %s", commitSprint))
	trailers = append(trailers, fmt.Sprintf("Task: %d", commitTask))
	if t.DoneWhen != "" {
		trailers = append(trailers, fmt.Sprintf("Done-when: %s", t.DoneWhen))
	}

	fullMsg := msg + "\n\n" + strings.Join(trailers, "\n")

	// Shell out to git commit.
	gitCmd := exec.Command("git", "commit", "-m", fullMsg)
	gitCmd.Dir = projectPath
	output, err := gitCmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git commit failed: %s\n%w", string(output), err)
	}
	fmt.Print(string(output))

	// Get the commit hash.
	hashCmd := exec.Command("git", "rev-parse", "HEAD")
	hashCmd.Dir = projectPath
	hashOut, err := hashCmd.Output()
	if err != nil {
		return fmt.Errorf("get commit hash: %w", err)
	}
	hash := strings.TrimSpace(string(hashOut))

	// Record commit hash in DB.
	if err := task.RecordCommit(database, commitSprint, commitTask, hash); err != nil {
		return fmt.Errorf("record commit: %w", err)
	}

	ui.PrintSuccess(fmt.Sprintf("Committed %s for %s/%d", hash[:8], commitSprint, commitTask))
	return nil
}
