package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Event represents a single event to push or pull.
type Event struct {
	EventID   string          `json:"event_id"`
	EventType string          `json:"event_type"`
	Timestamp time.Time       `json:"timestamp"`
	Payload   json.RawMessage `json:"payload"`
}

// PushResult is the server response after pushing events.
type PushResult struct {
	Accepted int             `json:"accepted"`
	Rejected []RejectedEvent `json:"rejected"`
}

// RejectedEvent describes an event that the server refused to accept.
type RejectedEvent struct {
	EventID string `json:"event_id"`
	Reason  string `json:"reason"`
}

// PushEvents sends a batch of events to the remote project.
func PushEvents(client *Client, projectID string, events []Event) (*PushResult, error) {
	body := map[string]any{
		"events": events,
	}

	resp, err := client.Post(fmt.Sprintf("/api/projects/%s/events", projectID), body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("push events: server returned status %d", resp.StatusCode)
	}

	var result PushResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decoding push response: %w", err)
	}
	return &result, nil
}

// FlushPending queries unsynced events from the local database, pushes them
// to the remote, and marks them as synced. Returns the number of events flushed.
func FlushPending(client *Client, db *sql.DB, projectID string) (int, error) {
	rows, err := db.Query(`SELECT event_id, event_type, timestamp, payload FROM events WHERE synced_at IS NULL ORDER BY timestamp`)
	if err != nil {
		return 0, fmt.Errorf("querying pending events: %w", err)
	}
	defer rows.Close()

	var events []Event
	for rows.Next() {
		var e Event
		var ts string
		if err := rows.Scan(&e.EventID, &e.EventType, &ts, &e.Payload); err != nil {
			return 0, fmt.Errorf("scanning event: %w", err)
		}
		e.Timestamp, _ = time.Parse(time.RFC3339, ts)
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	if len(events) == 0 {
		return 0, nil
	}

	result, err := PushEvents(client, projectID, events)
	if err != nil {
		return 0, err
	}

	// Build set of rejected event IDs for quick lookup.
	rejected := make(map[string]bool, len(result.Rejected))
	for _, r := range result.Rejected {
		rejected[r.EventID] = true
	}

	// Mark accepted events as synced.
	now := time.Now().UTC().Format(time.RFC3339)
	for _, e := range events {
		if rejected[e.EventID] {
			continue
		}
		if _, err := db.Exec(`UPDATE events SET synced_at = ? WHERE event_id = ?`, now, e.EventID); err != nil {
			return 0, fmt.Errorf("updating synced_at for %s: %w", e.EventID, err)
		}
	}

	return result.Accepted, nil
}
