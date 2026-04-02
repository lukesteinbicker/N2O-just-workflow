package cmd

import (
	"fmt"

	"n2o/cli/auth"
	"n2o/cli/ui"
	"github.com/spf13/cobra"
)

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate with the N2O platform",
	RunE:  runLogin,
}

func init() {
	rootCmd.AddCommand(loginCmd)
}

func runLogin(cmd *cobra.Command, args []string) error {
	ui.PrintHeader("N2O Login")
	fmt.Println()
	fmt.Println("Starting device authorization flow...")
	fmt.Println()

	creds, err := auth.DeviceFlowLogin(AppURL)
	if err != nil {
		return fmt.Errorf("login failed: %w", err)
	}

	if err := auth.Save(creds); err != nil {
		return fmt.Errorf("saving credentials: %w", err)
	}

	fmt.Println()
	ui.PrintSuccess("Logged in successfully")
	fmt.Printf("  User: %s\n", creds.UserID)
	fmt.Printf("  Org:  %s\n", creds.OrgID)
	if !creds.ExpiresAt.IsZero() {
		fmt.Printf("  Expires: %s\n", creds.ExpiresAt.Format("2006-01-02 15:04"))
	}
	return nil
}
