package sync

import (
	"bufio"
	"crypto/md5"
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func SyncDirectory(src, dest, backupDir string, dryRun bool) (int, error) {
	changed := 0

	err := filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}

		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}

		destPath := filepath.Join(dest, rel)

		srcSum, err := FileChecksum(path)
		if err != nil {
			return fmt.Errorf("checksum %s: %w", path, err)
		}

		destSum, destErr := FileChecksum(destPath)
		if destErr == nil && srcSum == destSum {
			return nil
		}

		if dryRun {
			changed++
			return nil
		}

		// Back up existing file before overwriting
		if destErr == nil && backupDir != "" {
			backupPath := filepath.Join(backupDir, rel)
			if err := os.MkdirAll(filepath.Dir(backupPath), 0o755); err != nil {
				return err
			}
			if err := copyFile(destPath, backupPath); err != nil {
				return fmt.Errorf("backing up %s: %w", destPath, err)
			}
		}

		if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
			return err
		}

		if err := copyFile(path, destPath); err != nil {
			return fmt.Errorf("copying %s: %w", path, err)
		}

		changed++
		return nil
	})

	return changed, err
}

func FileChecksum(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := md5.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

func ExtractSkillVersions(skillsDir, manifestName string, db *sql.DB) error {
	return filepath.Walk(skillsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() || info.Name() != manifestName {
			return nil
		}

		name, version, err := parseSkillFrontmatter(path)
		if err != nil || name == "" || version == "" {
			return nil
		}

		_, err = db.Exec(
			`INSERT INTO skill_versions (skill_name, version) VALUES (?, ?)
			 ON CONFLICT (skill_name, version) DO NOTHING`,
			name, version,
		)
		return err
	})
}

func parseSkillFrontmatter(path string) (name, version string, err error) {
	f, err := os.Open(path)
	if err != nil {
		return "", "", err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	inFrontmatter := false

	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "---" {
			if inFrontmatter {
				break
			}
			inFrontmatter = true
			continue
		}
		if !inFrontmatter {
			continue
		}
		if k, v, ok := parseYAMLLine(line); ok {
			switch k {
			case "name":
				name = v
			case "version":
				version = v
			}
		}
	}

	return name, version, scanner.Err()
}

func parseYAMLLine(line string) (key, value string, ok bool) {
	parts := strings.SplitN(line, ":", 2)
	if len(parts) != 2 {
		return "", "", false
	}
	return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]), true
}

func copyFile(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}
