package cmd

import (
	"encoding/json"
	"fmt"
	"sort"

	"n2o/cli/linear"
	"n2o/cli/ui"
	"github.com/spf13/cobra"
)

var (
	statsJSON  bool
	statsCycle string
)

var statsCmd = &cobra.Command{
	Use:   "stats",
	Short: "Show cycle statistics from Linear",
	RunE:  runStats,
}

func init() {
	statsCmd.Flags().BoolVar(&statsJSON, "json", false, "output as JSON")
	statsCmd.Flags().StringVar(&statsCycle, "cycle", "", "cycle name (default: active cycle)")
	rootCmd.AddCommand(statsCmd)
}

type cycleStats struct {
	Cycle       string         `json:"cycle"`
	StartsAt    string         `json:"starts_at"`
	EndsAt      string         `json:"ends_at"`
	Total       int            `json:"total"`
	ByState     map[string]int `json:"by_state"`
	ParentRollup []parentStat   `json:"parents,omitempty"`
}

type parentStat struct {
	Identifier string `json:"identifier"`
	Title      string `json:"title"`
	Total      int    `json:"total"`
	Done       int    `json:"done"`
}

func runStats(cmd *cobra.Command, args []string) error {
	lc, err := requireLinear()
	if err != nil {
		return err
	}
	_, cfg, err := loadProjectConfig()
	if err != nil {
		return err
	}

	cycleID, err := resolveCycleID(lc, cfg, statsCycle)
	if err != nil {
		return err
	}
	cycles, err := lc.ListCycles(cfg.Linear.TeamID)
	if err != nil {
		return err
	}
	var cycle *linear.Cycle
	for i := range cycles {
		if cycles[i].ID == cycleID {
			cycle = &cycles[i]
			break
		}
	}

	issues, err := lc.ListIssues(cfg.Linear.TeamID, linear.IssueListOpts{CycleID: cycleID})
	if err != nil {
		return err
	}

	stats := cycleStats{
		Total:   len(issues),
		ByState: map[string]int{},
	}
	if cycle != nil {
		stats.Cycle = cycle.Name
		stats.StartsAt = cycle.StartsAt.Format("2006-01-02")
		stats.EndsAt = cycle.EndsAt.Format("2006-01-02")
	}

	parents := map[string]*parentStat{}
	for _, is := range issues {
		stats.ByState[is.State.Name]++
		if is.Parent != nil {
			ps, ok := parents[is.Parent.Identifier]
			if !ok {
				ps = &parentStat{Identifier: is.Parent.Identifier, Title: is.Parent.Title}
				parents[is.Parent.Identifier] = ps
			}
			ps.Total++
			if is.State.Type == "completed" {
				ps.Done++
			}
		}
	}
	for _, ps := range parents {
		stats.ParentRollup = append(stats.ParentRollup, *ps)
	}
	sort.Slice(stats.ParentRollup, func(i, j int) bool {
		return stats.ParentRollup[i].Identifier < stats.ParentRollup[j].Identifier
	})

	if statsJSON {
		data, err := json.MarshalIndent(stats, "", "  ")
		if err != nil {
			return err
		}
		fmt.Println(string(data))
		return nil
	}

	ui.PrintHeader("Cycle stats")
	fmt.Println()
	if stats.Cycle != "" {
		fmt.Printf("%s  (%s → %s)\n", ui.Bold(stats.Cycle), stats.StartsAt, stats.EndsAt)
	}
	fmt.Printf("Total issues: %d\n\n", stats.Total)

	if len(stats.ByState) > 0 {
		fmt.Println(ui.Bold("By state"))
		names := make([]string, 0, len(stats.ByState))
		for name := range stats.ByState {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			fmt.Printf("  %-14s %d\n", name, stats.ByState[name])
		}
	}

	if len(stats.ParentRollup) > 0 {
		fmt.Println()
		fmt.Println(ui.Bold("Parent rollup"))
		for _, ps := range stats.ParentRollup {
			fmt.Printf("  %s  %d/%d  %s\n", ps.Identifier, ps.Done, ps.Total, ps.Title)
		}
	}
	return nil
}
