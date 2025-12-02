# Development Setup Guide

This guide covers setting up a complete development environment for ReMedia, including all prerequisites, tools, and workflows.

## Prerequisites

### System Requirements

- **Operating System**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 18.04+)
- **Memory**: 8GB+ RAM recommended
- **Storage**: 2GB+ free space for dependencies and build artifacts

### Required Software

#### Node.js & Package Manager

```bash
# Install Node.js 18+ (LTS recommended)
# Option 1: Using version manager (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
nvm use --lts

# Option 2: Direct download
# https://nodejs.org/en/download/

# Install Bun (recommended package manager)
curl -fsSL https://bun.sh/install | bash

# Or use npm/yarn if preferred
npm install -g npm@latest
```

#### Rust Toolchain

```bash
# Install Rust (includes rustc, cargo, rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Verify installation
rustc --version
cargo --version
```

#### Tauri Dependencies

**Windows:**
```bash
# Install Microsoft Visual Studio C++ Build Tools
# Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/

# Or via winget
winget install Microsoft.VisualStudio.2022.BuildTools
```

**macOS:**
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install additional dependencies
brew install openssl
```

**Linux (Ubuntu/Debian):**
```bash
# Update package list
sudo apt update

# Install essential build tools and Tauri dependencies
sudo apt install -y \
    libwebkit2gtk-4.1-dev \
    build-essential \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libssl-dev \
    pkg-config \
    patchelf \
    xdg-utils
```

## Repository Setup

### Clone and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/becksclair/remedia.git
cd remedia

# Install Node.js dependencies
bun install

# Install Rust dependencies (handled by cargo on first build)
cargo build
```

### Development Tools Installation

```bash
# Install Playwright browsers for E2E testing
bun run test:e2e:install

# Install Tauri CLI (if not already installed)
bun add -D @tauri-apps/cli
```

## IDE Configuration

### VS Code (Recommended)

Install these extensions from the VS Code marketplace:

```json
{
  "recommendations": [
    "tauri-apps.tauri-vscode",      // Tauri integration
    "rust-lang.rust-analyzer",     // Rust language support
    "bradlc.vscode-tailwindcss",   // Tailwind CSS support
    "esbenp.prettier-vscode",      // Code formatting
    "dbaeumer.vscode-eslint",      // JavaScript/TypeScript linting
    "ms-playwright.playwright"     // Playwright testing support
  ]
}
```

**Workspace Settings (`.vscode/settings.json`):**
```json
{
  "rust-analyzer.checkOnSave.command": "clippy",
  "rust-analyzer.cargo.features": "all",
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.associations": {
    "*.css": "tailwindcss"
  }
}
```

### Alternative Editors

**Neovim:**
```lua
-- Install via packer.nvim
use {
  'simrat39/rust-tools.nvim',
  'nvim-treesitter/nvim-treesitter',
  'neovim/nvim-lspconfig'
}
```

**JetBrains IDEs:**
- Install Rust plugin
- Install TypeScript/JavaScript plugin
- Configure Tauri run configuration

## Development Workflow

### Starting Development Server

```bash
# Full Tauri development (recommended)
bun tauri dev

# Frontend only (for UI-only changes)
bun run dev

# Backend only (rarely needed)
cargo run
```

### Code Quality Tools

```bash
# Run all checks (lint, format, typecheck)
bun run check

# Individual tools
bun run lint          # Oxlint for TypeScript
bun run lint:fix       # Auto-fix linting issues
bun run fmt           # Format code with oxfmt
cargo clippy          # Rust linting
cargo fmt             # Rust formatting
```

### Testing

```bash
# End-to-end tests
bun run test:e2e              # Full E2E suite
bun run test:e2e:web          # Web-only tests (faster)
bun run test:e2e:headed       # Headed browser tests
bun run test:e2e:report       # View test report

# Rust tests
cargo test                     # Unit tests
cargo test --release          # Release mode tests
```

## Project Structure Understanding

### Key Directories

```text
remedia/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── ui/            # shadcn/ui base components
│   │   ├── App.tsx        # Main application
│   │   ├── player.tsx     # Media preview window
│   │   └── settings-dialog.tsx
│   ├── hooks/             # Custom React hooks
│   ├── state/             # Jotai state atoms
│   ├── types/             # TypeScript type definitions
│   └── lib/               # Utility functions
├── src-tauri/             # Rust backend
│   ├── src/               # Source code
│   │   ├── lib.rs         # Main application setup
│   │   ├── downloader.rs  # yt-dlp integration
│   │   └── remedia.rs     # Window management
│   ├── helpers/           # yt-dlp binaries
│   └── Cargo.toml         # Rust dependencies
├── e2e/                   # End-to-end tests
├── docs/                  # Documentation
└── public/                # Static assets
```

### Configuration Files

- `package.json` - Node.js dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `vite.config.ts` - Frontend build configuration
- `Cargo.toml` - Rust dependencies and configuration
- `tauri.conf.json` - Tauri application configuration
- `biome.jsonc` - Code quality and formatting rules

## Common Development Tasks

### Adding New UI Components

```bash
# Add shadcn/ui component
bun run sh-add button
bun run sh-add dialog
bun run sh-add table

# Update existing components
bun run sh-up
```

### Adding New Tauri Commands

1. **Rust Backend** (`src-tauri/src/`):
```rust
#[tauri::command]
pub async fn my_command(
    app: AppHandle,
    window: Window,
    param: String,
) -> Result<String, String> {
    // Your logic here
    Ok("success".to_string())
}
```

2. **Register Command** (`src-tauri/src/lib.rs`):
```rust
builder = builder.invoke_handler(tauri::generate_handler![
    // existing commands...
    my_command
]);
```

3. **TypeScript Types** (`src/types/index.ts`):
```typescript
export interface MyCommand {
  param: string;
}
```

4. **Frontend Usage**:
```typescript
import { invoke } from "@tauri-apps/api/core";

const result = await invoke<string>("my_command", { param: "value" });
```

### Adding New Events

1. **Rust Backend**:
```rust
window.emit("my-event", payload).unwrap();
```

2. **TypeScript Types**:
```typescript
export const TAURI_EVENT = {
  // existing events...
  myEvent: "my-event"
} as const;
```

3. **Frontend Usage**:
```typescript
useTauriEvents({
  "my-event": handleMyEvent
});
```

## Debugging

### Frontend Debugging

```bash
# Enable DevTools (uncomment in src-tauri/src/lib.rs)
app.get_webview_window("main").unwrap().open_devtools();

# Or use browser DevTools for web-only development
bun run dev  # Opens in browser with DevTools
```

### Backend Debugging

```bash
# Enable debug logging
RUST_LOG=debug bun tauri dev

# Use Rust debugger
cargo build
rust-gdb target/debug/remedia
```

### Common Issues

**Build fails on Windows:**
- Ensure Visual Studio Build Tools are installed
- Run from Developer Command Prompt

**yt-dlp not found:**
- Verify binaries exist in `src-tauri/helpers/`
- Check executable permissions on Linux/macOS

**Permission denied errors:**
- Check Tauri capabilities in `src-tauri/capabilities/default.json`
- Ensure file system access is properly configured

## Performance Profiling

### Frontend

```bash
# Use React DevTools Profiler
# Install browser extension
# Open in DevTools during development

# Bundle analysis
bun run build
npx vite-bundle-analyzer dist/
```

### Backend

```bash
# Rust profiling
cargo build --release
perf record ./target/release/remedia
perf report

# Memory usage
valgrind --tool=massif ./target/release/remedia
```

## Contributing Guidelines

### Code Style

- **TypeScript**: Strict mode enabled, no unused variables
- **Rust**: `cargo fmt` and `cargo clippy` must pass
- **CSS**: Tailwind CSS utility classes preferred
- **Commits**: Conventional commit format required

### Pull Request Process

1. Create feature branch from `main`
2. Make changes with atomic commits
3. Run full test suite: `bun run check && bun run test:e2e`
4. Update documentation if needed
5. Submit PR with clear description

### Code Review Checklist

- [ ] All tests pass
- [ ] Code follows project style guidelines
- [ ] Documentation is updated
- [ ] No console.log statements in production code
- [ ] Error handling is appropriate
- [ ] Performance impact is considered

## Environment Variables

Create `.env` file in project root:

```bash
# Development
VITE_TAURI_DEBUG=true
RUST_LOG=debug

# Testing
CI=true
PW_WEB_ONLY=1

# Production (build-time)
TAURI_PRIVATE_KEY=path/to/key.pem
TAURI_KEY_PASSWORD=password
```

## Troubleshooting

### Build Issues

**"Can't find Rust compiler"**
```bash
# Ensure Rust is in PATH
echo $PATH | grep cargo
source ~/.cargo/env
```

**"Linker error" on Windows**
```bash
# Install Microsoft C++ Build Tools
# Or use MSVC Developer Command Prompt
```

### Runtime Issues

**"yt-dlp process failed"**
- Check binary permissions
- Verify URL format
- Check network connectivity

**"Window not found" errors**
- Ensure window names match in `tauri.conf.json`
- Check window creation timing

### Performance Issues

**High memory usage**
- Check for memory leaks in React components
- Monitor yt-dlp process cleanup
- Use browser profiling tools

**Slow build times**
- Use `cargo check` for faster development builds
- Consider `sccache` for Rust compilation caching
- Enable incremental compilation in Cargo.toml

This setup guide should provide everything needed to start productive development on ReMedia. For additional help, consult the project documentation or open an issue on GitHub.
