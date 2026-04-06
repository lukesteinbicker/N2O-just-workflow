package cmd

import (
	"fmt"
	"os/exec"
	"strings"

	"n2o/cli/linear"
	"n2o/cli/ui"
	"github.com/spf13/cobra"
)

var commitIssue string

var commitCmd = &cobra.Command{
	Use:   "commit",
	Short: "Create a conventional commit for a Linear issue",
	RunE:  runCommit,
}

func init() {
	commitCmd.Flags().StringVar(&commitIssue, "issue", "", "issue identifier (e.g. ENG-42)")
	_ = commitCmd.MarkFlagRequired("issue")
	rootCmd.AddCommand(commitCmd)
}

func runCommit(cmd *cobra.Command, args []string) error {
	lc, err := requireLinear()
	if err != nil {
		return err
	}
	projectPath, _, err := loadProjectConfig()
	if err != nil {
		return err
	}

	issue, err := lc.GetIssue(commitIssue)
	if err != nil {
		return err
	}

	// Conventional commit type + scope from labels.
	commitType, scope := inferCommitTypeScope(issue)
	msg := fmt.Sprintf("%s(%s): %s", commitType, scope, issue.Title)

	// Trailer: "Fixes ENG-42" so GitHub auto-closes on merge (Linear picks it up too).
	trailer := fmt.Sprintf("Fixes %s", issue.Identifier)
	fullMsg := msg + "\n\n" + trailer

	gitCmd := exec.Command("git", "commit", "-m", fullMsg)
	gitCmd.Dir = projectPath
	output, err := gitCmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git commit failed: %s\n%w", string(output), err)
	}
	fmt.Print(string(output))
	ui.PrintSuccess(fmt.Sprintf("Committed for %s", issue.Identifier))
	return nil
}

// inferCommitTypeScope derives a conventional commit type and scope from a
// Linear issue's labels. Defaults: feat / task.
func inferCommitTypeScope(issue *linear.Issue) (commitType, scope string) {
	commitType = "feat"
	scope = "task"
	for _, l := range issue.Labels {
		name := strings.ToLower(l.Name)
		switch name {
		case "docs":
			commitType, scope = "docs", "docs"
		case "infra", "chore":
			commitType, scope = "chore", "infra"
		case "e2e", "test":
			commitType, scope = "test", "e2e"
		case "fix", "bug":
			commitType = "fix"
		case "database", "frontend", "backend", "api", "agent":
			scope = name
		}
	}
	return commitType, scope
}
