# Contributing to ReMedia

Thank you for your interest in contributing to ReMedia! This guide will help you get started with contributing to this cross-platform media downloader.

## Getting Started

### Prerequisites

Before contributing, please ensure you have:
- Read the [Development Setup Guide](./docs/dev-setup.md)
- Set up your development environment
- Familiarized yourself with the project architecture in [docs/architecture.md](./docs/architecture.md)

### Quick Start

```bash
# Clone and setup
git clone https://github.com/becksclair/remedia.git
cd remedia
bun install

# Start development
bun tauri dev

# Run tests and checks
bun run lint && bun run test:e2e
```

## How to Contribute

### Reporting Issues

- **Bug Reports**: Use the [issue tracker](https://github.com/becksclair/remedia/issues) with detailed information
- **Feature Requests**: Open an issue with the "enhancement" label
- **Questions**: Use GitHub Discussions for general questions

### Development Workflow

1. **Fork the Repository**
   ```bash
   # Fork on GitHub, then clone your fork
   git clone https://github.com/your-username/remedia.git
   cd remedia
   ```

2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

3. **Make Your Changes**
   - Follow the existing code style and patterns
   - Add tests for new functionality
   - Update documentation as needed

4. **Test Your Changes**
   ```bash
   # Run all quality checks
   bun run lint
   bun run fmt
   bun run test:e2e
   
   # Manual testing
   bun tauri dev
   ```

5. **Commit Your Changes**
   ```bash
   # Use conventional commit format
   git commit -m "feat: add new download progress indicator"
   # or
   git commit -m "fix: resolve URL parsing error for special characters"
   ```

6. **Push and Create Pull Request**
   ```bash
   git push origin feature/your-feature-name
   # Then create PR on GitHub
   ```

## Code Style Guidelines

### TypeScript/JavaScript

- **Strict Mode**: All TypeScript code must pass strict type checking
- **Naming**: Use camelCase for variables, PascalCase for components/types
- **Imports**: Use absolute imports with `@/` alias for internal modules
- **Error Handling**: Always handle errors appropriately, no silent failures

### Rust

- **Formatting**: Run `cargo fmt` before committing
- **Linting**: Pass `cargo clippy` with no warnings
- **Error Types**: Use `Result<T, String>` for Tauri commands
- **Async**: Use `async/await` for non-blocking operations

### General Guidelines

- **Component Structure**: Keep components focused and single-purpose
- **State Management**: Use Jotai atoms for shared state, local state for component-specific data
- **Documentation**: Add comments for complex logic and public APIs
- **Testing**: Write tests for new features and critical bug fixes

## Development Areas

### Frontend (React/TypeScript)

- **UI Components**: Located in `src/components/`
- **State Management**: Jotai atoms in `src/state/`
- **Type Definitions**: Shared types in `src/types/`
- **Hooks**: Custom hooks in `src/hooks/`

### Backend (Rust)

- **Commands**: Tauri command handlers in `src-tauri/src/`
- **Downloader**: yt-dlp integration in `downloader.rs`
- **Window Management**: System utilities in `remedia.rs`

### Testing

- **E2E Tests**: Playwright tests in `e2e/`
- **Component Tests**: Add alongside components when needed
- **Integration Tests**: Test IPC communication patterns

## Pull Request Process

### Before Submitting

- [ ] Code follows project style guidelines
- [ ] All tests pass (`bun run test:e2e`)
- [ ] Code is properly formatted (`bun run fmt`)
- [ ] No linting errors (`bun run lint`)
- [ ] Documentation is updated if needed
- [ ] Commits follow conventional format

### Pull Request Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] E2E tests pass
- [ ] Manual testing completed
- [ ] Added new tests for functionality

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
```

## Code Review Guidelines

### For Reviewers

- Check for adherence to project patterns
- Verify error handling is appropriate
- Ensure tests are comprehensive
- Look for performance implications
- Validate security considerations

### For Contributors

- Be responsive to feedback
- Explain complex design decisions
- Address all review comments
- Update tests based on review suggestions

## Getting Help

- **Documentation**: Check [docs/](./docs/) folder first
- **Issues**: Search existing issues before creating new ones
- **Discussions**: Use GitHub Discussions for questions
- **Discord**: Join our community Discord (link in README)

## Recognition

Contributors are recognized in:
- README.md contributors section
- Release notes for significant contributions
- GitHub contributor statistics

Thank you for contributing to ReMedia! Your help makes this project better for everyone.
