#!/bin/bash

# Install Rust and add WASM target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustup target add wasm32-unknown-unknown

# Install SpacetimeDB CLI
curl -sSf https://install.spacetimedb.com | sh

# Set up server
cd server
spacetime build
spacetime start &
sleep 5
spacetime publish vibe-bombparty

# Set up client
cd ../client
npm install
spacetime generate --lang typescript --out-dir src/generated

# Start development server
npm run dev 