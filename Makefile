.PHONY: install build run stop test typecheck test-e2e clean

install:
	npm install

# Production build into dist/ (what GitHub Pages deploys and e2e tests serve).
build:
	npm run build

# Dev server on http://localhost:8080: esbuild bundles src/ in memory on every
# request and serves index.html from the repo root. Nothing is written to disk.
run:
	npm run serve

stop:
	@fuser -k 8080/tcp 2>/dev/null || true

test:
	npm test

typecheck:
	npm run typecheck

test-e2e:
	npm run test:e2e

clean:
	rm -rf dist
