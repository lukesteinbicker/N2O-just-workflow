package git

import (
	"fmt"
	"os/exec"
	"strings"
)

var prefixMap = map[string]string{
	"database": "feat",
	"actions":  "feat",
	"frontend": "feat",
	"infra":    "chore",
	"agent":    "feat",
	"e2e":      "test",
	"docs":     "docs",
}

func Commit(sprint string, taskNum int, title, doneWhen, taskType, commitTrailer string) (string, error) {
	prefix := prefixMap[taskType]
	if prefix == "" {
		prefix = "feat"
	}

	scope := taskType
	if scope == "" {
		scope = "task"
	}

	subject := fmt.Sprintf("%s(%s): %s", prefix, scope, title)

	var body strings.Builder
	if doneWhen != "" {
		fmt.Fprintf(&body, "\nDone-When: %s", doneWhen)
	}
	fmt.Fprintf(&body, "\nTask: %s#%d", sprint, taskNum)
	fmt.Fprintf(&body, "\n%s", commitTrailer)

	message := subject + "\n" + body.String()

	if _, err := run("add", "-A"); err != nil {
		return "", fmt.Errorf("staging files: %w", err)
	}

	if _, err := run("commit", "-m", message); err != nil {
		return "", fmt.Errorf("committing: %w", err)
	}

	hash, err := run("rev-parse", "HEAD")
	if err != nil {
		return "", fmt.Errorf("getting commit hash: %w", err)
	}

	return strings.TrimSpace(hash), nil
}

func CreateBranch(name string) error {
	_, err := run("checkout", "-b", name)
	return err
}

func CurrentBranch() (string, error) {
	out, err := run("rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func run(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git %s: %s: %w", strings.Join(args, " "), string(out), err)
	}
	return string(out), nil
}
