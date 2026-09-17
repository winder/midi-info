.PHONY: install build run stop dev test typecheck clean

install:
	npm install

build:
	npm run build

run: build
	go run main.go

stop:
	@fuser -k 8080/tcp 2>/dev/null || true

dev:
	npm run watch

test:
	npm test

typecheck:
	npm run typecheck

clean:
	rm -f app.js
