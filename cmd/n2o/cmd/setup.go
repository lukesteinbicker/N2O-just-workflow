package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/lukes/n2o/internal/config"
	"github.com/lukes/n2o/internal/ui"
	"github.com/spf13/cobra"
)

var setupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Interactive first-time setup",
	RunE:  runSetup,
}

func init() {
	rootCmd.AddCommand(setupCmd)
}

func runSetup(cmd *cobra.Command, args []string) error {
	reader := bufio.NewReader(os.Stdin)

	ui.PrintHeader("N2O Setup")
	fmt.Println()

	// Determine default framework path.
	defaultPath := ""
	if cwd, err := os.Getwd(); err == nil {
		if _, err := os.Stat(cwd + "/n2o-manifest.json"); err == nil {
			defaultPath = cwd
		}
	}

	// Prompt for framework path.
	if defaultPath != "" {
		fmt.Printf("Framework path [%s]: ", defaultPath)
	} else {
		fmt.Print("Framework path: ")
	}
	frameworkPath, _ := reader.ReadString('\n')
	frameworkPath = strings.TrimSpace(frameworkPath)
	if frameworkPath == "" {
		frameworkPath = defaultPath
	}
	if frameworkPath == "" {
		return fmt.Errorf("framework path is required")
	}

	// Prompt for developer name.
	fmt.Print("Developer name: ")
	devName, _ := reader.ReadString('\n')
	devName = strings.TrimSpace(devName)
	if devName == "" {
		return fmt.Errorf("developer name is required")
	}

	cfg := &config.GlobalConfig{
		FrameworkPath: frameworkPath,
		DeveloperName: devName,
	}
	if err := config.SaveGlobal(cfg); err != nil {
		return fmt.Errorf("saving config: %w", err)
	}

	fmt.Println()
	ui.PrintSuccess("Config saved to ~/.n2o/config.json")
	return nil
}
