.PHONY: publish-maincloud deploy-gh-pages all clean

# Default target
all: publish-maincloud deploy-gh-pages

# Publish to SpacetimeDB maincloud
publish-maincloud: build
	cd server && spacetime build && spacetime delete -s maincloud vibe-bombparty &&  spacetime publish -s maincloud vibe-bombparty

# Build and deploy client to GitHub Pages
deploy-gh-pages:
	cd client && npm install && npm run build && npm run deploy

# Clean build artifacts
clean:
	cd server && cargo clean
	cd client && rm -rf dist/ && rm -rf node_modules/

# Help target
help:
	@echo "Available targets:"
	@echo "  publish-maincloud  - Build and publish the module to SpacetimeDB maincloud"
	@echo "  deploy-gh-pages    - Deploy the client to GitHub Pages"
	@echo "  all               - Run publish-maincloud and deploy-gh-pages"
	@echo "  clean             - Clean build artifacts" 