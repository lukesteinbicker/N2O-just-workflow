package cmd

import (
	"fmt"

	"n2o/cli/config"
	"n2o/cli/ui"
	"github.com/spf13/cobra"
)

var pinCmd = &cobra.Command{
	Use:   "pin <version>",
	Short: "Pin project to a specific N2O version",
	Args:  cobra.ExactArgs(1),
	RunE:  runPin,
}

func init() {
	rootCmd.AddCommand(pinCmd)
}

func runPin(cmd *cobra.Command, args []string) error {
	version := args[0]

	projectPath, err := resolveProjectPath(cmd, []string{})
	if err != nil {
		return err
	}

	projCfg, err := config.LoadProject(projectPath)
	if err != nil {
		return fmt.Errorf("load project config: %w", err)
	}

	projCfg.N2OVersion = version
	if err := config.SaveProject(projectPath, projCfg); err != nil {
		return fmt.Errorf("save project config: %w", err)
	}

	ui.PrintSuccess(fmt.Sprintf("Pinned project to N2O version %s", version))
	return nil
}
