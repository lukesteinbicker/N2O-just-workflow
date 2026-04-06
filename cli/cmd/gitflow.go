package cmd

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"n2o/cli/linear"
	"n2o/cli/ui"
	"github.com/spf13/cobra"
)

// ---------- n2o branch ----------

var branchCmd = &cobra.Command{
	Use:   "branch <identifier>",
	Short: "Create and check out a branch for a Linear issue",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		lc, err := requireLinear()
		if err != nil {
			return err
		}
		issue, err := lc.GetIssue(args[0])
		if err != nil {
			return err
		}
		name, err := branchNameFor(lc, issue)
		if err != nil {
			return err
		}
		if out, err := runGit("", "checkout", "-b", name); err != nil {
			return fmt.Errorf("git checkout failed: %s: %w", strings.TrimSpace(out), err)
		}
		ui.PrintSuccess(fmt.Sprintf("Checked out %s", name))
		return nil
	},
}

// ---------- n2o pr ----------

var prDraft bool

var prCmd = &cobra.Command{
	Use:   "pr",
	Short: "Create a GitHub PR pre-filled from the current Linear issue",
	RunE: func(cmd *cobra.Command, args []string) error {
		if _, err := exec.LookPath("gh"); err != nil {
			return fmt.Errorf("gh CLI not found — install https://cli.github.com")
		}
		branch, err := currentBranch()
		if err != nil {
			return err
		}
		identifier := extractIdentifier(branch)
		if identifier == "" {
			return fmt.Errorf("could not extract Linear identifier from branch %q", branch)
		}

		lc, err := requireLinear()
		if err != nil {
			return err
		}
		issue, err := lc.GetIssue(identifier)
		if err != nil {
			return err
		}

		title := fmt.Sprintf("[%s] %s", issue.Identifier, issue.Title)
		body := fmt.Sprintf("## %s\n\n%s\n\nFixes %s", issue.Title, issue.Description, issue.Identifier)

		ghArgs := []string{"pr", "create", "--title", title, "--body", body}
		if prDraft {
			ghArgs = append(ghArgs, "--draft")
		}
		ghCmd := exec.Command("gh", ghArgs...)
		ghCmd.Stdin = os.Stdin
		ghCmd.Stdout = os.Stdout
		ghCmd.Stderr = os.Stderr
		if err := ghCmd.Run(); err != nil {
			return fmt.Errorf("gh pr create failed: %w", err)
		}
		return nil
	},
}

func init() {
	prCmd.Flags().BoolVar(&prDraft, "draft", false, "create as a draft PR")
}

// ---------- n2o rebase ----------

var rebaseCmd = &cobra.Command{
	Use:   "rebase",
	Short: "Fetch origin and rebase current branch onto the default branch",
	RunE: func(cmd *cobra.Command, args []string) error {
		defaultBranch, err := detectDefaultBranch()
		if err != nil {
			return err
		}
		if out, err := runGit("", "fetch", "origin"); err != nil {
			return fmt.Errorf("git fetch failed: %s: %w", strings.TrimSpace(out), err)
		}
		out, err := runGit("", "rebase", "origin/"+defaultBranch)
		if err != nil {
			fmt.Print(out)
			ui.PrintError("Rebase failed — resolve conflicts, then:")
			fmt.Println("  git rebase --continue")
			fmt.Println("Or abort with:")
			fmt.Println("  git rebase --abort")
			return err
		}
		fmt.Print(out)
		ui.PrintSuccess(fmt.Sprintf("Rebased onto origin/%s", defaultBranch))
		return nil
	},
}

// ---------- n2o worktree ----------

var worktreeForce bool

var worktreeCmd = &cobra.Command{
	Use:   "worktree",
	Short: "Manage git worktrees tied to Linear issues",
}

var worktreeCreateCmd = &cobra.Command{
	Use:   "create <identifier>",
	Short: "Create a worktree for a Linear issue",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		lc, err := requireLinear()
		if err != nil {
			return err
		}
		issue, err := lc.GetIssue(args[0])
		if err != nil {
			return err
		}
		name, err := branchNameFor(lc, issue)
		if err != nil {
			return err
		}
		repoRoot, err := getRepoRoot()
		if err != nil {
			return err
		}
		dir := filepath.Join(filepath.Dir(repoRoot),
			fmt.Sprintf("%s-%s", strings.ToLower(issue.Identifier), slugify(issue.Title)))

		// Does branch exist?
		if _, err := runGit("", "rev-parse", "--verify", name); err == nil {
			if out, err := runGit("", "worktree", "add", dir, name); err != nil {
				return fmt.Errorf("git worktree add failed: %s: %w", strings.TrimSpace(out), err)
			}
		} else {
			if out, err := runGit("", "worktree", "add", "-b", name, dir); err != nil {
				return fmt.Errorf("git worktree add failed: %s: %w", strings.TrimSpace(out), err)
			}
		}
		ui.PrintSuccess(fmt.Sprintf("Created worktree at %s", dir))
		ui.PrintInfo(fmt.Sprintf("Branch: %s", name))
		if fileExists(filepath.Join(dir, "package.json")) {
			ui.PrintWarn(fmt.Sprintf("Install dependencies: cd %s && npm install", dir))
		}
		return nil
	},
}

var worktreeListCmd = &cobra.Command{
	Use:   "list",
	Short: "List worktrees with their Linear issue state",
	RunE: func(cmd *cobra.Command, args []string) error {
		worktrees, err := listWorktrees()
		if err != nil {
			return err
		}
		if len(worktrees) == 0 {
			ui.PrintInfo("No worktrees found")
			return nil
		}

		lc, _ := requireLinear()
		for _, w := range worktrees {
			identifier := extractIdentifier(w.Branch)
			stateLabel := ui.Info("—")
			var issueState string
			if identifier != "" && lc != nil {
				if is, err := lc.GetIssue(identifier); err == nil {
					stateLabel = stateColor(is.State.Name, is.State.Type)
					issueState = is.State.Type
				}
			}
			label := identifier
			if label == "" {
				label = "(no issue)"
			}
			fmt.Printf("  %-10s  %-18s  %s\n", label, stateLabel, w.Path)
			if issueState == "completed" || issueState == "canceled" {
				ui.PrintWarn(fmt.Sprintf("    %s is %s — consider removing: n2o worktree rm %s",
					identifier, issueState, identifier))
			}
		}
		return nil
	},
}

var worktreeRmCmd = &cobra.Command{
	Use:   "rm <identifier>",
	Short: "Remove a worktree for a Linear issue",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		worktrees, err := listWorktrees()
		if err != nil {
			return err
		}
		target := ""
		wanted := strings.ToLower(args[0])
		for _, w := range worktrees {
			if strings.Contains(strings.ToLower(w.Branch), wanted) {
				target = w.Path
				break
			}
		}
		if target == "" {
			return fmt.Errorf("no worktree found for %s", args[0])
		}

		// Safety: refuse if uncommitted changes unless --force.
		if !worktreeForce {
			if out, _ := runGit(target, "status", "--porcelain"); strings.TrimSpace(out) != "" {
				return fmt.Errorf("worktree %s has uncommitted changes — use --force to remove", target)
			}
		}

		gitArgs := []string{"worktree", "remove", target}
		if worktreeForce {
			gitArgs = append([]string{"worktree", "remove", "--force"}, target)
		}
		if out, err := runGit("", gitArgs...); err != nil {
			return fmt.Errorf("git worktree remove failed: %s: %w", strings.TrimSpace(out), err)
		}
		_, _ = runGit("", "worktree", "prune")
		ui.PrintSuccess(fmt.Sprintf("Removed worktree %s", target))
		return nil
	},
}

func init() {
	worktreeRmCmd.Flags().BoolVar(&worktreeForce, "force", false, "force removal even with uncommitted changes")
	worktreeCmd.AddCommand(worktreeCreateCmd)
	worktreeCmd.AddCommand(worktreeListCmd)
	worktreeCmd.AddCommand(worktreeRmCmd)

	rootCmd.AddCommand(branchCmd)
	rootCmd.AddCommand(prCmd)
	rootCmd.AddCommand(rebaseCmd)
	rootCmd.AddCommand(worktreeCmd)
}

// ---------- helpers ----------

func runGit(dir string, args ...string) (string, error) {
	c := exec.Command("git", args...)
	if dir != "" {
		c.Dir = dir
	}
	out, err := c.CombinedOutput()
	return string(out), err
}

func currentBranch() (string, error) {
	out, err := runGit("", "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", fmt.Errorf("get current branch: %w", err)
	}
	return strings.TrimSpace(out), nil
}

func getRepoRoot() (string, error) {
	out, err := runGit("", "rev-parse", "--show-toplevel")
	if err != nil {
		return "", fmt.Errorf("not inside a git repository")
	}
	return strings.TrimSpace(out), nil
}

// detectDefaultBranch returns the name of the remote HEAD (e.g. "main"),
// falling back to common names.
func detectDefaultBranch() (string, error) {
	if out, err := runGit("", "symbolic-ref", "refs/remotes/origin/HEAD"); err == nil {
		// refs/remotes/origin/main → main
		ref := strings.TrimSpace(out)
		parts := strings.Split(ref, "/")
		if len(parts) > 0 {
			return parts[len(parts)-1], nil
		}
	}
	for _, candidate := range []string{"main", "master", "develop"} {
		if _, err := runGit("", "rev-parse", "--verify", "origin/"+candidate); err == nil {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("could not detect default branch")
}

// branchNameFor returns Linear's suggested branch name or constructs one.
func branchNameFor(lc *linear.Client, issue *linear.Issue) (string, error) {
	if issue.BranchName != "" {
		return issue.BranchName, nil
	}
	me, err := lc.GetMe()
	if err != nil {
		return fmt.Sprintf("%s-%s", strings.ToLower(issue.Identifier), slugify(issue.Title)), nil
	}
	return fmt.Sprintf("%s/%s-%s", slugify(me.Name), strings.ToLower(issue.Identifier), slugify(issue.Title)), nil
}

var identifierRE = regexp.MustCompile(`(?i)([A-Z][A-Z0-9]+-\d+)`)

// extractIdentifier pulls a Linear identifier (e.g. "ENG-42") from a branch name.
func extractIdentifier(s string) string {
	m := identifierRE.FindString(s)
	if m == "" {
		return ""
	}
	return strings.ToUpper(m)
}

var slugRE = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	s = strings.ToLower(s)
	s = slugRE.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

type worktreeEntry struct {
	Path   string
	Branch string
}

// listWorktrees parses `git worktree list --porcelain`.
func listWorktrees() ([]worktreeEntry, error) {
	out, err := runGit("", "worktree", "list", "--porcelain")
	if err != nil {
		return nil, fmt.Errorf("git worktree list: %w", err)
	}
	var result []worktreeEntry
	var cur worktreeEntry
	scanner := bufio.NewScanner(strings.NewReader(out))
	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case strings.HasPrefix(line, "worktree "):
			if cur.Path != "" {
				result = append(result, cur)
			}
			cur = worktreeEntry{Path: strings.TrimPrefix(line, "worktree ")}
		case strings.HasPrefix(line, "branch "):
			cur.Branch = strings.TrimPrefix(line, "branch refs/heads/")
		}
	}
	if cur.Path != "" {
		result = append(result, cur)
	}
	return result, nil
}
