package cmd

import (
	"github.com/lukes/n2o/internal/auth"
	"github.com/lukes/n2o/internal/ui"
	"github.com/spf13/cobra"
)

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Log out of the N2O platform",
	RunE:  runLogout,
}

func init() {
	rootCmd.AddCommand(logoutCmd)
}

func runLogout(cmd *cobra.Command, args []string) error {
	if err := auth.Clear(); err != nil {
		return err
	}
	ui.PrintSuccess("Logged out")
	return nil
}
