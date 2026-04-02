package event

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Generate creates a new event in the local event table.
// It reads user_id from credentials (NULL if not logged in) and project_id
// from .pm/config.json in the current directory.
func Generate(db *sql.DB, eventType string, payload any) error {
	eventID, err := newUUID()
	if err != nil {
		return fmt.Errorf("generating event ID: %w", err)
	}

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encoding payload: %w", err)
	}

	userID := loadUserID()
	projectID := loadProjectID()
	now := time.Now().UTC().Format(time.RFC3339)

	_, err = db.Exec(
		`INSERT INTO events (event_id, event_type, timestamp, payload, user_id, project_id) VALUES (?, ?, ?, ?, ?, ?)`,
		eventID, eventType, now, string(payloadJSON), nullString(userID), nullString(projectID),
	)
	if err != nil {
		return fmt.Errorf("inserting event: %w", err)
	}

	return nil
}

// newUUID generates a random UUID v4.
func newUUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant 10
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}

// loadUserID reads the user_id from ~/.n2o/credentials.json.
// Returns empty string if credentials are unavailable.
func loadUserID() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	data, err := os.ReadFile(filepath.Join(home, ".n2o", "credentials.json"))
	if err != nil {
		return ""
	}
	var creds struct {
		UserID string `json:"user_id"`
	}
	if json.Unmarshal(data, &creds) != nil {
		return ""
	}
	return creds.UserID
}

// loadProjectID reads the project_id from .pm/config.json in the working directory.
// Returns empty string if the config is unavailable.
func loadProjectID() string {
	data, err := os.ReadFile(filepath.Join(".pm", "config.json"))
	if err != nil {
		return ""
	}
	var cfg struct {
		ProjectID string `json:"project_id"`
	}
	if json.Unmarshal(data, &cfg) != nil {
		return ""
	}
	return cfg.ProjectID
}

// nullString converts an empty string to a sql.NullString (NULL), otherwise valid.
func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
