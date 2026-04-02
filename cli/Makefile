VERSION := 1.0.0
LDFLAGS := -ldflags "-s -w -X n2o/cli/cmd.Version=$(VERSION)"

.PHONY: build install clean test cross

build:
	go build $(LDFLAGS) -o n2o .

install:
	go install $(LDFLAGS) .

clean:
	rm -f n2o
	rm -rf dist/

cross: dist/n2o-darwin-arm64 dist/n2o-darwin-amd64 dist/n2o-windows-amd64.exe

dist/n2o-darwin-arm64:
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $@ .

dist/n2o-darwin-amd64:
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $@ .

dist/n2o-windows-amd64.exe:
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o $@ .
