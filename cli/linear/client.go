// Package linear is a thin GraphQL client for Linear's API.
//
// It authenticates with a Linear API key (obtained via N2O API) and talks
// directly to https://api.linear.app/graphql. The client handles cursor
// pagination, rate limits, and 5xx retries. Identifiers (e.g. "ENG-42") are
// accepted anywhere Linear's schema takes an `id` — no UUID lookup needed.
package linear

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"time"
)

const (
	defaultEndpoint = "https://api.linear.app/graphql"
	defaultTimeout  = 30 * time.Second
	maxPageSize     = 250
	defaultMaxItems = 1000
	maxRetries      = 3
)

// Client talks to Linear's GraphQL API.
type Client struct {
	APIKey     string
	Endpoint   string
	HTTPClient *http.Client
}

// New creates a new Linear client.
func New(apiKey string) *Client {
	return &Client{
		APIKey:     apiKey,
		Endpoint:   defaultEndpoint,
		HTTPClient: &http.Client{Timeout: defaultTimeout},
	}
}

// APIError is returned for non-retried Linear API errors.
type APIError struct {
	StatusCode int
	Message    string
	GraphQL    []graphQLError
}

func (e *APIError) Error() string {
	if len(e.GraphQL) > 0 {
		return fmt.Sprintf("linear: %s", e.GraphQL[0].Message)
	}
	if e.Message != "" {
		return fmt.Sprintf("linear: %s", e.Message)
	}
	return fmt.Sprintf("linear: HTTP %d", e.StatusCode)
}

// IsUnauthorized reports whether err is a 401 from Linear.
func IsUnauthorized(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.StatusCode == http.StatusUnauthorized
	}
	return false
}

type graphQLError struct {
	Message    string                 `json:"message"`
	Path       []any                  `json:"path,omitempty"`
	Extensions map[string]any         `json:"extensions,omitempty"`
	Locations  []map[string]int       `json:"locations,omitempty"`
	Raw        map[string]interface{} `json:"-"`
}

type graphQLRequest struct {
	Query     string         `json:"query"`
	Variables map[string]any `json:"variables,omitempty"`
}

type graphQLResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []graphQLError  `json:"errors,omitempty"`
}

// exec runs a GraphQL query or mutation and unmarshals `data` into out.
func (c *Client) exec(query string, variables map[string]any, out any) error {
	reqBody, err := json.Marshal(graphQLRequest{Query: query, Variables: variables})
	if err != nil {
		return fmt.Errorf("encoding request: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		req, err := http.NewRequest(http.MethodPost, c.Endpoint, bytes.NewReader(reqBody))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", c.APIKey)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("GraphQL-Features", "sub_issues")

		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			lastErr = err
			if attempt < maxRetries {
				sleepBackoff(attempt)
				continue
			}
			return fmt.Errorf("linear request failed: %w", err)
		}

		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			return fmt.Errorf("reading linear response: %w", readErr)
		}

		// 429 → honor rate limit reset header
		if resp.StatusCode == http.StatusTooManyRequests {
			if attempt < maxRetries {
				waitForRateLimit(resp.Header)
				continue
			}
			return &APIError{StatusCode: resp.StatusCode, Message: "rate limited"}
		}

		// 5xx → exponential backoff
		if resp.StatusCode >= 500 {
			lastErr = &APIError{StatusCode: resp.StatusCode, Message: string(body)}
			if attempt < maxRetries {
				sleepBackoff(attempt)
				continue
			}
			return lastErr
		}

		// 401 → unauthorized, actionable error
		if resp.StatusCode == http.StatusUnauthorized {
			return &APIError{
				StatusCode: resp.StatusCode,
				Message:    "Linear API key invalid — run `n2o init` to pull a fresh key",
			}
		}

		// Other 4xx → no retry
		if resp.StatusCode >= 400 {
			return &APIError{StatusCode: resp.StatusCode, Message: string(body)}
		}

		var gr graphQLResponse
		if err := json.Unmarshal(body, &gr); err != nil {
			return fmt.Errorf("decoding linear response: %w", err)
		}
		if len(gr.Errors) > 0 {
			return &APIError{StatusCode: resp.StatusCode, GraphQL: gr.Errors}
		}
		if out != nil && len(gr.Data) > 0 {
			if err := json.Unmarshal(gr.Data, out); err != nil {
				return fmt.Errorf("decoding linear data: %w", err)
			}
		}
		return nil
	}
	return lastErr
}

func sleepBackoff(attempt int) {
	d := time.Duration(math.Pow(2, float64(attempt))) * time.Second
	time.Sleep(d)
}

func waitForRateLimit(h http.Header) {
	resetUnix, err := strconv.ParseInt(h.Get("X-RateLimit-Requests-Reset"), 10, 64)
	if err != nil || resetUnix == 0 {
		time.Sleep(5 * time.Second)
		return
	}
	wait := time.Until(time.Unix(resetUnix/1000, 0))
	if wait <= 0 || wait > 2*time.Minute {
		wait = 5 * time.Second
	}
	time.Sleep(wait)
}
