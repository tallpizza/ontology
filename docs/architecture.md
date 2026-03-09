# Architecture

`ontology` starts from the OpenCode codebase and extends it toward a graph-aware application model.

## Why this fork exists

OpenCode provides a strong base for:

- agent-driven workflows
- a client/server architecture
- a web and desktop surface
- extensible session and tool systems

The fork exists because the target product is different.

The goal is not only to improve an AI coding agent. The goal is to build an ontology-based environment where chat, structured entities, and graph navigation are first-class product concepts.

## Product direction

The fork is moving toward three connected layers:

## 1. Conversational layer

Chat remains the main interaction surface, but the conversation should become ontology-aware.

Examples:

- entity-aware prompts
- space-scoped memory
- graph-derived context injection
- navigation between conversation and ontology views

## 2. Ontology layer

This layer manages structured concepts, relationships, spaces, and domain-specific knowledge models.

Examples:

- ontology ingestion and normalization
- typed node and edge models
- query and traversal APIs
- synchronization between application state and graph state

## 3. Graph experience layer

The graph is not only storage. It is part of the user experience.

Examples:

- visual graph exploration
- graph-driven workspace navigation
- relationship-aware search
- graph-to-chat and chat-to-graph transitions

## Upstream strategy

This project should keep taking useful changes from `anomalyco/opencode`, especially when they improve:

- platform stability
- agent infrastructure
- tooling
- performance
- generic UI and runtime capabilities

Ontology-specific capabilities can diverge when needed.

## Practical boundary

As a rule:

- upstream generic improvements when they are broadly useful
- keep product-specific ontology logic in this fork
- document major divergence points as they appear

## Current shape

The current codebase still follows most of the inherited OpenCode package layout, especially in:

- `packages/opencode`
- `packages/app`
- `packages/desktop`
- `packages/sdk/js`

Over time, ontology-specific modules, UI flows, and data paths should become clearer and more self-contained.
