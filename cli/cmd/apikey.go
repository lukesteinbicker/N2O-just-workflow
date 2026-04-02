package cmd

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/lukes/n2o/internal/api"
	"github.com/lukes/n2o/internal/ui"
	"github.com/spf13/cobra"
)

var apikeyName string

var apikeyCmd = &cobra.Command{
	Use:   "apikey",
	Short: "Manage API keys",
}

var apikeyCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new API key",
	RunE:  runApikeyCreate,
}

var apikeyListCmd = &cobra.Command{
	Use:   "list",
	Short: "List API keys",
	RunE:  runApikeyList,
}

var apikeyRevokeCmd = &cobra.Command{
	Use:   "revoke",
	Short: "Revoke an API key",
	RunE:  runApikeyRevoke,
}

func init() {
	apikeyCreateCmd.Flags().StringVar(&apikeyName, "name", "", "name for the API key")
	_ = apikeyCreateCmd.MarkFlagRequired("name")

	apikeyRevokeCmd.Flags().StringVar(&apikeyName, "name", "", "name of the API key to revoke")
	_ = apikeyRevokeCmd.MarkFlagRequired("name")

	apikeyCmd.AddCommand(apikeyCreateCmd)
	apikeyCmd.AddCommand(apikeyListCmd)
	apikeyCmd.AddCommand(apikeyRevokeCmd)
	rootCmd.AddCommand(apikeyCmd)
}

func requireClient() (*api.Client, error) {
	client, err := api.NewFromConfig()
	if err != nil {
		return nil, fmt.Errorf("loading credentials: %w", err)
	}
	if client == nil {
		return nil, fmt.Errorf("not logged in — run 'n2o login' first")
	}
	return client, nil
}

func runApikeyCreate(cmd *cobra.Command, args []string) error {
	client, err := requireClient()
	if err != nil {
		return err
	}

	resp, err := client.Post("/api/auth/api-key/create", map[string]string{
		"name":  apikeyName,
		"scope": "project",
	})
	if err != nil {
		return fmt.Errorf("creating API key: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		return fmt.Errorf("server returned %d", resp.StatusCode)
	}

	var result struct {
		Key  string `json:"key"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decoding response: %w", err)
	}

	ui.PrintSuccess(fmt.Sprintf("Created API key: %s", result.Name))
	fmt.Println()
	fmt.Printf("  Key: %s\n", result.Key)
	fmt.Println()
	ui.PrintWarn("Save this key — it will not be shown again.")
	return nil
}

func runApikeyList(cmd *cobra.Command, args []string) error {
	client, err := requireClient()
	if err != nil {
		return err
	}

	resp, err := client.Get("/api/auth/api-key/list")
	if err != nil {
		return fmt.Errorf("listing API keys: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("server returned %d", resp.StatusCode)
	}

	var keys []struct {
		Name      string `json:"name"`
		Scope     string `json:"scope"`
		CreatedAt string `json:"created_at"`
		LastUsed  string `json:"last_used"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&keys); err != nil {
		return fmt.Errorf("decoding response: %w", err)
	}

	if len(keys) == 0 {
		ui.PrintInfo("No API keys found")
		return nil
	}

	fmt.Printf("%-20s %-10s %-20s %-20s\n",
		ui.Bold("Name"), ui.Bold("Scope"), ui.Bold("Created"), ui.Bold("Last Used"))
	fmt.Println(strings.Repeat("-", 70))

	for _, k := range keys {
		lastUsed := k.LastUsed
		if lastUsed == "" {
			lastUsed = "never"
		}
		fmt.Printf("%-20s %-10s %-20s %-20s\n", k.Name, k.Scope, k.CreatedAt, lastUsed)
	}
	fmt.Printf("\n%s\n", ui.Info(fmt.Sprintf("%d key(s)", len(keys))))
	return nil
}

func runApikeyRevoke(cmd *cobra.Command, args []string) error {
	client, err := requireClient()
	if err != nil {
		return err
	}

	resp, err := client.Post("/api/auth/api-key/revoke", map[string]string{
		"name": apikeyName,
	})
	if err != nil {
		return fmt.Errorf("revoking API key: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("server returned %d", resp.StatusCode)
	}

	ui.PrintSuccess(fmt.Sprintf("Revoked API key: %s", apikeyName))
	return nil
}
