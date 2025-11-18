# ReMedia

A cross-platform desktop media downloader built with Tauri, React, and yt-dlp. ReMedia provides a clean, modern interface for downloading media from various web sources including YouTube, Vimeo, and other supported platforms.

## Features

- **Drag & Drop Support**: Simply drag media URLs into the application
- **Clipboard Detection**: Automatically detects URLs copied to clipboard
- **Real-time Progress**: Live download progress with detailed status updates
- **Metadata Extraction**: Automatically extracts video titles, thumbnails, and metadata
- **Cross-platform**: Works on Windows, macOS, and Linux
- **Modern UI**: Built with shadcn/ui components and Tailwind CSS
- **Preview Window**: Built-in media player for preview functionality

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
bun run test:e2e           # Run Playwright end-to-end tests
bun run test:e2e:web       # Run web-only Playwright tests
bun run test:e2e:headed    # Run Playwright tests with headed browser
bun run test:e2e:install   # Install Playwright browsers
```

### Component Management

```bash
bun run sh-add [component]    # Add new shadcn/ui component
bun run sh-up                 # Update existing shadcn/ui components
```

## Architecture

- **Frontend**: React 19.2.0 + TypeScript with strict mode
- **Backend**: Rust with Tauri 2.9.3 framework
- **State Management**: Jotai atoms for reactive state
- **UI Components**: shadcn/ui with Tailwind CSS
- **Media Engine**: yt-dlp for extraction and downloads
- **Build System**: Vite for frontend, Cargo for backend

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

Enable developer tools for debugging:
```rust
// In src-tauri/src/lib.rs, uncomment:
app.get_webview_window("main").unwrap().open_devtools();
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting (`bun run check && bun run test:e2e`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

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
