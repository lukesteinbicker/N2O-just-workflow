package linear

import (
	"fmt"
	"time"
)

type rawCycle struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	StartsAt    time.Time `json:"startsAt"`
	EndsAt      time.Time `json:"endsAt"`
}

func (r *rawCycle) toCycle() *Cycle {
	return &Cycle{
		ID:          r.ID,
		Name:        r.Name,
		Description: r.Description,
		StartsAt:    r.StartsAt,
		EndsAt:      r.EndsAt,
	}
}

const cycleFields = `id name description startsAt endsAt`

// GetActiveCycle returns the team's current active cycle.
func (c *Client) GetActiveCycle(teamID string) (*Cycle, error) {
	query := `query($teamId: String!) {
		team(id: $teamId) {
			activeCycle { ` + cycleFields + ` }
		}
	}`
	var out struct {
		Team struct {
			ActiveCycle *rawCycle `json:"activeCycle"`
		} `json:"team"`
	}
	if err := c.exec(query, map[string]any{"teamId": teamID}, &out); err != nil {
		return nil, err
	}
	if out.Team.ActiveCycle == nil {
		return nil, fmt.Errorf("no active cycle for team")
	}
	return out.Team.ActiveCycle.toCycle(), nil
}

// ListCycles returns all cycles for a team.
func (c *Client) ListCycles(teamID string) ([]Cycle, error) {
	query := `query($teamId: String!, $first: Int!, $after: String) {
		team(id: $teamId) {
			cycles(first: $first, after: $after) {
				nodes { ` + cycleFields + ` }
				pageInfo { hasNextPage endCursor }
			}
		}
	}`
	var all []Cycle
	var cursor string
	for {
		vars := map[string]any{"teamId": teamID, "first": maxPageSize}
		if cursor != "" {
			vars["after"] = cursor
		}
		var out struct {
			Team struct {
				Cycles struct {
					Nodes    []rawCycle `json:"nodes"`
					PageInfo struct {
						HasNextPage bool   `json:"hasNextPage"`
						EndCursor   string `json:"endCursor"`
					} `json:"pageInfo"`
				} `json:"cycles"`
			} `json:"team"`
		}
		if err := c.exec(query, vars, &out); err != nil {
			return nil, err
		}
		for i := range out.Team.Cycles.Nodes {
			all = append(all, *out.Team.Cycles.Nodes[i].toCycle())
		}
		if !out.Team.Cycles.PageInfo.HasNextPage {
			break
		}
		cursor = out.Team.Cycles.PageInfo.EndCursor
	}
	return all, nil
}

// CreateCycle creates a new cycle for a team.
func (c *Client) CreateCycle(in CreateCycleInput) (*Cycle, error) {
	input := map[string]any{
		"teamId":   in.TeamID,
		"name":     in.Name,
		"startsAt": in.StartsAt.UTC().Format(time.RFC3339),
		"endsAt":   in.EndsAt.UTC().Format(time.RFC3339),
	}
	if in.Description != "" {
		input["description"] = in.Description
	}

	query := `mutation($input: CycleCreateInput!) {
		cycleCreate(input: $input) {
			success
			cycle { ` + cycleFields + ` }
		}
	}`
	var out struct {
		CycleCreate struct {
			Success bool      `json:"success"`
			Cycle   *rawCycle `json:"cycle"`
		} `json:"cycleCreate"`
	}
	if err := c.exec(query, map[string]any{"input": input}, &out); err != nil {
		return nil, err
	}
	if !out.CycleCreate.Success || out.CycleCreate.Cycle == nil {
		return nil, fmt.Errorf("cycleCreate failed")
	}
	return out.CycleCreate.Cycle.toCycle(), nil
}
