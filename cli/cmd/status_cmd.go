package cmd

import (
	"fmt"
	"time"

	"n2o/cli/auth"
	"n2o/cli/config"
	"n2o/cli/ui"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show CLI status: N2O auth, Linear connectivity, active cycle",
	RunE:  runStatus,
}

func init() {
	rootCmd.AddCommand(statusCmd)
}

func runStatus(cmd *cobra.Command, args []string) error {
	ui.PrintHeader("N2O Status")
	fmt.Println()

	// --- N2O Auth ---
	fmt.Println(ui.Bold("N2O"))
	creds, err := auth.Load()
	switch {
	case err != nil:
		fmt.Printf("  Status: %s\n", ui.Error("error loading credentials"))
	case creds == nil:
		fmt.Printf("  Status: %s\n", ui.Warn("not logged in"))
	case auth.IsExpired(creds):
		fmt.Printf("  Status: %s (expired %s)\n",
			ui.Error("expired"),
			creds.ExpiresAt.Format(time.RFC3339))
	default:
		fmt.Printf("  Status: %s\n", ui.Success("authenticated"))
		fmt.Printf("  User:   %s\n", creds.UserID)
		if creds.OrgID != "" {
			fmt.Printf("  Org:    %s\n", creds.OrgID)
		}
	}
	fmt.Println()

	// --- Linear ---
	fmt.Println(ui.Bold("Linear"))
	lc, err := requireLinear()
	if err != nil {
		fmt.Printf("  Status: %s\n", ui.Warn(err.Error()))
		return nil
	}
	me, err := lc.GetMe()
	if err != nil {
		fmt.Printf("  Status: %s\n", ui.Error(err.Error()))
		return nil
	}
	fmt.Printf("  Status: %s (as %s)\n", ui.Success("connected"), me.DisplayName)

	// --- Project / active cycle ---
	projCfg, _ := config.LoadProject(".")
	if projCfg == nil || projCfg.Linear == nil || projCfg.Linear.TeamID == "" {
		fmt.Printf("  Project: %s\n", ui.Info("no project config"))
		return nil
	}
	if projCfg.Linear.TeamKey != "" {
		fmt.Printf("  Team:   %s\n", projCfg.Linear.TeamKey)
	}
	cycle, err := lc.GetActiveCycle(projCfg.Linear.TeamID)
	if err != nil {
		fmt.Printf("  Active cycle: %s\n", ui.Info("none"))
		return nil
	}
	fmt.Printf("  Active cycle: %s (%s → %s)\n",
		cycle.Name,
		cycle.StartsAt.Format("Jan 2"),
		cycle.EndsAt.Format("Jan 2"))
	return nil
}
