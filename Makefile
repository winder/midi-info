.PHONY: install build run dev test typecheck clean

install:
	npm install

build:
	npm run build

run: build
	go run main.go

dev:
	npm run watch

test:
	npm test

typecheck:
	npm run typecheck

clean:
	rm -f app.js
