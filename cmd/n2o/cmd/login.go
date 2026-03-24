package cmd

import (
	"fmt"

	"github.com/lukes/n2o/internal/auth"
	"github.com/lukes/n2o/internal/ui"
	"github.com/spf13/cobra"
)

var loginURL string

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate with the N2O platform",
	RunE:  runLogin,
}

func init() {
	loginCmd.Flags().StringVar(&loginURL, "url", "", "N2O app URL (e.g. https://app.n2o.dev)")
	_ = loginCmd.MarkFlagRequired("url")
	rootCmd.AddCommand(loginCmd)
}

func runLogin(cmd *cobra.Command, args []string) error {
	ui.PrintHeader("N2O Login")
	fmt.Println()
	fmt.Println("Starting device authorization flow...")
	fmt.Println()

	creds, err := auth.DeviceFlowLogin(loginURL)
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
