> Revision: 2026-04-24

# Contributing to Deposium CLI

Thank you for your interest in contributing to Deposium CLI! This document provides guidelines and instructions for contributing to the project.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Code Quality Standards](#code-quality-standards)
- [Pull Request Process](#pull-request-process)
- [Git Hooks](#git-hooks)
- [CI/CD Pipeline](#cicd-pipeline)

## 🤝 Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Follow the project's coding standards

## 🛠️ Development Setup

### Prerequisites

- **Node.js**: >= 22.x
- **npm**: Latest version
- **Git**: For version control

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/theseedship/deposium_CLI.git
cd deposium_CLI

# Install dependencies
npm install

# Install Husky hooks
npm run prepare

# Verify setup
npm run typecheck
npm run lint
npm run build
```

## 🔄 Development Workflow

### 1. Create a Feature Branch

Always create a new branch from `main`:

```bash
git checkout main
git pull origin main
git checkout -b feat/your-feature-name
```

**Branch naming conventions:**

- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions/modifications
- `chore/` - Maintenance tasks

### 2. Make Your Changes

Follow these guidelines:

- Write clear, descriptive commit messages
- Keep commits atomic and focused
- Add tests for new features
- Update documentation as needed
- Follow the existing code style

### 3. Commit Your Changes

Our Git hooks will automatically run quality checks:

```bash
git add .
git commit -m "feat: add new search feature"
```

**Pre-commit hook will:**

- ✅ Run ESLint with auto-fix
- ✅ Run Prettier to format code
- ✅ Only on staged files (fast!)

**Pre-push hook will:**

- ✅ Run TypeScript type checking
- ✅ Run full build to ensure no errors

### 4. Push and Create Pull Request

```bash
git push origin feat/your-feature-name
```

Then create a PR on GitHub with:

- Clear title describing the change
- Detailed description of what and why
- Reference any related issues
- Screenshots/examples if applicable

## 📏 Code Quality Standards

### TypeScript

- Use TypeScript for all code
- Enable strict mode in `tsconfig.json`
- Avoid `any` types when possible
- Document complex types and interfaces

### ESLint Rules

We enforce strict linting rules:

```bash
# Run linter
npm run lint

# Auto-fix issues
npm run lint:fix
```

**Key rules:**

- No unused variables
- Consistent code style
- Proper error handling
- Complexity limits (max 15)
- Max function length (100 lines)
- No floating promises

### Code Formatting

We use Prettier for consistent formatting:

```bash
# Format all files
npm run format

# Check formatting
npx prettier --check .
```

**Prettier config:**

- Single quotes
- Semicolons required
- 2-space indentation
- 100 character line width
- LF line endings

### Type Checking

All code must pass TypeScript type checking:

```bash
npm run typecheck
```

## 🔍 Pull Request Process

### Before Submitting

Ensure your PR passes all checks:

1. **Lint:** `npm run lint` ✅
2. **Format:** `npx prettier --check .` ✅
3. **Type Check:** `npm run typecheck` ✅
4. **Build:** `npm run build` ✅
5. **Tests:** `npm test` ✅

### PR Template

Use this template for your PR description:

```markdown
## Summary

Brief description of the changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Changes Made

- List of specific changes
- With bullet points

## Testing

- How to test these changes
- Any special testing considerations

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added to complex code
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests added/updated
- [ ] All tests passing
```

### Code Review

- Address all review comments
- Keep discussions professional and constructive
- Make requested changes in new commits
- Squash commits before merging (if requested)

### Merging

PRs will be merged when:

- ✅ All CI/CD checks pass
- ✅ Code review approved
- ✅ No merge conflicts
- ✅ Documentation updated
- ✅ Tests passing

## 🪝 Git Hooks

We use Husky for automated quality checks:

### Pre-commit Hook

Runs on every commit:

```bash
# .husky/pre-commit
- ESLint (auto-fix)
- Prettier (auto-format)
- Only on staged files (via lint-staged)
```

**To bypass** (emergency only):

```bash
git commit --no-verify -m "emergency fix"
```

### Pre-push Hook

Runs before pushing:

```bash
# .husky/pre-push
- TypeScript type checking
- Full build verification
```

**To bypass** (not recommended):

```bash
git push --no-verify
```

## 🚀 CI/CD Pipeline

Every PR triggers automated checks on GitHub Actions:

### Quality Job

- ✅ ESLint verification
- ✅ Prettier check
- ✅ TypeScript type checking
- ✅ Tests execution
- 🔄 Runs on Node 22.x

### Build Job

- ✅ Build verification
- ✅ Artifact validation

### Security Job

- ✅ npm audit (dependency vulnerabilities)
- ✅ TruffleHog (secret detection)

### Viewing CI Results

1. Go to your PR on GitHub
2. Check "Checks" tab
3. View detailed logs for any failures
4. Fix issues and push again

## 📝 Commit Message Guidelines

Follow Conventional Commits:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting, missing semi-colons, etc.
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

**Examples:**

```bash
feat(auth): add API key authentication system

Implement secure API key authentication for all CLI commands.
Includes login, logout, and status commands with retry logic.

Closes #123
```

```bash
fix(search): handle empty query results gracefully

Previously crashed on empty results. Now shows friendly message.
```

## 🧪 Testing

### Run Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

### Writing Tests

- Place tests in `src/__tests__/` directory: `*.test.ts`
- Use descriptive test names
- Test edge cases and error conditions
- Aim for high coverage on critical paths

## 🐛 Reporting Issues

When reporting bugs:

1. Check existing issues first
2. Provide clear title and description
3. Include reproduction steps
4. Add error messages/stack traces
5. Specify environment details
6. Add screenshots if helpful

## 💡 Feature Requests

For new features:

1. Search existing feature requests
2. Describe the problem it solves
3. Provide use case examples
4. Consider implementation approach
5. Be open to discussion

## 📚 Additional Resources

- **Website**: [deposium.ai](https://deposium.ai)
- **Documentation**: [docs/](.) — local documentation
- **Issues**: [GitHub Issues](https://github.com/theseedship/deposium_CLI/issues)
- **Community**: [Discord](https://discord.gg/88unzXDT)

## 🙏 Thank You!

Your contributions make Deposium CLI better for everyone. We appreciate your time and effort!

---

**Questions?** Open an issue or reach out to the maintainers.
