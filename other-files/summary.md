# Project Summary: Edutu Ecosystem

This document provides an overview of the projects within the `Edutu_Folder`, following the strict "No Monorepo" policy.

## 1. Governance & Rules
- **Rule File**: [rule.md](file:///c:/Users/USER/Desktop/app-projects/Edutu_Folder/rule.md)
- **Core Directive**: Maintain strict isolation. No shared root workspaces or monorepo orchestration tools (Turborepo, Nx, etc.).

---

## 2. Project: admin
**Type**: Vite Web Application (Admin Panel)

### Technical Profile
- **Framework**: Vite
- **Design System**: Notion-inspired (documented in `DESIGN.md`).
  - Warm neutrals, NotionInter font.
  - Whisper-thin borders (`rgba(0,0,0,0.1)`).
  - Multi-layer natural shadows.
- **Backend Integration**: Supabase (configured via `.env`).
- **Authentication**: Clerk (configured via `.env`).

### Current Status
- **Source Code**: Nested under `src/admin/sections/`. Currently appears to have a sparse/empty structure in some areas.
- **Build Status**: Built artifacts exist in `dist/`.
- **Git Identity**: No local git repository detected within the directory.

---

## 3. Project: edutu_mobile
**Type**: Cross-platform Expo/React Native App

### Technical Profile
- **Framework**: Expo SDK 55 (React Native 0.83.4).
- **Routing**: `expo-router` v5 (file-based).
- **Styling**: NativeWind (Tailwind CSS) + StyleSheet.
- **Authentication**: Clerk SDK v2.
- **Database/Backend**: Supabase (PostgreSQL).
- **Icons**: Lucide React Native.
- **Components**: Radix UI primitives + Custom glassmorphic elements.

### Architecture
- **Local Packages**: Uses an internal core package in `packages/core` for shared logic (hooks, services, types) within the mobile project context.
- **Documentation**: Extensive planning documents and state analysis files (`PLAN-*.md`) are present.

### Current Status
- **Development**: Active development environment with full dependency tree.
- **Git Identity**: No local git repository detected within the directory, despite the presence of a `.gitignore`.

---

## 4. Git and Infrastructure Summary
- **Git Configuration**: Exhaustive search of hidden files and parent directories performed. No `.git` repositories or remotes were identified for either project or the root folder.
- **Separation Status**: Both projects currently operate with independent dependencies and configurations as per the no-monorepo rule.
