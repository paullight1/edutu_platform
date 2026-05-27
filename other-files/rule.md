# Project Rules

> [!IMPORTANT]
> **RULE #1: NO MONOREPO.**
> This project is to be maintained as a collection of independent, isolated projects. Do **NOT** introduce shared workspaces, central dependency management (pnpm workspaces, yarn workspaces, npm workspaces), or monorepo tools (Turborepo, Nx, etc.) at the root level. Each subdirectory (`admin`, `edutu_mobile`, etc.) must remain self-contained and functionally separate.

## Core Principles

1. **Isolation over Integration**: Keep project boundaries strict. Dependencies and configurations should not leak across directories.
2. **Independence**: Each project must be able to build, test, and deploy without relying on root-level configurations or shared packages.
3. **Simplicity**: Avoid complex root-level orchestration. Stick to standard, decoupled project structures.
