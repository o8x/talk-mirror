BINARY   := talk-mirror
WEB_DIR  := views
GOFLAGS  ?= -trimpath

.PHONY: all build web deps run test clean

all: build

deps:
	cd $(WEB_DIR) && pnpm install

web:
	cd $(WEB_DIR) && pnpm build

build: web
	go build $(GOFLAGS) -o $(BINARY) .

run: build
	./$(BINARY)

test:
	go test ./...

clean:
	rm -rf $(BINARY) $(WEB_DIR)/dist
