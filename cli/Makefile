VERSION := $(shell jq -r '.version' n2o-manifest.json)
LDFLAGS := -ldflags "-s -w -X github.com/lukes/n2o/cmd/n2o/cmd.Version=$(VERSION)"

.PHONY: build install clean test cross

build:
	go build $(LDFLAGS) -o n2o ./cmd/n2o/

install:
	go install $(LDFLAGS) ./cmd/n2o/

clean:
	rm -f n2o
	rm -rf dist/

cross: dist/n2o-darwin-arm64 dist/n2o-darwin-amd64 dist/n2o-linux-amd64

dist/n2o-darwin-arm64:
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $@ ./cmd/n2o/

dist/n2o-darwin-amd64:
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $@ ./cmd/n2o/

dist/n2o-linux-amd64:
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $@ ./cmd/n2o/
