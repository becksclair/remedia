# ReMedia

A cross-platform desktop media downloader built with Tauri, React, and yt-dlp. ReMedia provides a clean, modern interface for downloading media from various web sources including YouTube, Vimeo, and other supported platforms.

## Features

### Core Features

- **Drag & Drop Support**: Simply drag media URLs into the application
- **Clipboard Detection**: Automatically detects URLs copied to clipboard when window gains focus
- **Real-time Progress**: Live download progress with detailed status updates and thumbnails
- **Metadata Extraction**: Automatically extracts video titles, thumbnails, and metadata using yt-dlp
- **Cross-platform**: Works on Windows, macOS, and Linux with platform-specific optimizations
- **Modern UI**: Built with shadcn/ui components and Tailwind CSS using "new-york" variant
- **Preview Window**: Built-in media player for preview functionality before downloading

### Advanced Features

- **Flexible Download Settings**:
  - Download mode: Video (with audio) or audio-only
  - Video quality presets: Best, High, Medium, Low
  - Max resolution limits: 4K (2160p), 2K (1440p), 1080p, 720p, 480p, or no limit
  - Video format selection: MP4, MKV, WebM, or best available
  - Audio format selection: MP3, M4A, Opus, or best available
  - Audio quality: Best (320 kbps), High (256 kbps), Medium (192 kbps), Low (128 kbps)

- **Batch Operations via Context Menu**:
  - Download all items at once
  - Cancel all active downloads
  - Remove selected items from queue
  - Clear entire download list
  - Copy all URLs to clipboard
  - Access debug console

- **Download Management**:
  - Real-time cancellation of individual or all downloads
  - Responsive cancel polling (100ms intervals)
  - Proper cleanup of yt-dlp processes
  - Status tracking: Pending, Downloading, Done, Error, Cancelled

- **Debug Console**:
  - Dedicated window for viewing all yt-dlp logs
  - Real-time log streaming with timestamps
  - Search functionality with highlighting
  - Navigate between search matches
  - Color-coded log levels (info, warning, error)
  - Media index tracking for multi-download debugging

- **Robust Error Handling**:
  - Input validation at all boundaries
  - Comprehensive error messages from yt-dlp
  - Graceful handling of unsupported URLs
  - Network error recovery
  - Memory-safe log management (1000 entry limit)

## Quick Start

### Prerequisites

- **Node.js** 18+ and **Bun** (recommended) or npm
- **Rust** 1.70+ (for Tauri backend)
- **System dependencies** for Tauri (platform-specific)

### Installation

```bash
# Clone the repository
git clone https://github.com/becksclair/remedia.git
cd remedia

# Install dependencies
bun install

# Install Playwright browsers (for testing)
bun run test:e2e:install
```

### Development

```bash
# Start development server with hot reload
bun tauri dev

# Frontend only (port 1420)
bun run dev

# Build for production
bun tauri build
```

## Usage

1. **Add URLs**:
   - Drag and drop media URLs into the main window
   - Copy URLs to clipboard (auto-detection enabled)
   - URLs are automatically validated and metadata extracted

2. **Configure Downloads**:
   - Set download location in Settings
   - Choose audio-only or video download
   - Configure quality preferences

3. **Monitor Progress**:
   - View real-time download progress
   - See detailed status and error messages
   - Access completed files in your download folder

## Development Commands

### Building & Development

```bash
bun run dev          # Frontend dev server (port 1420)
bun tauri dev        # Full Tauri development with hot reload
bun run build        # Build frontend for production
bun tauri build      # Build complete application
```

### Code Quality

```bash
bun run check        # Run Biome linter and formatter
bun run lint         # Run oxlint linter
bun run lint:fix     # Fix linting issues automatically
bun run fmt          # Format code with oxfmt
```

### Testing

```bash
# Unit Tests (Vitest)
bun run test              # Run unit tests in watch mode
bun run test:run          # Run unit tests once
bun run test:ui           # Run tests with UI dashboard
bun run test:coverage     # Generate coverage report

# End-to-End Tests (Playwright)
bun run test:e2e           # Run Playwright end-to-end tests
bun run test:e2e:web       # Run web-only Playwright tests
bun run test:e2e:headed    # Run Playwright tests with headed browser
bun run test:e2e:install   # Install Playwright browsers

# Real download smoke test (hits live URLs; optional/manual)
bun run test:real-download    # Runs e2e/real-download.spec.ts with real URLs via WebSocket harness

# Remote control websocket (opt-in)
# Local WS for automation: ws://127.0.0.1:17814
# Commands: {"action":"addUrl","url":"https://..."}, {"action":"startDownloads"}, {"action":"cancelAll"}, {"action":"status"}
# Bun helper will connect to a running dev app or launch one if needed:
bun run test:remote            # uses ws bridge (dev builds auto-enable; set REMEDIA_REMOTE_WS=1 for release)
# Lower-level Rust test (opt-in/CI-safe):
cmd /C "set CARGO_TARGET_DIR=target-remote&& cargo test --manifest-path src-tauri/Cargo.toml --features remote-e2e --tests"  # works even if dev app holds the default target dir
```

**Test Coverage:**
- 58+ unit tests covering utility functions
- Media helpers: URL validation, list operations, progress calculation
- Log helpers: Search, highlighting, match navigation
- E2E tests for user workflows and integration scenarios

### Component Management

```bash
bun run sh-add [component]    # Add new shadcn/ui component
bun run sh-up                 # Update existing shadcn/ui components
```

## Architecture

### Technology Stack

- **Frontend**: React 19.2.0 + TypeScript with strict mode
- **Backend**: Rust with Tauri 2.9.3 framework
- **State Management**: Jotai atoms for reactive state with localStorage persistence
- **UI Components**: shadcn/ui with Tailwind CSS (new-york variant)
- **Media Engine**: yt-dlp for extraction and downloads
- **Build System**: Vite for frontend, Cargo for backend
- **Testing**: Vitest for unit tests, Playwright for E2E tests

### Code Organization

```text
src/
├── components/         # React components (UI, dialogs, tables)
├── hooks/             # Custom React hooks (Tauri events, window focus)
├── state/             # Jotai atoms (app state, settings persistence)
├── utils/             # Pure utility functions (testable, documented)
│   ├── constants.ts   # Application-wide constants
│   ├── media-helpers.ts   # Media list operations
│   └── log-helpers.ts     # Log search and filtering
└── types/             # TypeScript type definitions

src-tauri/src/
├── lib.rs             # Tauri app setup and command handlers
└── downloader.rs      # yt-dlp integration and download logic
```

### Design Principles

- **Test-Driven Development**: 58+ unit tests ensure code reliability
- **Pure Functions**: Business logic extracted to testable utilities
- **Type Safety**: Strict TypeScript with noUncheckedIndexedAccess
- **Error Handling**: Comprehensive validation and error propagation with categorized toast notifications and retry actions
- **Separation of Concerns**: Clear boundaries between UI, state, and logic
- **Documentation**: JSDoc comments on all public utility functions

## Error Handling System

ReMedia uses a centralized error handling system with categorized notifications:

### Error Categories

- **Network**: Connection issues, fetch failures
- **Download**: yt-dlp failures, invalid URLs, media unavailable
- **Validation**: Invalid input, required fields missing
- **System**: File permissions, system errors
- **Unknown**: Unexpected errors

### Usage Examples

```typescript
import { ErrorHandlers } from '@/shared/error-handler';

// Download errors with retry
ErrorHandlers.download(error, url, async () => {
  await retryDownload();
});

// Network errors
ErrorHandlers.network(error, async () => {
  await retryNetworkOperation();
});

// Validation errors
ErrorHandlers.validation(error, fieldName);
```

### Features

- Automatic error categorization based on message content
- User-friendly error messages
- Retry actions for recoverable errors
- Toast notifications with appropriate severity levels
- Enhanced error boundary with recovery options

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Windows  | ✅ Fully Supported | .exe installer available |
| macOS    | ✅ Fully Supported | .dmg installer available |
| Linux    | ✅ Fully Supported | AppImage and .deb packages |

## Troubleshooting

### Common Issues

**yt-dlp not found**
- Ensure yt-dlp binaries are included in `src-tauri/helpers/`
- The application includes platform-specific yt-dlp executables

**Download fails with permission error**
- Check download directory permissions
- Ensure the download location exists and is writable

**Clipboard detection not working**
- Check system permissions for clipboard access
- Restart the application after granting permissions

**Wayland display issues (Linux)**
- The application automatically detects Wayland and adjusts behavior
- Some features may be limited on Wayland for security reasons

### Debug Mode

**Debug Console**: Right-click in the media list and select "Show Debug Console" to open a dedicated window with:
- Real-time yt-dlp log streaming
- Search functionality with highlighting
- Color-coded log levels (info, warning, error)
- Timestamp and media index tracking

**Developer Tools**: Enable browser dev tools for frontend debugging:
```rust
// In src-tauri/src/lib.rs, uncomment:
app.get_webview_window("main").unwrap().open_devtools();
```

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the existing code style
4. Write or update tests for your changes
5. Run the test suite and ensure all tests pass:
   ```bash
   bun run test:run      # Unit tests
   bun run test:e2e      # E2E tests
   bun run lint          # Check linting
   ```
6. Commit your changes with a descriptive message
7. Push to your branch and open a Pull Request

### Development Guidelines

- Follow TDD principles: Write tests before implementation when possible
- Extract business logic into testable utility functions
- Add JSDoc comments to all public functions
- Use TypeScript strict mode and handle all edge cases
- Ensure no TypeScript errors or linting warnings
- Update README if adding new features or commands

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Third-party Licenses

- **yt-dlp**: GPL-3.0 license
- **Tauri**: MIT/Apache-2.0 license
- **React**: MIT license

## Support

- 📖 [Documentation](./docs/)
- 🐛 [Issue Tracker](https://github.com/becksclair/remedia/issues)
- 💬 [Discussions](https://github.com/becksclair/remedia/discussions)

---

Built with ❤️ using [Tauri](https://tauri.app/) and [React](https://reactjs.org/)
