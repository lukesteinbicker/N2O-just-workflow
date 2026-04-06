package linear

// GetMe returns the currently authenticated Linear user.
func (c *Client) GetMe() (*User, error) {
	query := `query { viewer { id name displayName email active } }`
	var out struct {
		Viewer struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			DisplayName string `json:"displayName"`
			Email       string `json:"email"`
			Active      bool   `json:"active"`
		} `json:"viewer"`
	}
	if err := c.exec(query, nil, &out); err != nil {
		return nil, err
	}
	return &User{
		ID:          out.Viewer.ID,
		Name:        out.Viewer.Name,
		DisplayName: out.Viewer.DisplayName,
		Email:       out.Viewer.Email,
		Active:      out.Viewer.Active,
	}, nil
}

// ListTeams returns teams the authenticated key can access.
func (c *Client) ListTeams() ([]Team, error) {
	query := `query($first: Int!, $after: String) {
		teams(first: $first, after: $after) {
			nodes { id key name }
			pageInfo { hasNextPage endCursor }
		}
	}`
	var all []Team
	var cursor string
	for {
		vars := map[string]any{"first": maxPageSize}
		if cursor != "" {
			vars["after"] = cursor
		}
		var out struct {
			Teams struct {
				Nodes []struct {
					ID   string `json:"id"`
					Key  string `json:"key"`
					Name string `json:"name"`
				} `json:"nodes"`
				PageInfo struct {
					HasNextPage bool   `json:"hasNextPage"`
					EndCursor   string `json:"endCursor"`
				} `json:"pageInfo"`
			} `json:"teams"`
		}
		if err := c.exec(query, vars, &out); err != nil {
			return nil, err
		}
		for _, t := range out.Teams.Nodes {
			all = append(all, Team{ID: t.ID, Key: t.Key, Name: t.Name})
		}
		if !out.Teams.PageInfo.HasNextPage {
			break
		}
		cursor = out.Teams.PageInfo.EndCursor
	}
	return all, nil
}

// ListProjects returns projects belonging to a team.
func (c *Client) ListProjects(teamID string) ([]Project, error) {
	query := `query($teamId: String!, $first: Int!, $after: String) {
		team(id: $teamId) {
			projects(first: $first, after: $after) {
				nodes { id name }
				pageInfo { hasNextPage endCursor }
			}
		}
	}`
	var all []Project
	var cursor string
	for {
		vars := map[string]any{"teamId": teamID, "first": maxPageSize}
		if cursor != "" {
			vars["after"] = cursor
		}
		var out struct {
			Team struct {
				Projects struct {
					Nodes []struct {
						ID   string `json:"id"`
						Name string `json:"name"`
					} `json:"nodes"`
					PageInfo struct {
						HasNextPage bool   `json:"hasNextPage"`
						EndCursor   string `json:"endCursor"`
					} `json:"pageInfo"`
				} `json:"projects"`
			} `json:"team"`
		}
		if err := c.exec(query, vars, &out); err != nil {
			return nil, err
		}
		for _, p := range out.Team.Projects.Nodes {
			all = append(all, Project{ID: p.ID, Name: p.Name})
		}
		if !out.Team.Projects.PageInfo.HasNextPage {
			break
		}
		cursor = out.Team.Projects.PageInfo.EndCursor
	}
	return all, nil
}

// GetWorkflowStates returns all workflow states configured for a team.
func (c *Client) GetWorkflowStates(teamID string) ([]WorkflowState, error) {
	query := `query($teamId: String!) {
		team(id: $teamId) {
			states(first: 100) {
				nodes { id name type }
			}
		}
	}`
	var out struct {
		Team struct {
			States struct {
				Nodes []struct {
					ID   string `json:"id"`
					Name string `json:"name"`
					Type string `json:"type"`
				} `json:"nodes"`
			} `json:"states"`
		} `json:"team"`
	}
	if err := c.exec(query, map[string]any{"teamId": teamID}, &out); err != nil {
		return nil, err
	}
	states := make([]WorkflowState, 0, len(out.Team.States.Nodes))
	for _, s := range out.Team.States.Nodes {
		states = append(states, WorkflowState{ID: s.ID, Name: s.Name, Type: s.Type})
	}
	return states, nil
}
