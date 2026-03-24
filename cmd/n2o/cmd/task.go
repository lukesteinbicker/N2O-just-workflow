package cmd

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/lukes/n2o/internal/config"
	"github.com/lukes/n2o/internal/db"
	"github.com/lukes/n2o/internal/task"
	"github.com/lukes/n2o/internal/ui"
	"github.com/spf13/cobra"
)

// Shared flags for task subcommands.
var (
	taskSprint      string
	taskNum         int
	taskStatus      string
	taskBlockReason string
	taskHash        string
	taskTitle       string
	taskType        string
	taskDoneWhen    string
	taskDescription string
	taskDependsOn   int
)

var taskCmd = &cobra.Command{
	Use:   "task",
	Short: "Manage tasks",
}

func init() {
	rootCmd.AddCommand(taskCmd)
	taskCmd.AddCommand(taskListCmd)
	taskCmd.AddCommand(taskAvailableCmd)
	taskCmd.AddCommand(taskClaimCmd)
	taskCmd.AddCommand(taskStatusCmd)
	taskCmd.AddCommand(taskBlockCmd)
	taskCmd.AddCommand(taskUnblockCmd)
	taskCmd.AddCommand(taskCommitCmd)
	taskCmd.AddCommand(taskCreateCmd)
	taskCmd.AddCommand(taskDepCmd)
	taskCmd.AddCommand(taskVerifyCmd)

	taskDepCmd.AddCommand(taskDepAddCmd)
}

// --- task list ---

var taskListCmd = &cobra.Command{
	Use:   "list",
	Short: "List tasks",
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

		sprint, _ := cmd.Flags().GetString("sprint")
		if sprint == "" {
			return fmt.Errorf("--sprint is required")
		}
		status, _ := cmd.Flags().GetString("status")

		tasks, err := task.List(database, sprint, status)
		if err != nil {
			return err
		}
		printTasks(tasks)
		return nil
	},
}

func init() {
	taskListCmd.Flags().String("sprint", "", "sprint name (required)")
	taskListCmd.Flags().String("status", "", "filter by status")
}

// --- task available ---

var taskAvailableCmd = &cobra.Command{
	Use:   "available",
	Short: "Show available (unblocked, unclaimed) tasks",
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

		sprint, _ := cmd.Flags().GetString("sprint")
		if sprint == "" {
			return fmt.Errorf("--sprint is required")
		}
		tasks, err := task.Available(database, sprint)
		if err != nil {
			return err
		}
		printTasks(tasks)
		return nil
	},
}

func init() {
	taskAvailableCmd.Flags().String("sprint", "", "sprint name (required)")
}

// --- task claim ---

var taskClaimCmd = &cobra.Command{
	Use:   "claim",
	Short: "Claim a task",
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

		// Get developer name from global config.
		gcfg, _ := config.LoadGlobal()
		owner := "claimed"
		if gcfg != nil && gcfg.DeveloperName != "" {
			owner = gcfg.DeveloperName
		}

		if err := task.Claim(database, taskSprint, taskNum, owner); err != nil {
			return err
		}
		ui.PrintSuccess(fmt.Sprintf("Claimed task %s/%d", taskSprint, taskNum))
		return nil
	},
}

func init() {
	taskClaimCmd.Flags().StringVar(&taskSprint, "sprint", "", "sprint name")
	taskClaimCmd.Flags().IntVar(&taskNum, "task", 0, "task number")
	_ = taskClaimCmd.MarkFlagRequired("sprint")
	_ = taskClaimCmd.MarkFlagRequired("task")
}

// --- task status ---

var taskStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Update task status",
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

		if err := task.SetStatus(database, taskSprint, taskNum, taskStatus); err != nil {
			return err
		}
		ui.PrintSuccess(fmt.Sprintf("Task %s/%d -> %s", taskSprint, taskNum, taskStatus))
		return nil
	},
}

func init() {
	taskStatusCmd.Flags().StringVar(&taskSprint, "sprint", "", "sprint name")
	taskStatusCmd.Flags().IntVar(&taskNum, "task", 0, "task number")
	taskStatusCmd.Flags().StringVar(&taskStatus, "status", "", "new status")
	_ = taskStatusCmd.MarkFlagRequired("sprint")
	_ = taskStatusCmd.MarkFlagRequired("task")
	_ = taskStatusCmd.MarkFlagRequired("status")
}

// --- task block ---

var taskBlockCmd = &cobra.Command{
	Use:   "block",
	Short: "Mark task as blocked",
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

		if err := task.Block(database, taskSprint, taskNum, taskBlockReason); err != nil {
			return err
		}
		ui.PrintSuccess(fmt.Sprintf("Task %s/%d blocked: %s", taskSprint, taskNum, taskBlockReason))
		return nil
	},
}

func init() {
	taskBlockCmd.Flags().StringVar(&taskSprint, "sprint", "", "sprint name")
	taskBlockCmd.Flags().IntVar(&taskNum, "task", 0, "task number")
	taskBlockCmd.Flags().StringVar(&taskBlockReason, "reason", "", "block reason")
	_ = taskBlockCmd.MarkFlagRequired("sprint")
	_ = taskBlockCmd.MarkFlagRequired("task")
	_ = taskBlockCmd.MarkFlagRequired("reason")
}

// --- task unblock ---

var taskUnblockCmd = &cobra.Command{
	Use:   "unblock",
	Short: "Unblock a task",
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

		if err := task.Unblock(database, taskSprint, taskNum); err != nil {
			return err
		}
		ui.PrintSuccess(fmt.Sprintf("Task %s/%d unblocked", taskSprint, taskNum))
		return nil
	},
}

func init() {
	taskUnblockCmd.Flags().StringVar(&taskSprint, "sprint", "", "sprint name")
	taskUnblockCmd.Flags().IntVar(&taskNum, "task", 0, "task number")
	_ = taskUnblockCmd.MarkFlagRequired("sprint")
	_ = taskUnblockCmd.MarkFlagRequired("task")
}

// --- task commit ---

var taskCommitCmd = &cobra.Command{
	Use:   "commit",
	Short: "Record a commit hash for a task",
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

		if err := task.RecordCommit(database, taskSprint, taskNum, taskHash); err != nil {
			return err
		}
		shortHash := taskHash
		if len(shortHash) > 8 {
			shortHash = shortHash[:8]
		}
		ui.PrintSuccess(fmt.Sprintf("Recorded commit %s for %s/%d", shortHash, taskSprint, taskNum))
		return nil
	},
}

func init() {
	taskCommitCmd.Flags().StringVar(&taskSprint, "sprint", "", "sprint name")
	taskCommitCmd.Flags().IntVar(&taskNum, "task", 0, "task number")
	taskCommitCmd.Flags().StringVar(&taskHash, "hash", "", "commit hash")
	_ = taskCommitCmd.MarkFlagRequired("sprint")
	_ = taskCommitCmd.MarkFlagRequired("task")
	_ = taskCommitCmd.MarkFlagRequired("hash")
}

// --- task create ---

var taskCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new task",
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

		// Get next task number for this sprint.
		var maxNum int
		err = database.QueryRow(
			"SELECT COALESCE(MAX(task_num), 0) FROM tasks WHERE sprint = ?", taskSprint,
		).Scan(&maxNum)
		if err != nil {
			return fmt.Errorf("get max task_num: %w", err)
		}
		num := maxNum + 1

		t := task.Task{
			Sprint:      taskSprint,
			TaskNum:     num,
			Title:       taskTitle,
			Type:        taskType,
			DoneWhen:    taskDoneWhen,
			Description: taskDescription,
		}
		if err := task.Create(database, t); err != nil {
			return err
		}
		ui.PrintSuccess(fmt.Sprintf("Created task %s/%d: %s", taskSprint, num, taskTitle))
		return nil
	},
}

func init() {
	taskCreateCmd.Flags().StringVar(&taskSprint, "sprint", "", "sprint name")
	taskCreateCmd.Flags().StringVar(&taskTitle, "title", "", "task title")
	taskCreateCmd.Flags().StringVar(&taskType, "type", "", "task type")
	taskCreateCmd.Flags().StringVar(&taskDoneWhen, "done-when", "", "completion criteria")
	taskCreateCmd.Flags().StringVar(&taskDescription, "description", "", "task description")
	_ = taskCreateCmd.MarkFlagRequired("sprint")
	_ = taskCreateCmd.MarkFlagRequired("title")
}

// --- task dep ---

var taskDepCmd = &cobra.Command{
	Use:   "dep",
	Short: "Manage task dependencies",
}

var taskDepAddCmd = &cobra.Command{
	Use:   "add",
	Short: "Add a dependency",
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

		if err := task.AddDep(database, taskSprint, taskNum, taskDependsOn); err != nil {
			return err
		}
		ui.PrintSuccess(fmt.Sprintf("Task %s/%d now depends on %s/%d", taskSprint, taskNum, taskSprint, taskDependsOn))
		return nil
	},
}

func init() {
	taskDepAddCmd.Flags().StringVar(&taskSprint, "sprint", "", "sprint name")
	taskDepAddCmd.Flags().IntVar(&taskNum, "task", 0, "task number")
	taskDepAddCmd.Flags().IntVar(&taskDependsOn, "depends-on", 0, "depends on task number")
	_ = taskDepAddCmd.MarkFlagRequired("sprint")
	_ = taskDepAddCmd.MarkFlagRequired("task")
	_ = taskDepAddCmd.MarkFlagRequired("depends-on")
}

// --- task verify ---

var taskVerifyCmd = &cobra.Command{
	Use:   "verify",
	Short: "Mark a task as verified",
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

		if err := task.Verify(database, taskSprint, taskNum); err != nil {
			return err
		}
		ui.PrintSuccess(fmt.Sprintf("Task %s/%d verified", taskSprint, taskNum))
		return nil
	},
}

func init() {
	taskVerifyCmd.Flags().StringVar(&taskSprint, "sprint", "", "sprint name")
	taskVerifyCmd.Flags().IntVar(&taskNum, "task", 0, "task number")
	_ = taskVerifyCmd.MarkFlagRequired("sprint")
	_ = taskVerifyCmd.MarkFlagRequired("task")
}

// printTasks prints a formatted table of tasks.
func printTasks(tasks []task.Task) {
	if len(tasks) == 0 {
		ui.PrintInfo("No tasks found")
		return
	}

	// Print header.
	fmt.Printf("%-8s %-4s %-10s %-10s %s\n",
		ui.Bold("Sprint"), ui.Bold("#"), ui.Bold("Status"), ui.Bold("Type"), ui.Bold("Title"))
	fmt.Println(strings.Repeat("-", 70))

	for _, t := range tasks {
		status := t.Status
		switch t.Status {
		case "green":
			status = ui.Success(status)
		case "red":
			status = ui.Error(status)
		case "blocked":
			status = ui.Warn(status)
		default:
			status = ui.Info(status)
		}

		taskType := t.Type
		if taskType == "" {
			taskType = "-"
		}

		fmt.Printf("%-8s %-4d %-10s %-10s %s\n", t.Sprint, t.TaskNum, status, taskType, t.Title)
	}
	fmt.Printf("\n%s\n", ui.Info(fmt.Sprintf("%d task(s)", len(tasks))))
}

// printTasksJSON prints tasks as JSON.
func printTasksJSON(tasks []task.Task) error {
	data, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(data))
	return nil
}
