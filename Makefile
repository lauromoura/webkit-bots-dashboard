# Developer shortcuts. Override the defaults on the command line, e.g.
#   make serve PORT=9000
#   make serve-replay FIXTURES=/tmp/my-snapshot

PORT ?= 8088
FIXTURES ?= fixtures
PYTHON ?= python3

.PHONY: help serve serve-replay serve-fill

help: ## List the available targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | sed -E 's/:.*## /\t/' | expand -t 16
	@echo "Variables: PORT=$(PORT) FIXTURES=$(FIXTURES)"

serve: ## Serve the dashboard with live Buildbot data through the dev proxy
	$(PYTHON) dev-proxy.py --port $(PORT)

serve-replay: ## Serve offline, answering API calls from FIXTURES only
	$(PYTHON) dev-proxy.py --port $(PORT) --replay $(FIXTURES)

serve-fill: ## Like serve-replay, but fetch and record queries with no fixture yet
	@mkdir -p $(FIXTURES)
	$(PYTHON) dev-proxy.py --port $(PORT) --replay $(FIXTURES) --fill-missing
