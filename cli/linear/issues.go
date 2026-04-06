package linear

import (
	"fmt"
	"strings"
	"time"
)

// raw GraphQL shapes (match Linear's schema, converted to our types after fetch)

type rawIssue struct {
	ID          string     `json:"id"`
	Identifier  string     `json:"identifier"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	BranchName  string     `json:"branchName"`
	URL         string     `json:"url"`
	Priority    float64    `json:"priority"`
	Estimate    *float64   `json:"estimate"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	StartedAt   *time.Time `json:"startedAt"`
	CompletedAt *time.Time `json:"completedAt"`
	State       *struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Type string `json:"type"`
	} `json:"state"`
	Assignee *struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		DisplayName string `json:"displayName"`
		Email       string `json:"email"`
	} `json:"assignee"`
	Parent *struct {
		ID         string `json:"id"`
		Identifier string `json:"identifier"`
		Title      string `json:"title"`
	} `json:"parent"`
	Cycle *struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"cycle"`
	Project *struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"project"`
	Labels *struct {
		Nodes []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"nodes"`
	} `json:"labels"`
	Relations *struct {
		Nodes []struct {
			ID           string `json:"id"`
			Type         string `json:"type"`
			RelatedIssue struct {
				ID         string `json:"id"`
				Identifier string `json:"identifier"`
				State      *struct {
					Type string `json:"type"`
					Name string `json:"name"`
				} `json:"state"`
			} `json:"relatedIssue"`
		} `json:"nodes"`
	} `json:"relations"`
	InverseRelations *struct {
		Nodes []struct {
			ID    string `json:"id"`
			Type  string `json:"type"`
			Issue struct {
				ID         string `json:"id"`
				Identifier string `json:"identifier"`
				State      *struct {
					Type string `json:"type"`
					Name string `json:"name"`
				} `json:"state"`
			} `json:"issue"`
		} `json:"nodes"`
	} `json:"inverseRelations"`
}

func (r *rawIssue) toIssue() Issue {
	out := Issue{
		ID:          r.ID,
		Identifier:  r.Identifier,
		Title:       r.Title,
		Description: r.Description,
		BranchName:  r.BranchName,
		URL:         r.URL,
		Priority:    int(r.Priority),
		CreatedAt:   r.CreatedAt,
		UpdatedAt:   r.UpdatedAt,
		StartedAt:   r.StartedAt,
		CompletedAt: r.CompletedAt,
	}
	if r.Estimate != nil {
		v := int(*r.Estimate)
		out.Estimate = &v
	}
	if r.State != nil {
		out.State = WorkflowState{ID: r.State.ID, Name: r.State.Name, Type: r.State.Type}
	}
	if r.Assignee != nil {
		out.Assignee = &User{
			ID:          r.Assignee.ID,
			Name:        r.Assignee.Name,
			DisplayName: r.Assignee.DisplayName,
			Email:       r.Assignee.Email,
			Active:      true,
		}
	}
	if r.Parent != nil {
		out.Parent = &Issue{ID: r.Parent.ID, Identifier: r.Parent.Identifier, Title: r.Parent.Title}
	}
	if r.Cycle != nil {
		out.Cycle = &Cycle{ID: r.Cycle.ID, Name: r.Cycle.Name}
	}
	if r.Project != nil {
		out.Project = &Project{ID: r.Project.ID, Name: r.Project.Name}
	}
	if r.Labels != nil {
		for _, l := range r.Labels.Nodes {
			out.Labels = append(out.Labels, Label{ID: l.ID, Name: l.Name})
		}
	}
	if r.Relations != nil {
		for _, rel := range r.Relations.Nodes {
			ir := IssueRelation{ID: rel.ID, Type: rel.Type}
			ir.Issue = &Issue{ID: rel.RelatedIssue.ID, Identifier: rel.RelatedIssue.Identifier}
			if rel.RelatedIssue.State != nil {
				ir.Issue.State = WorkflowState{Type: rel.RelatedIssue.State.Type, Name: rel.RelatedIssue.State.Name}
			}
			out.Relations = append(out.Relations, ir)
		}
	}
	if r.InverseRelations != nil {
		for _, rel := range r.InverseRelations.Nodes {
			ir := IssueRelation{ID: rel.ID, Type: rel.Type}
			ir.Issue = &Issue{ID: rel.Issue.ID, Identifier: rel.Issue.Identifier}
			if rel.Issue.State != nil {
				ir.Issue.State = WorkflowState{Type: rel.Issue.State.Type, Name: rel.Issue.State.Name}
			}
			out.InverseRelations = append(out.InverseRelations, ir)
		}
	}
	return out
}

const issueFields = `
id identifier title description branchName url priority estimate
createdAt updatedAt startedAt completedAt
state { id name type }
assignee { id name displayName email }
parent { id identifier title }
cycle { id name }
project { id name }
labels { nodes { id name } }
relations { nodes { id type relatedIssue { id identifier state { type name } } } }
inverseRelations { nodes { id type issue { id identifier state { type name } } } }
`

// GetIssue fetches a single issue by identifier or UUID.
func (c *Client) GetIssue(idOrIdentifier string) (*Issue, error) {
	query := `query($id: String!) { issue(id: $id) { ` + issueFields + ` } }`
	var out struct {
		Issue *rawIssue `json:"issue"`
	}
	if err := c.exec(query, map[string]any{"id": idOrIdentifier}, &out); err != nil {
		return nil, err
	}
	if out.Issue == nil {
		return nil, fmt.Errorf("issue %s not found", idOrIdentifier)
	}
	issue := out.Issue.toIssue()
	return &issue, nil
}

// ListIssues returns issues filtered by opts. Pagination is handled transparently.
// When opts.ParentID is set, returns that parent's children.
// Otherwise uses team-level filter with cycle/state/assignee filters.
func (c *Client) ListIssues(teamID string, opts IssueListOpts) ([]Issue, error) {
	max := opts.MaxItems
	if max <= 0 {
		max = defaultMaxItems
	}

	if opts.ParentID != "" {
		return c.listChildren(opts.ParentID, max)
	}

	// Build filter object
	filter := map[string]any{}
	if opts.CycleID != "" {
		filter["cycle"] = map[string]any{"id": map[string]any{"eq": opts.CycleID}}
	}
	if opts.Available || opts.Unassigned {
		filter["assignee"] = map[string]any{"null": true}
	}
	if opts.StateName != "" {
		filter["state"] = map[string]any{"name": map[string]any{"eq": opts.StateName}}
	} else if opts.Available {
		filter["state"] = map[string]any{"name": map[string]any{"eq": "Todo"}}
	}

	query := `query($teamId: String!, $first: Int!, $after: String, $filter: IssueFilter) {
		team(id: $teamId) {
			issues(first: $first, after: $after, filter: $filter) {
				nodes { ` + issueFields + ` }
				pageInfo { hasNextPage endCursor }
			}
		}
	}`

	var all []Issue
	var cursor string
	for {
		vars := map[string]any{
			"teamId": teamID,
			"first":  maxPageSize,
			"filter": filter,
		}
		if cursor != "" {
			vars["after"] = cursor
		}
		var out struct {
			Team struct {
				Issues struct {
					Nodes    []rawIssue `json:"nodes"`
					PageInfo struct {
						HasNextPage bool   `json:"hasNextPage"`
						EndCursor   string `json:"endCursor"`
					} `json:"pageInfo"`
				} `json:"issues"`
			} `json:"team"`
		}
		if err := c.exec(query, vars, &out); err != nil {
			return nil, err
		}
		for i := range out.Team.Issues.Nodes {
			all = append(all, out.Team.Issues.Nodes[i].toIssue())
			if len(all) >= max {
				return filterAvailable(all, opts), nil
			}
		}
		if !out.Team.Issues.PageInfo.HasNextPage {
			break
		}
		cursor = out.Team.Issues.PageInfo.EndCursor
	}
	return filterAvailable(all, opts), nil
}

// filterAvailable removes issues with unresolved blocking relations when
// opts.Available is set.
func filterAvailable(issues []Issue, opts IssueListOpts) []Issue {
	if !opts.Available {
		return issues
	}
	out := issues[:0]
	for _, is := range issues {
		if hasUnresolvedBlocker(is) {
			continue
		}
		out = append(out, is)
	}
	return out
}

func hasUnresolvedBlocker(is Issue) bool {
	for _, rel := range is.InverseRelations {
		if rel.Type != RelationBlocks || rel.Issue == nil {
			continue
		}
		t := rel.Issue.State.Type
		if t != "completed" && t != "canceled" {
			return true
		}
	}
	return false
}

func (c *Client) listChildren(parentIDOrIdentifier string, max int) ([]Issue, error) {
	query := `query($id: String!, $first: Int!, $after: String) {
		issue(id: $id) {
			children(first: $first, after: $after) {
				nodes { ` + issueFields + ` }
				pageInfo { hasNextPage endCursor }
			}
		}
	}`

	var all []Issue
	var cursor string
	for {
		vars := map[string]any{
			"id":    parentIDOrIdentifier,
			"first": maxPageSize,
		}
		if cursor != "" {
			vars["after"] = cursor
		}
		var out struct {
			Issue *struct {
				Children struct {
					Nodes    []rawIssue `json:"nodes"`
					PageInfo struct {
						HasNextPage bool   `json:"hasNextPage"`
						EndCursor   string `json:"endCursor"`
					} `json:"pageInfo"`
				} `json:"children"`
			} `json:"issue"`
		}
		if err := c.exec(query, vars, &out); err != nil {
			return nil, err
		}
		if out.Issue == nil {
			return nil, fmt.Errorf("parent issue %s not found", parentIDOrIdentifier)
		}
		for i := range out.Issue.Children.Nodes {
			all = append(all, out.Issue.Children.Nodes[i].toIssue())
			if len(all) >= max {
				return all, nil
			}
		}
		if !out.Issue.Children.PageInfo.HasNextPage {
			break
		}
		cursor = out.Issue.Children.PageInfo.EndCursor
	}
	return all, nil
}

// CreateIssue creates a new issue (parent or sub-issue).
func (c *Client) CreateIssue(in CreateIssueInput) (*Issue, error) {
	input := map[string]any{
		"teamId": in.TeamID,
		"title":  in.Title,
	}
	if in.Description != "" {
		input["description"] = in.Description
	}
	if in.ParentID != "" {
		input["parentId"] = in.ParentID
	}
	if in.StateID != "" {
		input["stateId"] = in.StateID
	}
	if in.CycleID != "" {
		input["cycleId"] = in.CycleID
	}
	if in.ProjectID != "" {
		input["projectId"] = in.ProjectID
	}
	if in.AssigneeID != "" {
		input["assigneeId"] = in.AssigneeID
	}
	if in.Priority != nil {
		input["priority"] = *in.Priority
	}
	if len(in.LabelIDs) > 0 {
		input["labelIds"] = in.LabelIDs
	}

	query := `mutation($input: IssueCreateInput!) {
		issueCreate(input: $input) {
			success
			issue { ` + issueFields + ` }
		}
	}`
	var out struct {
		IssueCreate struct {
			Success bool      `json:"success"`
			Issue   *rawIssue `json:"issue"`
		} `json:"issueCreate"`
	}
	if err := c.exec(query, map[string]any{"input": input}, &out); err != nil {
		return nil, err
	}
	if !out.IssueCreate.Success || out.IssueCreate.Issue == nil {
		return nil, fmt.Errorf("issueCreate failed")
	}
	issue := out.IssueCreate.Issue.toIssue()
	return &issue, nil
}

// UpdateIssue updates an issue's mutable fields.
func (c *Client) UpdateIssue(idOrIdentifier string, in UpdateIssueInput) (*Issue, error) {
	input := map[string]any{}
	if in.StateID != "" {
		input["stateId"] = in.StateID
	}
	if in.AssigneeID != "" {
		input["assigneeId"] = in.AssigneeID
	}
	if in.Title != "" {
		input["title"] = in.Title
	}
	if in.Description != nil {
		input["description"] = *in.Description
	}
	if in.Priority != nil {
		input["priority"] = *in.Priority
	}
	if len(input) == 0 {
		return c.GetIssue(idOrIdentifier)
	}

	query := `mutation($id: String!, $input: IssueUpdateInput!) {
		issueUpdate(id: $id, input: $input) {
			success
			issue { ` + issueFields + ` }
		}
	}`
	var out struct {
		IssueUpdate struct {
			Success bool      `json:"success"`
			Issue   *rawIssue `json:"issue"`
		} `json:"issueUpdate"`
	}
	if err := c.exec(query, map[string]any{"id": idOrIdentifier, "input": input}, &out); err != nil {
		return nil, err
	}
	if !out.IssueUpdate.Success || out.IssueUpdate.Issue == nil {
		return nil, fmt.Errorf("issueUpdate failed")
	}
	issue := out.IssueUpdate.Issue.toIssue()
	return &issue, nil
}

// CreateIssueRelation creates a relation between two issues.
// relType should be one of RelationBlocks, RelationRelated, RelationDuplicate.
func (c *Client) CreateIssueRelation(issueID, relatedIssueID, relType string) error {
	relType = strings.ToLower(relType)
	query := `mutation($input: IssueRelationCreateInput!) {
		issueRelationCreate(input: $input) { success }
	}`
	vars := map[string]any{
		"input": map[string]any{
			"issueId":        issueID,
			"relatedIssueId": relatedIssueID,
			"type":           relType,
		},
	}
	var out struct {
		IssueRelationCreate struct {
			Success bool `json:"success"`
		} `json:"issueRelationCreate"`
	}
	if err := c.exec(query, vars, &out); err != nil {
		return err
	}
	if !out.IssueRelationCreate.Success {
		return fmt.Errorf("issueRelationCreate failed")
	}
	return nil
}

// AddComment adds a comment to an issue.
func (c *Client) AddComment(issueID, body string) error {
	query := `mutation($input: CommentCreateInput!) {
		commentCreate(input: $input) { success }
	}`
	vars := map[string]any{
		"input": map[string]any{
			"issueId": issueID,
			"body":    body,
		},
	}
	var out struct {
		CommentCreate struct {
			Success bool `json:"success"`
		} `json:"commentCreate"`
	}
	if err := c.exec(query, vars, &out); err != nil {
		return err
	}
	if !out.CommentCreate.Success {
		return fmt.Errorf("commentCreate failed")
	}
	return nil
}
