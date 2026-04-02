package api

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// FrameworkFile represents a single file in the framework bundle.
type FrameworkFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// FrameworkBundle is the response from the framework download endpoint.
type FrameworkBundle struct {
	Version string          `json:"version"`
	Files   []FrameworkFile `json:"files"`
}

// DownloadFramework fetches the latest framework content (skills, schema, templates)
// from the authenticated API.
func DownloadFramework(client *Client) (*FrameworkBundle, error) {
	resp, err := client.Get("/api/framework/latest")
	if err != nil {
		return nil, fmt.Errorf("downloading framework: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download framework: server returned status %d", resp.StatusCode)
	}

	var bundle FrameworkBundle
	if err := json.NewDecoder(resp.Body).Decode(&bundle); err != nil {
		return nil, fmt.Errorf("decoding framework bundle: %w", err)
	}

	return &bundle, nil
}
