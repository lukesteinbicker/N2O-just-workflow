package auth

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// Credentials holds the authenticated user's token and metadata.
type Credentials struct {
	Token     string    `json:"token"`
	UserID    string    `json:"user_id"`
	OrgID     string    `json:"org_id"`
	AppURL    string    `json:"app_url"`
	ExpiresAt time.Time `json:"expires_at"`
}

// CredentialsPath returns the path to the credentials file (~/.n2o/credentials.json).
func CredentialsPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".n2o", "credentials.json")
}

// Load reads credentials from disk. Returns nil, nil if the file does not exist.
func Load() (*Credentials, error) {
	path := CredentialsPath()
	if path == "" {
		return nil, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var creds Credentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return nil, err
	}
	return &creds, nil
}

// Save writes credentials to disk, creating the directory if needed.
func Save(creds *Credentials) error {
	path := CredentialsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(creds, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o600)
}

// Clear deletes the credentials file. Returns nil if the file does not exist.
func Clear() error {
	path := CredentialsPath()
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// IsExpired reports whether the credentials token has expired.
func IsExpired(creds *Credentials) bool {
	if creds == nil {
		return true
	}
	if creds.ExpiresAt.IsZero() {
		return false
	}
	return time.Now().After(creds.ExpiresAt)
}

// IsLoggedIn reports whether valid, non-expired credentials exist on disk.
func IsLoggedIn() bool {
	creds, err := Load()
	if err != nil || creds == nil {
		return false
	}
	return !IsExpired(creds)
}
