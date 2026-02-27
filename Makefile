.PHONY: help install dev test lint clean deploy logs status

# Default target
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ─── Setup ───────────────────────────────────────────────

install: ## Install dependencies
	npm install

setup: install ## First-time setup (install + create .env)
	@test -f .env || cp .env.example .env && echo "Created .env from .env.example"
	@mkdir -p data
	@echo "Done. Edit .env with your credentials, then run: make dev"

# ─── Development ─────────────────────────────────────────

dev: ## Start development server
	node server.js

test: ## Run unit tests
	npx vitest run

test-watch: ## Run tests in watch mode
	npx vitest

test-coverage: ## Run tests with coverage report
	npx vitest run --coverage

# ─── Production ──────────────────────────────────────────

start: ## Start production server
	NODE_ENV=production node server.js

# ─── Deployment ──────────────────────────────────────────

deploy: test ## Run tests then deploy to Render
	git push origin main

push: ## Git push to origin
	git push origin main

# ─── Utilities ───────────────────────────────────────────

status: ## Show server status (requires running server)
	@curl -s http://localhost:3000/api/status | node -e "process.stdin.on('data',d=>console.log(JSON.stringify(JSON.parse(d),null,2)))" 2>/dev/null || echo "Server not running"

health: ## Check server health
	@curl -s http://localhost:3000/health 2>/dev/null || echo "Server not running"

logs: ## Tail chat logs
	@test -f data/chats.jsonl && tail -20 data/chats.jsonl || echo "No chat logs yet"

clean: ## Remove data files and node_modules
	rm -rf node_modules data/chats.jsonl
	@echo "Cleaned. Run 'make install' to reinstall."

clean-data: ## Remove only data files (keep node_modules)
	rm -f data/chats.jsonl data/accounts.json
	@echo "Data files removed."
