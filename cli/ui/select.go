package ui

import (
	"fmt"
	"os"

	"github.com/charmbracelet/lipgloss"
	"golang.org/x/term"
)

var (
	activeStyle   = lipgloss.NewStyle().Foreground(Green).Bold(true)
	inactiveStyle = lipgloss.NewStyle().Foreground(Dim)
)

type SelectOption struct {
	Label string
	Value string
}

// Select displays a list of options and lets the user pick one with arrow keys.
// Returns the selected option's Value.
func Select(prompt string, options []SelectOption) (string, error) {
	if len(options) == 0 {
		return "", fmt.Errorf("no options provided")
	}

	oldState, err := term.MakeRaw(int(os.Stdin.Fd()))
	if err != nil {
		return "", fmt.Errorf("enable raw mode: %w", err)
	}
	defer term.Restore(int(os.Stdin.Fd()), oldState)

	cursor := 0
	buf := make([]byte, 3)

	for {
		render(prompt, options, cursor)

		n, err := os.Stdin.Read(buf)
		if err != nil {
			return "", err
		}

		// Arrow keys: ESC [ A/B
		if n == 3 && buf[0] == 27 && buf[1] == 91 {
			switch buf[2] {
			case 65: // up
				if cursor > 0 {
					cursor--
				}
			case 66: // down
				if cursor < len(options)-1 {
					cursor++
				}
			}
		}

		// Enter
		if n == 1 && (buf[0] == 13 || buf[0] == 10) {
			// Clear the rendered menu and print final selection
			clearLines(len(options) + 1)
			fmt.Printf("%s %s\r\n", prompt, Bold(options[cursor].Label))
			return options[cursor].Value, nil
		}

		// Ctrl-C
		if n == 1 && buf[0] == 3 {
			clearLines(len(options) + 1)
			return "", fmt.Errorf("interrupted")
		}
	}
}

func render(prompt string, options []SelectOption, cursor int) {
	clearLines(len(options) + 1)
	fmt.Printf("%s\r\n", prompt)
	for i, opt := range options {
		if i == cursor {
			fmt.Printf("  %s %s\r\n", activeStyle.Render("▸"), activeStyle.Render(opt.Label))
		} else {
			fmt.Printf("  %s %s\r\n", inactiveStyle.Render(" "), inactiveStyle.Render(opt.Label))
		}
	}
	// Move cursor back up to top of menu for next render
	fmt.Printf("\033[%dA", len(options)+1)
}

func clearLines(n int) {
	for i := 0; i < n; i++ {
		fmt.Print("\033[2K") // clear line
		if i < n-1 {
			fmt.Print("\033[1B") // move down
		}
	}
	// Move back to start
	if n > 1 {
		fmt.Printf("\033[%dA", n-1)
	}
	fmt.Print("\r")
}
