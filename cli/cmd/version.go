package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the N2O CLI version",
	RunE: func(cmd *cobra.Command, args []string) error {
		v := manifestVersion()
		if v == "" {
			v = Version
		}
		fmt.Println("n2o " + v)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}

// manifestVersion reads version from n2o-manifest.json in the current directory
// or framework path, returning "" if unavailable.
func manifestVersion() string {
	candidates := []string{"n2o-manifest.json"}

	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(cwd, "n2o-manifest.json"))
	}

	for _, path := range candidates {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var m struct {
			Version string `json:"version"`
		}
		if err := json.Unmarshal(data, &m); err == nil && m.Version != "" {
			return m.Version
		}
	}
	return ""
}
