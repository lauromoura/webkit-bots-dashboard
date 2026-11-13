# Developer shortcuts. Override the defaults on the command line, e.g.
#   make serve PORT=9000
#   make serve-replay FIXTURES=/tmp/my-snapshot

PORT ?= 8088
FIXTURES ?= fixtures
PYTHON ?= python3

.PHONY: help serve serve-replay serve-fill vendor vendor-check test test-update record-fixtures

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

vendor: ## Re-fetch the pinned third-party libraries into vendor/ (network)
	$(PYTHON) tools/vendor.py

vendor-check: ## Verify vendor/ against vendor/SHA256SUMS (offline)
	cd vendor && sha256sum -c --quiet SHA256SUMS && echo "vendor/ OK"

PYTEST = cd tests && $(PYTHON) -m pytest -q -p no:cacheprovider

test: ## Run the test suite offline, from tests/fixtures (see tests/README.md)
	$(PYTEST) $(ARGS)

test-update: ## Accept intended API request changes into tests/api-paths.json
	cd tests && UPDATE_API_PATHS=1 $(PYTHON) -m pytest -q -p no:cacheprovider test_smoke.py
	@echo "Review 'git diff tests/api-paths.json' and update docs/api-consumption.md."

record-fixtures: ## Re-record tests/fixtures from live Buildbot (~150 throttled requests)
	rm -rf tests/fixtures.new
	cd tests && RECORD_DIR=$(CURDIR)/tests/fixtures.new $(PYTHON) -m pytest -q -p no:cacheprovider
	$(PYTHON) tools/compact-fixtures.py tests/fixtures.new
	rm -rf tests/fixtures && mv tests/fixtures.new tests/fixtures
