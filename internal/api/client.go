package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/lukes/n2o/internal/auth"
	"github.com/lukes/n2o/internal/config"
)

// ErrUnauthorized is returned when the server responds with 401.
var ErrUnauthorized = errors.New("unauthorized: invalid or expired token")

// Client is an authenticated HTTP client for the N2O API.
type Client struct {
	BaseURL    string
	Token      string
	HTTPClient *http.Client
}

// New creates a Client with the given base URL and bearer token.
func New(baseURL, token string) *Client {
	return &Client{
		BaseURL: baseURL,
		Token:   token,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// NewFromConfig loads credentials and project config, then returns a Client.
// Returns nil, nil if the user is not logged in.
func NewFromConfig() (*Client, error) {
	creds, err := auth.Load()
	if err != nil {
		return nil, fmt.Errorf("loading credentials: %w", err)
	}
	if creds == nil || auth.IsExpired(creds) {
		return nil, nil
	}

	appURL := creds.AppURL
	if appURL == "" {
		// Fall back to project config if credentials don't carry the URL.
		cfg, err := config.LoadProject(".")
		if err != nil {
			return nil, fmt.Errorf("loading project config: %w", err)
		}
		appURL = cfg.ProjectName // best-effort fallback
	}

	return New(appURL, creds.Token), nil
}

// Get performs an authenticated GET request.
func (c *Client) Get(path string) (*http.Response, error) {
	return c.do(http.MethodGet, path, nil)
}

// Post performs an authenticated POST request with a JSON body.
func (c *Client) Post(path string, body any) (*http.Response, error) {
	return c.do(http.MethodPost, path, body)
}

// Delete performs an authenticated DELETE request.
func (c *Client) Delete(path string) (*http.Response, error) {
	return c.do(http.MethodDelete, path, nil)
}

func (c *Client) do(method, path string, body any) (*http.Response, error) {
	var reqBody *bytes.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("encoding request body: %w", err)
		}
		reqBody = bytes.NewReader(data)
	}

	var req *http.Request
	var err error
	if reqBody != nil {
		req, err = http.NewRequest(method, c.BaseURL+path, reqBody)
	} else {
		req, err = http.NewRequest(method, c.BaseURL+path, nil)
	}
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode == http.StatusUnauthorized {
		resp.Body.Close()
		return nil, ErrUnauthorized
	}

	return resp, nil
}
