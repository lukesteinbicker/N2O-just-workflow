package cmd

import (
	"fmt"
	"sort"
	"strings"

	"n2o/cli/config"
	"n2o/cli/linear"
	"n2o/cli/ui"
	"github.com/spf13/cobra"
)

// Flags for the `issue` subcommands.
var (
	issueListCycle      string
	issueListParent     string
	issueListState      string
	issueListUnassigned bool
	issueListAvailable  bool

	issueCreateTitle       string
	issueCreateParent      string
	issueCreateDescription string

	issueUpdateState   string
	issueUpdateAssign  string
	issueUpdateComment string

	issueRelateBlocks string
)

var issueCmd = &cobra.Command{
	Use:   "issue",
	Short: "Manage Linear issues",
}

func init() {
	rootCmd.AddCommand(issueCmd)
	issueCmd.AddCommand(issueListCmd)
	issueCmd.AddCommand(issueGetCmd)
	issueCmd.AddCommand(issueCreateCmd)
	issueCmd.AddCommand(issueUpdateCmd)
	issueCmd.AddCommand(issueRelateCmd)
}

// --- issue list ---

var issueListCmd = &cobra.Command{
	Use:   "list",
	Short: "List issues (defaults to active cycle)",
	RunE:  runIssueList,
}

func init() {
	issueListCmd.Flags().StringVar(&issueListCycle, "cycle", "", "cycle name (default: active cycle)")
	issueListCmd.Flags().StringVar(&issueListParent, "parent", "", "list children of this parent issue")
	issueListCmd.Flags().StringVar(&issueListState, "state", "", "filter by workflow state name")
	issueListCmd.Flags().BoolVar(&issueListUnassigned, "unassigned", false, "only unassigned issues")
	issueListCmd.Flags().BoolVar(&issueListAvailable, "available", false, "unassigned + Todo + no unresolved blockers")
}

func runIssueList(cmd *cobra.Command, args []string) error {
	lc, err := requireLinear()
	if err != nil {
		return err
	}
	_, cfg, err := loadProjectConfig()
	if err != nil {
		return err
	}

	opts := linear.IssueListOpts{
		ParentID:   issueListParent,
		StateName:  issueListState,
		Unassigned: issueListUnassigned,
		Available:  issueListAvailable,
	}

	// When listing by parent, parent's children query runs directly.
	// Otherwise filter by cycle — default to active cycle.
	if issueListParent == "" {
		cycleID, err := resolveCycleID(lc, cfg, issueListCycle)
		if err != nil {
			return err
		}
		opts.CycleID = cycleID
	}

	issues, err := lc.ListIssues(cfg.Linear.TeamID, opts)
	if err != nil {
		return err
	}
	printIssues(issues)
	return nil
}

// resolveCycleID returns the cycle UUID for a given name, or the active cycle
// when name is empty.
func resolveCycleID(lc *linear.Client, cfg *config.ProjectConfig, name string) (string, error) {
	teamID := cfg.Linear.TeamID
	if name == "" {
		cycle, err := lc.GetActiveCycle(teamID)
		if err != nil {
			return "", err
		}
		return cycle.ID, nil
	}
	cycles, err := lc.ListCycles(teamID)
	if err != nil {
		return "", err
	}
	for _, c := range cycles {
		if c.Name == name {
			return c.ID, nil
		}
	}
	return "", fmt.Errorf("cycle %q not found", name)
}

// --- issue get ---

var issueGetCmd = &cobra.Command{
	Use:   "get <identifier>",
	Short: "Show a single issue",
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
		printIssueDetail(issue)
		return nil
	},
}

// --- issue create ---

var issueCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new issue (top-level or sub-issue)",
	RunE: func(cmd *cobra.Command, args []string) error {
		lc, err := requireLinear()
		if err != nil {
			return err
		}
		_, cfg, err := loadProjectConfig()
		if err != nil {
			return err
		}
		cycle, err := lc.GetActiveCycle(cfg.Linear.TeamID)
		if err != nil {
			return err
		}
		stateID := ""
		if cfg.Linear.StateMapping != nil {
			stateID = cfg.Linear.StateMapping["Todo"]
		}
		in := linear.CreateIssueInput{
			TeamID:      cfg.Linear.TeamID,
			Title:       issueCreateTitle,
			Description: issueCreateDescription,
			ParentID:    issueCreateParent,
			CycleID:     cycle.ID,
			ProjectID:   cfg.Linear.ProjectID,
			StateID:     stateID,
		}
		issue, err := lc.CreateIssue(in)
		if err != nil {
			return err
		}
		ui.PrintSuccess(fmt.Sprintf("Created %s: %s", issue.Identifier, issue.Title))
		return nil
	},
}

func init() {
	issueCreateCmd.Flags().StringVar(&issueCreateTitle, "title", "", "issue title (required)")
	issueCreateCmd.Flags().StringVar(&issueCreateParent, "parent", "", "parent issue identifier (creates a sub-issue)")
	issueCreateCmd.Flags().StringVar(&issueCreateDescription, "description", "", "issue description (markdown)")
	_ = issueCreateCmd.MarkFlagRequired("title")
}

// --- issue update ---

var issueUpdateCmd = &cobra.Command{
	Use:   "update <identifier>",
	Short: "Update an issue's state, assignee, or add a comment",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		lc, err := requireLinear()
		if err != nil {
			return err
		}
		_, cfg, err := loadProjectConfig()
		if err != nil {
			return err
		}
		identifier := args[0]

		in := linear.UpdateIssueInput{}
		if issueUpdateState != "" {
			stateID, ok := cfg.Linear.StateMapping[issueUpdateState]
			if !ok {
				return fmt.Errorf("unknown state %q — valid states: %s",
					issueUpdateState, validStateNames(cfg.Linear.StateMapping))
			}
			in.StateID = stateID
		}
		if issueUpdateAssign != "" {
			id, err := resolveAssignee(lc, issueUpdateAssign)
			if err != nil {
				return err
			}
			in.AssigneeID = id
		}

		if in.StateID != "" || in.AssigneeID != "" {
			if _, err := lc.UpdateIssue(identifier, in); err != nil {
				return err
			}
		}
		if issueUpdateComment != "" {
			if err := lc.AddComment(identifier, issueUpdateComment); err != nil {
				return err
			}
		}
		ui.PrintSuccess(fmt.Sprintf("Updated %s", identifier))
		return nil
	},
}

func init() {
	issueUpdateCmd.Flags().StringVar(&issueUpdateState, "state", "", "new workflow state name (e.g. \"In Progress\")")
	issueUpdateCmd.Flags().StringVar(&issueUpdateAssign, "assign", "", "assignee name/email or \"me\"")
	issueUpdateCmd.Flags().StringVar(&issueUpdateComment, "comment", "", "add a comment")
}

// resolveAssignee returns a user ID for "me" or a literal user identifier.
// For now, non-"me" values are passed through verbatim to Linear.
func resolveAssignee(lc *linear.Client, value string) (string, error) {
	if strings.EqualFold(value, "me") {
		me, err := lc.GetMe()
		if err != nil {
			return "", err
		}
		return me.ID, nil
	}
	return value, nil
}

// --- issue relate ---

var issueRelateCmd = &cobra.Command{
	Use:   "relate <identifier>",
	Short: "Create a relation between two issues",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		lc, err := requireLinear()
		if err != nil {
			return err
		}
		if issueRelateBlocks == "" {
			return fmt.Errorf("--blocks is required")
		}
		if err := lc.CreateIssueRelation(args[0], issueRelateBlocks, linear.RelationBlocks); err != nil {
			return err
		}
		ui.PrintSuccess(fmt.Sprintf("%s now blocks %s", args[0], issueRelateBlocks))
		return nil
	},
}

func init() {
	issueRelateCmd.Flags().StringVar(&issueRelateBlocks, "blocks", "", "identifier of the issue being blocked")
	_ = issueRelateCmd.MarkFlagRequired("blocks")
}

// --- printing helpers ---

func printIssues(issues []linear.Issue) {
	if len(issues) == 0 {
		ui.PrintInfo("No issues found")
		return
	}
	fmt.Printf("%-12s %-14s %-18s %s\n",
		ui.Bold("ID"), ui.Bold("State"), ui.Bold("Assignee"), ui.Bold("Title"))
	fmt.Println(strings.Repeat("-", 78))
	for _, is := range issues {
		state := stateColor(is.State.Name, is.State.Type)
		assignee := "-"
		if is.Assignee != nil {
			assignee = is.Assignee.DisplayName
			if assignee == "" {
				assignee = is.Assignee.Name
			}
		}
		title := is.Title
		if len(title) > 40 {
			title = title[:37] + "..."
		}
		fmt.Printf("%-12s %-14s %-18s %s\n", is.Identifier, state, assignee, title)
	}
	fmt.Printf("\n%s\n", ui.Info(fmt.Sprintf("%d issue(s)", len(issues))))
}

func printIssueDetail(is *linear.Issue) {
	fmt.Printf("%s  %s\n", ui.Bold(is.Identifier), is.Title)
	fmt.Printf("  State:    %s\n", stateColor(is.State.Name, is.State.Type))
	if is.Assignee != nil {
		fmt.Printf("  Assignee: %s\n", is.Assignee.DisplayName)
	} else {
		fmt.Printf("  Assignee: %s\n", ui.Info("unassigned"))
	}
	if is.Parent != nil {
		fmt.Printf("  Parent:   %s  %s\n", is.Parent.Identifier, is.Parent.Title)
	}
	if is.Cycle != nil {
		fmt.Printf("  Cycle:    %s\n", is.Cycle.Name)
	}
	if is.Estimate != nil {
		fmt.Printf("  Estimate: %d\n", *is.Estimate)
	}
	if is.Priority > 0 {
		fmt.Printf("  Priority: %s\n", priorityName(is.Priority))
	}
	if len(is.Labels) > 0 {
		names := make([]string, len(is.Labels))
		for i, l := range is.Labels {
			names[i] = l.Name
		}
		fmt.Printf("  Labels:   %s\n", strings.Join(names, ", "))
	}
	if len(is.Relations) > 0 {
		fmt.Println(ui.Bold("  Blocks:"))
		for _, rel := range is.Relations {
			if rel.Type == linear.RelationBlocks && rel.Issue != nil {
				fmt.Printf("    %s (%s)\n", rel.Issue.Identifier, rel.Issue.State.Name)
			}
		}
	}
	if len(is.InverseRelations) > 0 {
		var blockers []string
		for _, rel := range is.InverseRelations {
			if rel.Type == linear.RelationBlocks && rel.Issue != nil {
				blockers = append(blockers, fmt.Sprintf("%s (%s)", rel.Issue.Identifier, rel.Issue.State.Name))
			}
		}
		if len(blockers) > 0 {
			fmt.Printf("  %s %s\n", ui.Bold("Blocked by:"), strings.Join(blockers, ", "))
		}
	}
	if is.Description != "" {
		fmt.Println()
		fmt.Println(is.Description)
	}
}

func stateColor(name, stateType string) string {
	switch stateType {
	case "completed":
		return ui.Success(name)
	case "canceled":
		return ui.Info(name)
	case "started":
		if strings.EqualFold(name, "blocked") {
			return ui.Warn(name)
		}
		return ui.Error(name)
	default:
		return ui.Info(name)
	}
}

func priorityName(p int) string {
	switch p {
	case 1:
		return "Urgent"
	case 2:
		return "High"
	case 3:
		return "Normal"
	case 4:
		return "Low"
	default:
		return "None"
	}
}

func validStateNames(m map[string]string) string {
	names := make([]string, 0, len(m))
	for k := range m {
		names = append(names, k)
	}
	sort.Strings(names)
	return strings.Join(names, ", ")
}

