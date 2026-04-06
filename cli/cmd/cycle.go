package cmd

import (
	"fmt"
	"strings"
	"time"

	"n2o/cli/linear"
	"n2o/cli/ui"
	"github.com/spf13/cobra"
)

var (
	cycleCreateName     string
	cycleCreateStarts   string
	cycleCreateEnds     string
	cycleCreateDesc     string
)

var cycleCmd = &cobra.Command{
	Use:   "cycle",
	Short: "Manage Linear cycles",
}

var cycleListCmd = &cobra.Command{
	Use:   "list",
	Short: "List cycles",
	RunE: func(cmd *cobra.Command, args []string) error {
		lc, err := requireLinear()
		if err != nil {
			return err
		}
		_, cfg, err := loadProjectConfig()
		if err != nil {
			return err
		}
		cycles, err := lc.ListCycles(cfg.Linear.TeamID)
		if err != nil {
			return err
		}
		if len(cycles) == 0 {
			ui.PrintInfo("No cycles found")
			return nil
		}
		fmt.Printf("%-24s %-12s %-12s\n", ui.Bold("Name"), ui.Bold("Starts"), ui.Bold("Ends"))
		fmt.Println(strings.Repeat("-", 52))
		for _, c := range cycles {
			fmt.Printf("%-24s %-12s %-12s\n",
				c.Name,
				c.StartsAt.Format("2006-01-02"),
				c.EndsAt.Format("2006-01-02"),
			)
		}
		return nil
	},
}

var cycleActiveCmd = &cobra.Command{
	Use:   "active",
	Short: "Show active cycle",
	RunE: func(cmd *cobra.Command, args []string) error {
		lc, err := requireLinear()
		if err != nil {
			return err
		}
		_, cfg, err := loadProjectConfig()
		if err != nil {
			return err
		}
		cycle, err := lc.GetActiveCycle(cfg.Linear.TeamID)
		if err != nil {
			return err
		}
		ui.PrintBold(cycle.Name)
		fmt.Printf("  %s → %s\n",
			cycle.StartsAt.Format("2006-01-02"),
			cycle.EndsAt.Format("2006-01-02"))

		// Summarize issues in the cycle by state.
		issues, err := lc.ListIssues(cfg.Linear.TeamID, linear.IssueListOpts{CycleID: cycle.ID})
		if err != nil {
			return nil // best-effort summary
		}
		counts := map[string]int{}
		for _, is := range issues {
			counts[is.State.Name]++
		}
		if len(counts) == 0 {
			return nil
		}
		fmt.Println()
		fmt.Println(ui.Bold("Progress"))
		for name, n := range counts {
			fmt.Printf("  %-14s %d\n", name, n)
		}
		fmt.Printf("  %-14s %d\n", ui.Bold("Total"), len(issues))
		return nil
	},
}

var cycleCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new cycle",
	RunE: func(cmd *cobra.Command, args []string) error {
		lc, err := requireLinear()
		if err != nil {
			return err
		}
		_, cfg, err := loadProjectConfig()
		if err != nil {
			return err
		}
		starts, err := parseDate(cycleCreateStarts)
		if err != nil {
			return fmt.Errorf("--starts: %w", err)
		}
		ends, err := parseDate(cycleCreateEnds)
		if err != nil {
			return fmt.Errorf("--ends: %w", err)
		}
		cycle, err := lc.CreateCycle(linear.CreateCycleInput{
			TeamID:      cfg.Linear.TeamID,
			Name:        cycleCreateName,
			Description: cycleCreateDesc,
			StartsAt:    starts,
			EndsAt:      ends,
		})
		if err != nil {
			return err
		}
		ui.PrintSuccess(fmt.Sprintf("Created cycle %q (%s → %s)",
			cycle.Name,
			cycle.StartsAt.Format("2006-01-02"),
			cycle.EndsAt.Format("2006-01-02")))
		return nil
	},
}

func parseDate(s string) (time.Time, error) {
	// Accept YYYY-MM-DD or RFC3339.
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t.UTC(), nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), nil
	}
	return time.Time{}, fmt.Errorf("invalid date %q (use YYYY-MM-DD)", s)
}

func init() {
	cycleCreateCmd.Flags().StringVar(&cycleCreateName, "name", "", "cycle name (required)")
	cycleCreateCmd.Flags().StringVar(&cycleCreateStarts, "starts", "", "start date YYYY-MM-DD (required)")
	cycleCreateCmd.Flags().StringVar(&cycleCreateEnds, "ends", "", "end date YYYY-MM-DD (required)")
	cycleCreateCmd.Flags().StringVar(&cycleCreateDesc, "description", "", "cycle description")
	_ = cycleCreateCmd.MarkFlagRequired("name")
	_ = cycleCreateCmd.MarkFlagRequired("starts")
	_ = cycleCreateCmd.MarkFlagRequired("ends")

	cycleCmd.AddCommand(cycleListCmd)
	cycleCmd.AddCommand(cycleActiveCmd)
	cycleCmd.AddCommand(cycleCreateCmd)
	rootCmd.AddCommand(cycleCmd)
}
