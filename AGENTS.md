# Remedia

Desktop media downloader. Tauri v2 shell around a React 19 frontend, with Rust backend wrapping yt-dlp.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Jotai + Tailwind v4 + shadcn/ui
- **Backend**: Rust 2024 edition, Tauri v2, Tokio async, yt-dlp subprocess
- **Tools**: Bun (package manager + test runner), oxlint, oxfmt

## Layout

```text
src/              # React frontend
  hooks/          # useDownloadManager, useTauriEvent, useMediaList
  state/          # Jotai atoms (auto-persist to localStorage)
  utils/          # Pure functions (media-helpers, clipboard-helpers)
  components/ui/  # shadcn/ui primitives
src-tauri/src/    # Rust backend
  lib.rs          # Entry, plugin setup, command registration
  downloader.rs   # Core download logic, yt-dlp spawning
  remote_control.rs # WebSocket test harness (debug builds)
```

## Commands

```bash
# Dev
bun tauri dev           # Full desktop dev
bun run dev             # Frontend only

# Test
bun test                # Unit tests
bun run test:e2e        # Playwright E2E
cargo test --manifest-path src-tauri/Cargo.toml

# Verify
bun run lint            # oxlint
bun run fmt             # oxfmt
```

## Key Patterns

**Tauri commands**: Async fns with `#[tauri::command]`, return `Result<T, String>`. Register in `lib.rs` `generate_handler![]`.

**State**: Jotai atoms in `src/state/`. Atoms persist to localStorage automatically.

**Events**: Rust emits via `window.emit()`. Frontend subscribes via `useTauriEvents` hook. Event types in `src/types/index.ts`.

**Testing**: Tests in `*.test.ts[x]` files. Rust tests use `#[test]` or `#[tokio::test]` in `#[cfg(test)]` modules.

## Critical Files

| Purpose | Location |
|---------|----------|
| App orchestration | `src/App.tsx` |
| Download queue & yt-dlp | `src-tauri/src/downloader.rs` |
| Tauri command registration | `src-tauri/src/lib.rs` |
| Event/command types | `src/types/index.ts` |
| State atoms | `src/state/` |

---

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**
```bash
bd ready --json
```

**Create new issues:**
```bash
bd create "Issue title" -t bug|feature|task -p 0-4 --json
bd create "Issue title" -p 1 --deps discovered-from:bd-123 --json
bd create "Subtask" --parent <epic-id> --json  # Hierarchical subtask (gets ID like epic-id.1)
```

**Claim and update:**
```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**
```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`
6. **Commit together**: Always commit the `.beads/issues.jsonl` file together with the code changes so issue state stays in sync with code state

### Auto-Sync

bd automatically syncs with git:
- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### GitHub Copilot Integration

If using GitHub Copilot, also create `.github/copilot-instructions.md` for automatic instruction loading.
Run `bd onboard` to get the content, or see step 2 of the onboard instructions.

### MCP Server (Recommended)

If using Claude or MCP-compatible clients, install the beads MCP server:

```bash
pip install beads-mcp
```

Add to MCP config (e.g., `~/.config/claude/config.json`):
```json
{
  "beads": {
    "command": "beads-mcp",
    "args": []
  }
}
```

Then use `mcp__beads__*` functions instead of CLI commands.

### Managing AI-Generated Planning Documents

AI assistants often create planning and design documents during development:
- PLAN.md, IMPLEMENTATION.md, ARCHITECTURE.md
- DESIGN.md, CODEBASE_SUMMARY.md, INTEGRATION_PLAN.md
- TESTING_GUIDE.md, TECHNICAL_DESIGN.md, and similar files

**Best Practice: Use a dedicated directory for these ephemeral files**

**Recommended approach:**
- Create a `history/` directory in the project root
- Store ALL AI-generated planning/design docs in `history/`
- Keep the repository root clean and focused on permanent project files
- Only access `history/` when explicitly asked to review past planning

**Example .gitignore entry (optional):**
```gitignore
# AI planning documents (ephemeral)
history/
```

**Benefits:**
- ✅ Clean repository root
- ✅ Clear separation between ephemeral and permanent documentation
- ✅ Easy to exclude from version control if desired
- ✅ Preserves planning history for archeological research
- ✅ Reduces noise when browsing the project

### CLI Help

Run `bd <command> --help` to see all available flags for any command.
For example: `bd create --help` shows `--parent`, `--deps`, `--assignee`, etc.  

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ✅ Store AI planning docs in `history/` directory
- ✅ Run `bd <cmd> --help` to discover available flags
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems
- ❌ Do NOT clutter repo root with planning documents

For more details, see README.md and QUICKSTART.md.
