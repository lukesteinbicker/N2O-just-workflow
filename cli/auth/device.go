package auth

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"runtime"
	"time"
)

// deviceAuthResponse is the response from the device authorization endpoint.
type deviceAuthResponse struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	Interval        int    `json:"interval"`
	ExpiresIn       int    `json:"expires_in"`
}

// deviceVerifyResponse is the response from the device verification endpoint.
type deviceVerifyResponse struct {
	Error        string `json:"error,omitempty"`
	Token        string `json:"token,omitempty"`
	UserID       string `json:"user_id,omitempty"`
	OrgID        string `json:"org_id,omitempty"`
	ExpiresIn    int    `json:"expires_in,omitempty"`
	LinearAPIKey string `json:"linear_api_key,omitempty"`
}

// DeviceFlowLogin performs the full OAuth device authorization flow (RFC 8628).
// It requests a device code, prompts the user, opens a browser, and polls until
// the user authorises or the code expires.
func DeviceFlowLogin(appURL string) (*Credentials, error) {
	// Step 1: Request device code.
	authReq := map[string]string{"client_id": "n2o-cli"}
	body, err := json.Marshal(authReq)
	if err != nil {
		return nil, fmt.Errorf("encoding auth request: %w", err)
	}

	resp, err := http.Post(
		appURL+"/api/auth/device-authorization/authorize",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("requesting device code: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("device authorization failed with status %d", resp.StatusCode)
	}

	var authResp deviceAuthResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return nil, fmt.Errorf("decoding device auth response: %w", err)
	}

	// Step 2: Prompt user.
	fmt.Printf("Open %s and enter code: %s\n", authResp.VerificationURI, authResp.UserCode)

	// Step 3: Try to open the browser.
	openBrowser(authResp.VerificationURI)

	// Step 4: Poll for authorization.
	interval := time.Duration(authResp.Interval) * time.Second
	if interval == 0 {
		interval = 5 * time.Second
	}
	deadline := time.Now().Add(time.Duration(authResp.ExpiresIn) * time.Second)

	for {
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("device code expired")
		}

		time.Sleep(interval)

		creds, done, err := pollVerify(appURL, authResp.DeviceCode)
		if err != nil {
			return nil, err
		}
		if done {
			creds.AppURL = appURL
			return creds, nil
		}
	}
}

// pollVerify makes a single poll request to the verification endpoint.
// Returns (creds, true, nil) on success, (nil, false, nil) when still pending,
// or (nil, false, err) on a terminal error.
func pollVerify(appURL, deviceCode string) (*Credentials, bool, error) {
	reqBody, err := json.Marshal(map[string]string{"device_code": deviceCode})
	if err != nil {
		return nil, false, err
	}

	resp, err := http.Post(
		appURL+"/api/auth/device-authorization/verify-device",
		"application/json",
		bytes.NewReader(reqBody),
	)
	if err != nil {
		return nil, false, fmt.Errorf("polling verification: %w", err)
	}
	defer resp.Body.Close()

	var vr deviceVerifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&vr); err != nil {
		return nil, false, fmt.Errorf("decoding verification response: %w", err)
	}

	switch vr.Error {
	case "authorization_pending":
		return nil, false, nil
	case "slow_down":
		// Caller's interval will be used on next iteration; we just skip this round.
		return nil, false, nil
	case "expired_token":
		return nil, false, fmt.Errorf("device code expired")
	case "":
		// Success.
		var expiresAt time.Time
		if vr.ExpiresIn > 0 {
			expiresAt = time.Now().Add(time.Duration(vr.ExpiresIn) * time.Second)
		}
		return &Credentials{
			Token:        vr.Token,
			UserID:       vr.UserID,
			OrgID:        vr.OrgID,
			ExpiresAt:    expiresAt,
			LinearAPIKey: vr.LinearAPIKey,
		}, true, nil
	default:
		return nil, false, fmt.Errorf("authorization error: %s", vr.Error)
	}
}

// openBrowser attempts to open a URL in the default browser.
func openBrowser(url string) {
	var cmd string
	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
	case "linux":
		cmd = "xdg-open"
	default:
		return
	}
	_ = exec.Command(cmd, url).Start()
}
