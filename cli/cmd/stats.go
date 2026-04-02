package cmd

import (
	"encoding/json"
	"fmt"
	"strings"

	"n2o/cli/db"
	"n2o/cli/ui"
	"github.com/spf13/cobra"
)

var (
	statsJSON   bool
	statsSprint string
)

var statsCmd = &cobra.Command{
	Use:   "stats",
	Short: "Show sprint and task statistics",
	RunE:  runStats,
}

func init() {
	statsCmd.Flags().BoolVar(&statsJSON, "json", false, "output as JSON")
	statsCmd.Flags().StringVar(&statsSprint, "sprint", "", "filter by sprint")
	rootCmd.AddCommand(statsCmd)
}

type sprintProgress struct {
	Sprint          string  `json:"sprint"`
	TotalTasks      int     `json:"total_tasks"`
	Pending         int     `json:"pending"`
	Red             int     `json:"red"`
	Green           int     `json:"green"`
	Blocked         int     `json:"blocked"`
	Audited         int     `json:"audited"`
	Verified        int     `json:"verified"`
	PercentComplete float64 `json:"percent_complete"`
}

type availableTask struct {
	Sprint  string `json:"sprint"`
	TaskNum int    `json:"task_num"`
	Title   string `json:"title"`
	Type    string `json:"type"`
}

func runStats(cmd *cobra.Command, args []string) error {
	projectPath, err := resolveProjectPath(cmd, []string{})
	if err != nil {
		return err
	}

	database, err := db.Open(dbPath(projectPath))
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer database.Close()

	// Query sprint progress.
	query := "SELECT sprint, total_tasks, pending, red, green, blocked, audited, verified, percent_complete FROM sprint_progress"
	queryArgs := []any{}
	if statsSprint != "" {
		query += " WHERE sprint = ?"
		queryArgs = append(queryArgs, statsSprint)
	}

	rows, err := database.Query(query, queryArgs...)
	if err != nil {
		return fmt.Errorf("query sprint_progress: %w", err)
	}
	defer rows.Close()

	var progress []sprintProgress
	for rows.Next() {
		var sp sprintProgress
		if err := rows.Scan(&sp.Sprint, &sp.TotalTasks, &sp.Pending, &sp.Red,
			&sp.Green, &sp.Blocked, &sp.Audited, &sp.Verified, &sp.PercentComplete); err != nil {
			return err
		}
		progress = append(progress, sp)
	}

	// Query available tasks (next 10).
	availQuery := "SELECT sprint, task_num, title, COALESCE(type, '') FROM available_tasks"
	availArgs := []any{}
	if statsSprint != "" {
		availQuery += " WHERE sprint = ?"
		availArgs = append(availArgs, statsSprint)
	}
	availQuery += " LIMIT 10"

	availRows, err := database.Query(availQuery, availArgs...)
	if err != nil {
		return fmt.Errorf("query available_tasks: %w", err)
	}
	defer availRows.Close()

	var available []availableTask
	for availRows.Next() {
		var at availableTask
		if err := availRows.Scan(&at.Sprint, &at.TaskNum, &at.Title, &at.Type); err != nil {
			return err
		}
		available = append(available, at)
	}

	// Output.
	if statsJSON {
		out := map[string]any{
			"sprint_progress": progress,
			"available_tasks": available,
		}
		data, err := json.MarshalIndent(out, "", "  ")
		if err != nil {
			return err
		}
		fmt.Println(string(data))
		return nil
	}

	// Print sprint progress table.
	ui.PrintHeader("Sprint Progress")
	fmt.Println()
	if len(progress) == 0 {
		ui.PrintInfo("No sprints found")
	} else {
		fmt.Printf("%-12s %5s %7s %5s %5s %7s %7s %8s %8s\n",
			ui.Bold("Sprint"), ui.Bold("Total"), ui.Bold("Pending"), ui.Bold("Red"),
			ui.Bold("Green"), ui.Bold("Blocked"), ui.Bold("Audited"), ui.Bold("Verified"), ui.Bold("Done %"))
		fmt.Println(strings.Repeat("-", 80))
		for _, sp := range progress {
			fmt.Printf("%-12s %5d %7d %5d %5d %7d %7d %8d %7.1f%%\n",
				sp.Sprint, sp.TotalTasks, sp.Pending, sp.Red, sp.Green,
				sp.Blocked, sp.Audited, sp.Verified, sp.PercentComplete)
		}
	}

	// Print available tasks.
	fmt.Println()
	ui.PrintHeader("Available Tasks (next 10)")
	fmt.Println()
	if len(available) == 0 {
		ui.PrintInfo("No available tasks")
	} else {
		for _, at := range available {
			taskType := at.Type
			if taskType == "" {
				taskType = "-"
			}
			fmt.Printf("  %s/%d  %-10s  %s\n", at.Sprint, at.TaskNum, taskType, at.Title)
		}
	}

	return nil
}
