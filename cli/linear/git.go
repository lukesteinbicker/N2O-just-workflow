package linear

import "fmt"

// ListGitAutomationStates returns all git automation states for a team.
func (c *Client) ListGitAutomationStates(teamID string) ([]GitAutomationState, error) {
	query := `query($teamId: String!) {
		team(id: $teamId) {
			gitAutomationStates {
				nodes {
					id branchPattern event
					state { id name type }
				}
			}
		}
	}`
	var out struct {
		Team struct {
			GitAutomationStates struct {
				Nodes []struct {
					ID            string `json:"id"`
					BranchPattern string `json:"branchPattern"`
					Event         string `json:"event"`
					State         *struct {
						ID   string `json:"id"`
						Name string `json:"name"`
						Type string `json:"type"`
					} `json:"state"`
				} `json:"nodes"`
			} `json:"gitAutomationStates"`
		} `json:"team"`
	}
	if err := c.exec(query, map[string]any{"teamId": teamID}, &out); err != nil {
		return nil, err
	}
	var result []GitAutomationState
	for _, n := range out.Team.GitAutomationStates.Nodes {
		gas := GitAutomationState{
			ID:            n.ID,
			BranchPattern: n.BranchPattern,
			Event:         n.Event,
		}
		if n.State != nil {
			gas.State = WorkflowState{ID: n.State.ID, Name: n.State.Name, Type: n.State.Type}
		}
		result = append(result, gas)
	}
	return result, nil
}

// CreateGitAutomationState creates a git automation state for a team.
func (c *Client) CreateGitAutomationState(in GitAutomationStateInput) error {
	query := `mutation($input: GitAutomationStateCreateInput!) {
		gitAutomationStateCreate(input: $input) { success }
	}`
	vars := map[string]any{
		"input": map[string]any{
			"teamId":        in.TeamID,
			"branchPattern": in.BranchPattern,
			"event":         in.Event,
			"stateId":       in.StateID,
		},
	}
	var out struct {
		GitAutomationStateCreate struct {
			Success bool `json:"success"`
		} `json:"gitAutomationStateCreate"`
	}
	if err := c.exec(query, vars, &out); err != nil {
		return err
	}
	if !out.GitAutomationStateCreate.Success {
		return fmt.Errorf("gitAutomationStateCreate failed")
	}
	return nil
}
