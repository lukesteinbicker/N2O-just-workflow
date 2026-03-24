package cmd

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/lukes/n2o/internal/ui"
	"github.com/spf13/cobra"
)

var (
	asyncFile    string
	asyncConfirm bool
)

var asyncCmd = &cobra.Command{
	Use:   "async",
	Short: "Run workflows asynchronously via GitHub Actions",
}

var asyncRunCmd = &cobra.Command{
	Use:   "run [prompt]",
	Short: "Dispatch an async workflow",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runAsyncRun,
}

var asyncListCmd = &cobra.Command{
	Use:   "list",
	Short: "List recent async workflow runs",
	RunE:  runAsyncList,
}

var asyncCancelCmd = &cobra.Command{
	Use:   "cancel <run-id>",
	Short: "Cancel an async workflow run",
	Args:  cobra.ExactArgs(1),
	RunE:  runAsyncCancel,
}

func init() {
	asyncRunCmd.Flags().StringVar(&asyncFile, "file", "", "read prompt from a file")
	asyncRunCmd.Flags().BoolVarP(&asyncConfirm, "yes", "y", false, "skip confirmation")

	asyncCmd.AddCommand(asyncRunCmd)
	asyncCmd.AddCommand(asyncListCmd)
	asyncCmd.AddCommand(asyncCancelCmd)
	rootCmd.AddCommand(asyncCmd)
}

func requireGH() error {
	if _, err := exec.LookPath("gh"); err != nil {
		return fmt.Errorf("gh CLI is required but not found in PATH — install from https://cli.github.com")
	}
	return nil
}

func getRepoFromRemote() (string, error) {
	out, err := exec.Command("git", "remote", "get-url", "origin").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("could not determine repo from git remote: %w", err)
	}

	remote := strings.TrimSpace(string(out))

	// Parse owner/repo from various remote formats.
	// SSH: git@github.com:owner/repo.git
	// HTTPS: https://github.com/owner/repo.git
	remote = strings.TrimSuffix(remote, ".git")

	if strings.Contains(remote, ":") && strings.HasPrefix(remote, "git@") {
		parts := strings.SplitN(remote, ":", 2)
		if len(parts) == 2 {
			return parts[1], nil
		}
	}

	if strings.Contains(remote, "github.com/") {
		idx := strings.Index(remote, "github.com/")
		return remote[idx+len("github.com/"):], nil
	}

	return "", fmt.Errorf("could not parse owner/repo from remote: %s", remote)
}

func runAsyncRun(cmd *cobra.Command, args []string) error {
	if err := requireGH(); err != nil {
		return err
	}

	var prompt string
	if asyncFile != "" {
		data, err := os.ReadFile(asyncFile)
		if err != nil {
			return fmt.Errorf("reading prompt file: %w", err)
		}
		prompt = strings.TrimSpace(string(data))
	} else if len(args) > 0 {
		prompt = args[0]
	} else {
		return fmt.Errorf("provide a prompt as an argument or via --file")
	}

	if prompt == "" {
		return fmt.Errorf("prompt cannot be empty")
	}

	repo, err := getRepoFromRemote()
	if err != nil {
		return err
	}

	if !asyncConfirm {
		fmt.Printf("Dispatch async job to %s?\n", ui.Bold(repo))
		fmt.Printf("Prompt: %s\n\n", prompt)
		fmt.Print("Continue? [y/N] ")
		reader := bufio.NewReader(os.Stdin)
		answer, _ := reader.ReadString('\n')
		answer = strings.TrimSpace(strings.ToLower(answer))
		if answer != "y" && answer != "yes" {
			fmt.Println("Cancelled.")
			return nil
		}
	}

	// Dispatch via gh api.
	payload := fmt.Sprintf(`{"event_type":"n2o-async","client_payload":{"prompt":%q}}`, prompt)

	ghCmd := exec.Command("gh", "api",
		fmt.Sprintf("repos/%s/dispatches", repo),
		"--method", "POST",
		"--input", "-",
	)
	ghCmd.Stdin = strings.NewReader(payload)
	ghCmd.Stdout = os.Stdout
	ghCmd.Stderr = os.Stderr

	if err := ghCmd.Run(); err != nil {
		return fmt.Errorf("dispatching workflow: %w", err)
	}

	ui.PrintSuccess("Job submitted")
	fmt.Printf("  Repo: %s\n", repo)
	fmt.Printf("  View runs: gh run list --workflow=n2o-async.yml\n")
	return nil
}

func runAsyncList(cmd *cobra.Command, args []string) error {
	if err := requireGH(); err != nil {
		return err
	}

	ghCmd := exec.Command("gh", "run", "list", "--workflow=n2o-async.yml")
	ghCmd.Stdout = os.Stdout
	ghCmd.Stderr = os.Stderr
	return ghCmd.Run()
}

func runAsyncCancel(cmd *cobra.Command, args []string) error {
	if err := requireGH(); err != nil {
		return err
	}

	runID := args[0]
	ghCmd := exec.Command("gh", "run", "cancel", runID)
	ghCmd.Stdout = os.Stdout
	ghCmd.Stderr = os.Stderr

	if err := ghCmd.Run(); err != nil {
		return fmt.Errorf("cancelling run %s: %w", runID, err)
	}

	ui.PrintSuccess(fmt.Sprintf("Cancelled run %s", runID))
	return nil
}
