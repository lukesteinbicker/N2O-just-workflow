package cmd

import (
	"fmt"
	"os"
	"time"

	"github.com/lukes/n2o/internal/auth"
	"github.com/lukes/n2o/internal/db"
	"github.com/lukes/n2o/internal/ui"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show CLI status: auth, events, and sync",
	RunE:  runStatus,
}

func init() {
	rootCmd.AddCommand(statusCmd)
}

func runStatus(cmd *cobra.Command, args []string) error {
	ui.PrintHeader("N2O Status")
	fmt.Println()

	// --- Auth ---
	fmt.Println(ui.Bold("Auth"))
	creds, err := auth.Load()
	if err != nil {
		fmt.Printf("  Status: %s\n", ui.Error("error loading credentials"))
	} else if creds == nil {
		fmt.Printf("  Status: %s\n", ui.Warn("not logged in"))
	} else if auth.IsExpired(creds) {
		fmt.Printf("  Status: %s\n", ui.Error("expired"))
		fmt.Printf("  User:   %s\n", creds.UserID)
		fmt.Printf("  Org:    %s\n", creds.OrgID)
		fmt.Printf("  Expired: %s\n", creds.ExpiresAt.Format(time.RFC3339))
	} else {
		fmt.Printf("  Status: %s\n", ui.Success("logged in"))
		fmt.Printf("  User:   %s\n", creds.UserID)
		fmt.Printf("  Org:    %s\n", creds.OrgID)
		if !creds.ExpiresAt.IsZero() {
			fmt.Printf("  Expires: %s\n", creds.ExpiresAt.Format(time.RFC3339))
		}
	}
	fmt.Println()

	// --- Pending events ---
	fmt.Println(ui.Bold("Events"))
	projectPath, _ := os.Getwd()
	dbFile := dbPath(projectPath)
	if _, err := os.Stat(dbFile); err != nil {
		fmt.Printf("  Pending: %s\n", ui.Info("no database found"))
	} else {
		database, err := db.Open(dbFile)
		if err != nil {
			fmt.Printf("  Pending: %s\n", ui.Error("error opening database"))
		} else {
			defer database.Close()
			var count int
			err = database.QueryRow("SELECT COUNT(*) FROM events WHERE synced = 0").Scan(&count)
			if err != nil {
				// Table might not exist.
				fmt.Printf("  Pending: %s\n", ui.Info("no events table"))
			} else {
				label := ui.Success(fmt.Sprintf("%d", count))
				if count > 0 {
					label = ui.Warn(fmt.Sprintf("%d", count))
				}
				fmt.Printf("  Pending: %s unsynced event(s)\n", label)
			}
		}
	}
	fmt.Println()

	// --- Last sync ---
	fmt.Println(ui.Bold("Sync"))
	if _, err := os.Stat(dbFile); err != nil {
		fmt.Printf("  Last sync: %s\n", ui.Info("n/a"))
	} else {
		database, err := db.Open(dbFile)
		if err != nil {
			fmt.Printf("  Last sync: %s\n", ui.Error("error"))
		} else {
			defer database.Close()
			var lastSync *string
			err = database.QueryRow("SELECT MAX(synced_at) FROM events WHERE synced = 1").Scan(&lastSync)
			if err != nil || lastSync == nil {
				fmt.Printf("  Last sync: %s\n", ui.Info("never"))
			} else {
				fmt.Printf("  Last sync: %s\n", *lastSync)
			}
		}
	}

	return nil
}
