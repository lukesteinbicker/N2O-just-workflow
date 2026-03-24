package manifest

import (
	"encoding/json"
	"os"
)

type Manifest struct {
	Version            string            `json:"version"`
	FrameworkFiles     []string          `json:"framework_files"`
	ProjectFiles       []string          `json:"project_files"`
	Scaffolds          map[string]string `json:"scaffolds"`
	DirectoryStructure []string          `json:"directory_structure"`
}

func Load(path string) (*Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	return &m, nil
}
