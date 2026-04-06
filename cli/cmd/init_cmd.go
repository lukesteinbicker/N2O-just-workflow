package cmd

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"n2o/cli/adapter"
	"n2o/cli/api"
	"n2o/cli/auth"
	"n2o/cli/config"
	"n2o/cli/linear"
	"n2o/cli/ui"
	"github.com/spf13/cobra"
)

var initCmd = &cobra.Command{
	Use:   "init [project-path]",
	Short: "Initialize a new N2O project",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runInit,
}

func init() {
	rootCmd.AddCommand(initCmd)
}

func runInit(cmd *cobra.Command, args []string) error {
	projectPath := "."
	if len(args) > 0 {
		projectPath = args[0]
	}

	ui.PrintHeader("N2O Project Setup")
	fmt.Println()

	// Step 1: Authenticate if needed.
	if !auth.IsLoggedIn() {
		ui.PrintInfo("Not logged in — starting authentication...")
		fmt.Println()
		newCreds, err := auth.DeviceFlowLogin(AppURL)
		if err != nil {
			return fmt.Errorf("authentication failed: %w", err)
		}
		if err := auth.Save(newCreds); err != nil {
			return fmt.Errorf("saving credentials: %w", err)
		}
		ui.PrintSuccess("Authenticated")
		fmt.Println()
	}

	// Step 2: Confirm we have a Linear key from the login response.
	creds, _ := auth.Load()
	if creds == nil {
		return fmt.Errorf("credentials disappeared unexpectedly")
	}
	if creds.LinearAPIKey == "" {
		return fmt.Errorf("login response did not include a Linear API key — contact your N2O admin")
	}

	// Step 3: Validate Linear key + identify user.
	lc := linear.New(creds.LinearAPIKey)
	me, err := lc.GetMe()
	if err != nil {
		return fmt.Errorf("validating Linear key: %w", err)
	}

	client, err := api.NewFromConfig()
	if err != nil {
		return fmt.Errorf("creating API client: %w", err)
	}
	if client == nil {
		return fmt.Errorf("not authenticated — run 'n2o login' first")
	}
	ui.PrintSuccess(fmt.Sprintf("Connected to Linear as %s", me.DisplayName))
	fmt.Println()

	// Step 4: Download framework content.
	ui.PrintInfo("Downloading framework...")
	bundle, err := api.DownloadFramework(client)
	if err != nil {
		return fmt.Errorf("download framework: %w", err)
	}

	// Step 5: Select AI tool.
	allAdapters := adapter.All()
	options := make([]ui.SelectOption, len(allAdapters))
	for i, a := range allAdapters {
		options[i] = ui.SelectOption{Label: a.Label(), Value: a.Name()}
	}
	fmt.Println()
	toolName, err := ui.Select("AI tool:", options)
	if err != nil {
		return fmt.Errorf("selecting AI tool: %w", err)
	}
	AI, err = adapter.Get(toolName)
	if err != nil {
		return err
	}
	fmt.Println()

	// Step 6: Select Linear team.
	teams, err := lc.ListTeams()
	if err != nil {
		return fmt.Errorf("list Linear teams: %w", err)
	}
	if len(teams) == 0 {
		return fmt.Errorf("no Linear teams accessible with this API key")
	}
	teamOptions := make([]ui.SelectOption, len(teams))
	for i, t := range teams {
		teamOptions[i] = ui.SelectOption{Label: fmt.Sprintf("%s — %s", t.Key, t.Name), Value: t.ID}
	}
	teamID, err := ui.Select("Linear team:", teamOptions)
	if err != nil {
		return err
	}
	var selectedTeam linear.Team
	for _, t := range teams {
		if t.ID == teamID {
			selectedTeam = t
			break
		}
	}
	fmt.Println()

	// Step 7: Select Linear project (optional).
	var selectedProject *linear.Project
	projects, err := lc.ListProjects(teamID)
	if err == nil && len(projects) > 0 {
		projOpts := make([]ui.SelectOption, len(projects)+1)
		projOpts[0] = ui.SelectOption{Label: "(none)", Value: ""}
		for i, p := range projects {
			projOpts[i+1] = ui.SelectOption{Label: p.Name, Value: p.ID}
		}
		projID, err := ui.Select("Linear project (optional):", projOpts)
		if err != nil {
			return err
		}
		if projID != "" {
			for i := range projects {
				if projects[i].ID == projID {
					selectedProject = &projects[i]
					break
				}
			}
		}
		fmt.Println()
	}

	// Step 8: Fetch and store workflow states for the team.
	states, err := lc.GetWorkflowStates(teamID)
	if err != nil {
		return fmt.Errorf("fetch workflow states: %w", err)
	}
	stateMapping := make(map[string]string, len(states))
	for _, s := range states {
		stateMapping[s.Name] = s.ID
	}
	ui.PrintSuccess(fmt.Sprintf("Loaded %d workflow states", len(states)))
	fmt.Println()

	// Step 9: Create directory structure + write framework files.
	skillsDir := AI.SkillsDir()
	dirs := []string{".pm", filepath.Dir(skillsDir), skillsDir}
	for _, dir := range dirs {
		target := filepath.Join(projectPath, dir)
		if err := os.MkdirAll(target, 0o755); err != nil {
			return fmt.Errorf("create directory %s: %w", dir, err)
		}
	}
	for _, f := range bundle.Files {
		// Skip legacy schema/migration files — no more local DB.
		if strings.HasPrefix(f.Path, ".pm/migrations/") || f.Path == ".pm/schema.sql" {
			continue
		}
		targetPath := filepath.Join(projectPath, f.Path)
		if _, err := os.Stat(targetPath); err == nil {
			if !Quiet {
				fmt.Printf("  skipped %s (already exists)\n", f.Path)
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return fmt.Errorf("create parent for %s: %w", f.Path, err)
		}
		if err := os.WriteFile(targetPath, []byte(f.Content), 0o644); err != nil {
			return fmt.Errorf("write %s: %w", f.Path, err)
		}
		if !Quiet {
			fmt.Printf("  created %s\n", f.Path)
		}
	}

	// Step 10: Ensure developer name is set (used as fallback for branch naming).
	gcfg, _ := config.LoadGlobal()
	if gcfg == nil || gcfg.DeveloperName == "" {
		fmt.Println()
		fmt.Print("Developer name: ")
		reader := bufio.NewReader(os.Stdin)
		name, _ := reader.ReadString('\n')
		name = strings.TrimSpace(name)
		if name != "" {
			if gcfg == nil {
				gcfg = &config.GlobalConfig{}
			}
			gcfg.DeveloperName = name
			if err := config.SaveGlobal(gcfg); err != nil {
				return fmt.Errorf("saving global config: %w", err)
			}
		}
	}

	// Step 11: Save project config.
	projCfg, _ := config.LoadProject(projectPath)
	if projCfg == nil {
		projCfg = &config.ProjectConfig{}
	}
	projCfg.N2OVersion = bundle.Version
	projCfg.AITool = AI.Name()
	if projCfg.Linear == nil {
		projCfg.Linear = &config.LinearConfig{}
	}
	projCfg.Linear.TeamID = selectedTeam.ID
	projCfg.Linear.TeamKey = selectedTeam.Key
	projCfg.Linear.TeamName = selectedTeam.Name
	if selectedProject != nil {
		projCfg.Linear.ProjectID = selectedProject.ID
		projCfg.Linear.ProjectName = selectedProject.Name
	}
	projCfg.Linear.StateMapping = stateMapping
	if err := config.SaveProject(projectPath, projCfg); err != nil {
		return fmt.Errorf("save project config: %w", err)
	}

	// Step 12: Write AI tool permission allowlist.
	if err := AI.WritePermissions(projectPath); err != nil {
		return fmt.Errorf("write permissions: %w", err)
	}

	fmt.Println()
	ui.PrintSuccess("Project initialized successfully")
	return nil
}
