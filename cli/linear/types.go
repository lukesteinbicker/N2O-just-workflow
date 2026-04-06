package linear

import "time"

// Issue represents a Linear issue (parent or sub-issue).
type Issue struct {
	ID          string
	Identifier  string // "ENG-42"
	Title       string
	Description string
	BranchName  string // Linear's suggested branch name
	URL         string
	State       WorkflowState
	Assignee    *User
	Priority    int  // 0=None, 1=Urgent, 2=High, 3=Normal, 4=Low
	Estimate    *int // story points
	Parent      *Issue
	Children    []Issue
	Labels      []Label
	Cycle       *Cycle
	Project     *Project
	// Relations where this issue is the source (e.g. this blocks X).
	Relations []IssueRelation
	// Relations where this issue is the target (e.g. Y blocks this).
	InverseRelations []IssueRelation
	CreatedAt        time.Time
	UpdatedAt        time.Time
	CompletedAt      *time.Time
	StartedAt        *time.Time
}

// WorkflowState represents a Linear workflow state.
type WorkflowState struct {
	ID   string
	Name string // "Todo", "In Progress", "Done", etc.
	Type string // triage, backlog, unstarted, started, completed, canceled
}

// User represents a Linear workspace user.
type User struct {
	ID          string
	Name        string
	DisplayName string
	Email       string
	Active      bool
}

// Team represents a Linear team.
type Team struct {
	ID   string
	Key  string // e.g. "ENG"
	Name string
}

// Project represents a Linear project.
type Project struct {
	ID   string
	Name string
}

// Cycle represents a Linear cycle.
type Cycle struct {
	ID          string
	Name        string
	Description string
	StartsAt    time.Time
	EndsAt      time.Time
}

// Label represents an issue label.
type Label struct {
	ID   string
	Name string
}

// IssueRelation represents a relation between two issues.
type IssueRelation struct {
	ID    string
	Type  string // "blocks", "related", "duplicate"
	Issue *Issue // the other end of the relation
}

// IssueRelationType values.
const (
	RelationBlocks    = "blocks"
	RelationRelated   = "related"
	RelationDuplicate = "duplicate"
)

// GitAutomationState represents a team-configured git event → state mapping.
type GitAutomationState struct {
	ID            string
	BranchPattern string
	Event         string // start, draft, review, mergeable, merge
	State         WorkflowState
}

// CreateIssueInput is the input for creating an issue.
type CreateIssueInput struct {
	TeamID      string
	Title       string
	Description string
	ParentID    string // identifier or UUID; empty for top-level
	StateID     string
	CycleID     string
	ProjectID   string
	AssigneeID  string
	Priority    *int
	LabelIDs    []string
}

// UpdateIssueInput is the input for updating an issue.
type UpdateIssueInput struct {
	StateID    string
	AssigneeID string
	Title      string
	// Description replaces description. Nil = no change.
	Description *string
	Priority    *int
}

// CreateCycleInput is the input for creating a cycle.
type CreateCycleInput struct {
	TeamID      string
	Name        string
	Description string
	StartsAt    time.Time
	EndsAt      time.Time
}

// GitAutomationStateInput is the input for creating a git automation state.
type GitAutomationStateInput struct {
	TeamID        string
	BranchPattern string
	Event         string
	StateID       string
}

// IssueListOpts filters for ListIssues.
type IssueListOpts struct {
	CycleID    string // filter to a specific cycle
	ParentID   string // filter to children of a parent (identifier or UUID)
	StateName  string // filter by state name
	Unassigned bool
	Available  bool // preset: unassigned + Todo + no unresolved blockers
	MaxItems   int  // safety cap on total fetched; default 1000
}
