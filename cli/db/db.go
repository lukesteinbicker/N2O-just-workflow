package db

import (
	"crypto/sha256"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	_ "modernc.org/sqlite"
)

func Open(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA busy_timeout=5000",
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			db.Close()
			return nil, fmt.Errorf("setting %s: %w", p, err)
		}
	}

	return db, nil
}

func AutoMigrate(db *sql.DB, migrationsDir string) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS _migrations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		framework_version TEXT,
		checksum TEXT
	)`); err != nil {
		return fmt.Errorf("creating _migrations table: %w", err)
	}

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)

	applied := make(map[string]bool)
	rows, err := db.Query("SELECT name FROM _migrations")
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return err
		}
		applied[name] = true
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, f := range files {
		name := strings.TrimSuffix(f, ".sql")
		if applied[name] {
			continue
		}

		content, err := os.ReadFile(filepath.Join(migrationsDir, f))
		if err != nil {
			return fmt.Errorf("reading migration %s: %w", f, err)
		}

		checksum := fmt.Sprintf("%x", sha256.Sum256(content))

		tx, err := db.Begin()
		if err != nil {
			return err
		}

		if _, err := tx.Exec(string(content)); err != nil {
			tx.Rollback()
			return fmt.Errorf("applying migration %s: %w", name, err)
		}

		if _, err := tx.Exec(
			"INSERT INTO _migrations (name, checksum) VALUES (?, ?)",
			name, checksum,
		); err != nil {
			tx.Rollback()
			return fmt.Errorf("recording migration %s: %w", name, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("committing migration %s: %w", name, err)
		}
	}

	return nil
}

func InitFromSchema(dbPath, schemaPath string) error {
	schema, err := os.ReadFile(schemaPath)
	if err != nil {
		return fmt.Errorf("reading schema: %w", err)
	}
	return InitFromSchemaBytes(dbPath, schema)
}

// InitFromSchemaBytes creates a new database from schema content in memory.
// Returns nil if the database file already exists.
func InitFromSchemaBytes(dbPath string, schema []byte) error {
	if _, err := os.Stat(dbPath); err == nil {
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return err
	}

	d, err := Open(dbPath)
	if err != nil {
		return err
	}
	defer d.Close()

	if _, err := d.Exec(string(schema)); err != nil {
		return fmt.Errorf("executing schema: %w", err)
	}

	return nil
}
