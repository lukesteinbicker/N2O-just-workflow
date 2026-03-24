package ui

import (
	"fmt"

	"github.com/charmbracelet/lipgloss"
)

var (
	Green  = lipgloss.Color("#22c55e")
	Yellow = lipgloss.Color("#eab308")
	Red    = lipgloss.Color("#ef4444")
	Dim    = lipgloss.Color("#6b7280")
	White  = lipgloss.Color("#f9fafb")

	successStyle = lipgloss.NewStyle().Foreground(Green)
	warnStyle    = lipgloss.NewStyle().Foreground(Yellow)
	errorStyle   = lipgloss.NewStyle().Foreground(Red)
	infoStyle    = lipgloss.NewStyle().Foreground(Dim)
	headerStyle  = lipgloss.NewStyle().Foreground(White).Bold(true)
	boldStyle    = lipgloss.NewStyle().Bold(true)
)

func Success(msg string) string { return successStyle.Render(msg) }
func Warn(msg string) string    { return warnStyle.Render(msg) }
func Error(msg string) string   { return errorStyle.Render(msg) }
func Info(msg string) string    { return infoStyle.Render(msg) }
func Header(msg string) string  { return headerStyle.Render(msg) }
func Bold(msg string) string    { return boldStyle.Render(msg) }

func PrintSuccess(msg string) { fmt.Println(Success(msg)) }
func PrintWarn(msg string)    { fmt.Println(Warn(msg)) }
func PrintError(msg string)   { fmt.Println(Error(msg)) }
func PrintInfo(msg string)    { fmt.Println(Info(msg)) }
func PrintHeader(msg string)  { fmt.Println(Header(msg)) }
func PrintBold(msg string)    { fmt.Println(Bold(msg)) }
