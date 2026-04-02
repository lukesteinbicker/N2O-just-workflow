package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// Version is set at build time via ldflags:
//
//	go build -ldflags "-X github.com/lukes/n2o/cmd/n2o/cmd.Version=1.0.0"
var Version = "dev"

// Quiet suppresses non-essential output when set.
var Quiet bool

var rootCmd = &cobra.Command{
	Use:     "n2o",
	Short:   "N2O workflow CLI",
	Version: Version,
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		// Lazy init will come later.
	},
}

func init() {
	rootCmd.PersistentFlags().BoolVarP(&Quiet, "quiet", "q", false, "suppress non-essential output")
}

// Execute runs the root command.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// resolveProjectPath returns the project path from the flag, positional arg, or cwd.
func resolveProjectPath(cmd *cobra.Command, args []string) (string, error) {
	if len(args) > 0 {
		return args[0], nil
	}
	return os.Getwd()
}

// dbPath returns the tasks.db path for a given project.
func dbPath(projectPath string) string {
	return projectPath + "/.pm/tasks.db"
}
