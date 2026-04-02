package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
)

// PullResult is the server response when pulling events.
type PullResult struct {
	Events  []Event `json:"events"`
	Cursor  string  `json:"cursor"`
	HasMore bool    `json:"has_more"`
}

// StateResult is the server response when pulling full state.
type StateResult struct {
	Tasks        []json.RawMessage `json:"tasks"`
	Dependencies []json.RawMessage `json:"dependencies"`
	AsOfEvent    string            `json:"as_of_event"`
}

// PullEvents fetches events from the remote project, optionally starting after
// sinceEventID and limited to limit results.
func PullEvents(client *Client, projectID, sinceEventID string, limit int) (*PullResult, error) {
	params := url.Values{}
	params.Set("user", "me")
	if sinceEventID != "" {
		params.Set("since", sinceEventID)
	}
	if limit > 0 {
		params.Set("limit", strconv.Itoa(limit))
	}

	path := fmt.Sprintf("/api/projects/%s/events?%s", projectID, params.Encode())
	resp, err := client.Get(path)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("pull events: server returned status %d", resp.StatusCode)
	}

	var result PullResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decoding pull response: %w", err)
	}
	return &result, nil
}

// PullState fetches the full current state snapshot for the project.
func PullState(client *Client, projectID string) (*StateResult, error) {
	path := fmt.Sprintf("/api/projects/%s/state?user=me", projectID)
	resp, err := client.Get(path)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("pull state: server returned status %d", resp.StatusCode)
	}

	var result StateResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decoding state response: %w", err)
	}
	return &result, nil
}

// ApplyEvents inserts pulled events into the local database, skipping any
// events whose event_id already exists.
func ApplyEvents(db *sql.DB, events []Event) error {
	for _, e := range events {
		_, err := db.Exec(
			`INSERT OR IGNORE INTO events (event_id, event_type, timestamp, payload) VALUES (?, ?, ?, ?)`,
			e.EventID, e.EventType, e.Timestamp.Format("2006-01-02T15:04:05Z07:00"), string(e.Payload),
		)
		if err != nil {
			return fmt.Errorf("inserting event %s: %w", e.EventID, err)
		}
	}
	return nil
}
