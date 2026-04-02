package task

import (
	"database/sql"
	"fmt"
	"time"
)

type Task struct {
	Sprint           string
	TaskNum          int
	Spec             string
	Title            string
	Description      string
	DoneWhen         string
	Status           string
	BlockedReason    string
	Type             string
	Owner            string
	Skills           string
	Priority         *float64
	Horizon          string
	EstimatedMinutes *float64
	Complexity       string
	CommitHash       string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

var validTransitions = map[string]map[string]bool{
	"pending": {"red": true, "blocked": true},
	"red":     {"green": true, "blocked": true},
	"green":   {"blocked": true},
	"blocked": {"pending": true},
}

func List(db *sql.DB, sprint, status string) ([]Task, error) {
	query := `SELECT sprint, task_num, title, COALESCE(description,''), COALESCE(done_when,''),
		status, COALESCE(type,''), COALESCE(owner,''), COALESCE(blocked_reason,''),
		COALESCE(horizon,'active'), COALESCE(complexity,'')
		FROM tasks WHERE sprint = ?`
	args := []any{sprint}

	if status != "" {
		query += " AND status = ?"
		args = append(args, status)
	}
	query += " ORDER BY COALESCE(priority, 999999)"

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanTasks(rows)
}

func Available(db *sql.DB, sprint string) ([]Task, error) {
	rows, err := db.Query(
		`SELECT sprint, task_num, title, COALESCE(description,''), COALESCE(done_when,''),
			status, COALESCE(type,''), COALESCE(owner,''), COALESCE(blocked_reason,''),
			COALESCE(horizon,'active'), COALESCE(complexity,'')
		FROM available_tasks WHERE sprint = ?`, sprint)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanTasks(rows)
}

func Claim(db *sql.DB, sprint string, taskNum int, owner string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var currentOwner sql.NullString
	var status string
	err = tx.QueryRow(
		"SELECT COALESCE(owner,''), status FROM tasks WHERE sprint = ? AND task_num = ?",
		sprint, taskNum,
	).Scan(&currentOwner, &status)
	if err != nil {
		return fmt.Errorf("task %s#%d not found", sprint, taskNum)
	}

	if currentOwner.String != "" && currentOwner.Valid {
		return fmt.Errorf("task %s#%d already claimed by %s", sprint, taskNum, currentOwner.String)
	}

	if status != "pending" {
		return fmt.Errorf("task %s#%d has status %q, must be pending to claim", sprint, taskNum, status)
	}

	_, err = tx.Exec(
		"UPDATE tasks SET owner = ? WHERE sprint = ? AND task_num = ?",
		owner, sprint, taskNum,
	)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func SetStatus(db *sql.DB, sprint string, taskNum int, status string) error {
	var current string
	err := db.QueryRow(
		"SELECT status FROM tasks WHERE sprint = ? AND task_num = ?",
		sprint, taskNum,
	).Scan(&current)
	if err != nil {
		return fmt.Errorf("task %s#%d not found", sprint, taskNum)
	}

	allowed, ok := validTransitions[current]
	if !ok || !allowed[status] {
		return fmt.Errorf("invalid transition: %s -> %s", current, status)
	}

	_, err = db.Exec(
		"UPDATE tasks SET status = ? WHERE sprint = ? AND task_num = ?",
		status, sprint, taskNum,
	)
	return err
}

func Block(db *sql.DB, sprint string, taskNum int, reason string) error {
	var current string
	err := db.QueryRow(
		"SELECT status FROM tasks WHERE sprint = ? AND task_num = ?",
		sprint, taskNum,
	).Scan(&current)
	if err != nil {
		return fmt.Errorf("task %s#%d not found", sprint, taskNum)
	}

	allowed := validTransitions[current]
	if !allowed["blocked"] {
		return fmt.Errorf("cannot block task in status %q", current)
	}

	_, err = db.Exec(
		"UPDATE tasks SET status = 'blocked', blocked_reason = ? WHERE sprint = ? AND task_num = ?",
		reason, sprint, taskNum,
	)
	return err
}

func Unblock(db *sql.DB, sprint string, taskNum int) error {
	var current string
	err := db.QueryRow(
		"SELECT status FROM tasks WHERE sprint = ? AND task_num = ?",
		sprint, taskNum,
	).Scan(&current)
	if err != nil {
		return fmt.Errorf("task %s#%d not found", sprint, taskNum)
	}

	if current != "blocked" {
		return fmt.Errorf("task %s#%d is not blocked (status: %s)", sprint, taskNum, current)
	}

	_, err = db.Exec(
		"UPDATE tasks SET status = 'pending', blocked_reason = NULL WHERE sprint = ? AND task_num = ?",
		sprint, taskNum,
	)
	return err
}

func RecordCommit(db *sql.DB, sprint string, taskNum int, hash string) error {
	_, err := db.Exec(
		"UPDATE tasks SET commit_hash = ? WHERE sprint = ? AND task_num = ?",
		hash, sprint, taskNum,
	)
	return err
}

func Create(db *sql.DB, t Task) error {
	_, err := db.Exec(
		`INSERT INTO tasks (sprint, task_num, spec, title, description, done_when, status, type, owner, skills, priority, horizon, estimated_minutes, complexity)
		 VALUES (?, ?, NULLIF(?,''), ?, NULLIF(?,''), NULLIF(?,''), ?, NULLIF(?,''), NULLIF(?,''), NULLIF(?,''), ?, COALESCE(NULLIF(?,''), 'active'), ?, NULLIF(?,''))`,
		t.Sprint, t.TaskNum, t.Spec, t.Title, t.Description, t.DoneWhen,
		coalesceStr(t.Status, "pending"), t.Type, t.Owner, t.Skills,
		t.Priority, t.Horizon, t.EstimatedMinutes, t.Complexity,
	)
	return err
}

func AddDep(db *sql.DB, sprint string, taskNum, dependsOn int) error {
	if taskNum == dependsOn {
		return fmt.Errorf("task cannot depend on itself")
	}

	// Check for cycles by walking the dependency graph from dependsOn
	if err := checkCycle(db, sprint, dependsOn, taskNum); err != nil {
		return err
	}

	_, err := db.Exec(
		"INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES (?, ?, ?, ?)",
		sprint, taskNum, sprint, dependsOn,
	)
	return err
}

func Verify(db *sql.DB, sprint string, taskNum int) error {
	var status string
	err := db.QueryRow(
		"SELECT status FROM tasks WHERE sprint = ? AND task_num = ?",
		sprint, taskNum,
	).Scan(&status)
	if err != nil {
		return fmt.Errorf("task %s#%d not found", sprint, taskNum)
	}

	if status != "green" {
		return fmt.Errorf("task %s#%d must be green to verify (status: %s)", sprint, taskNum, status)
	}

	_, err = db.Exec(
		"UPDATE tasks SET verified = 1, verified_at = CURRENT_TIMESTAMP WHERE sprint = ? AND task_num = ?",
		sprint, taskNum,
	)
	return err
}

func checkCycle(db *sql.DB, sprint string, from, target int) error {
	visited := map[int]bool{from: true}
	queue := []int{from}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		rows, err := db.Query(
			"SELECT depends_on_task FROM task_dependencies WHERE sprint = ? AND task_num = ? AND depends_on_sprint = ?",
			sprint, current, sprint,
		)
		if err != nil {
			return err
		}

		for rows.Next() {
			var dep int
			if err := rows.Scan(&dep); err != nil {
				rows.Close()
				return err
			}
			if dep == target {
				rows.Close()
				return fmt.Errorf("adding dependency would create a cycle: %d -> ... -> %d -> %d", target, from, target)
			}
			if !visited[dep] {
				visited[dep] = true
				queue = append(queue, dep)
			}
		}
		rows.Close()
	}

	return nil
}

func scanTasks(rows *sql.Rows) ([]Task, error) {
	var tasks []Task
	for rows.Next() {
		var t Task
		if err := rows.Scan(
			&t.Sprint, &t.TaskNum, &t.Title, &t.Description, &t.DoneWhen,
			&t.Status, &t.Type, &t.Owner, &t.BlockedReason,
			&t.Horizon, &t.Complexity,
		); err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

func coalesceStr(s, fallback string) string {
	if s == "" {
		return fallback
	}
	return s
}
