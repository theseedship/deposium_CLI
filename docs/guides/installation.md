# Installation Guide

## 📦 Installation Options

### Option 1: npm (Recommended for end-users)

```bash
npm install -g @deposium/cli

# Verify installation
deposium --version
```

### Option 2: Bun Binary (Recommended for production/CI)

```bash
# Linux
curl -fsSL https://github.com/theseedship/deposium_CLI/releases/latest/download/deposium-linux -o deposium
chmod +x deposium
sudo mv deposium /usr/local/bin/

# macOS
curl -fsSL https://github.com/theseedship/deposium_CLI/releases/latest/download/deposium-macos -o deposium
chmod +x deposium
sudo mv deposium /usr/local/bin/

# Windows
# Download from: https://github.com/theseedship/deposium_CLI/releases/latest/download/deposium-windows.exe
```

### Option 3: Docker

```bash
docker pull deposium/cli:latest

# Run with alias
alias deposium='docker run -it --rm deposium/cli'
```

## 🛠️ Local Installation (Development)

Install and test the CLI locally without publishing to npm. Perfect for development, testing, and contributing.

### Prerequisites

```bash
# Clone and setup
git clone https://github.com/theseedship/deposium_CLI.git
cd deposium_CLI
npm install

# Build the project first (required for all methods)
npm run build
```

### Method 1: npm link (Recommended for active development)

Creates a **symlink** to your local package. Changes are reflected immediately after rebuilding.

```bash
npm run build
npm link

# Test it works
deposium --version

# Uninstall when done
npm unlink -g @deposium/cli
```

**✅ Best for:**

- Active development with frequent code changes
- Hot-reload workflow (rebuild + test immediately)
- Quick iteration cycles

**⚠️ Note:** Changes require `npm run build` to take effect.

### Method 2: npm install -g . (Classic global install)

Installs the package globally from your local directory, like a real npm install.

```bash
npm run build
npm install -g .

# Test it works
deposium --version

# Uninstall when done
npm uninstall -g @deposium/cli
```

**✅ Best for:**

- Testing the full installation experience
- Verifying the package works as a standard npm package
- Integration testing

**⚠️ Note:** Requires reinstalling after each code change.

### Method 3: npm pack (Simulates production install)

Creates a **tarball** (.tgz) exactly as npm publish would, then installs from it. Most realistic production simulation.

```bash
npm run build
npm pack
# Creates: deposium-cli-1.0.0.tgz

npm install -g ./deposium-cli-1.0.0.tgz

# Test it works
deposium --version

# Uninstall when done
npm uninstall -g @deposium/cli
rm deposium-cli-1.0.0.tgz
```

**✅ Best for:**

- Pre-publish validation
- Testing exactly what will be published to npm
- Verifying package.json "files" field
- Finding missing dependencies or files

### Method 4: Bun Binary (Production-ready executable)

Compiles a **standalone binary** with zero dependencies. Same as production releases.

```bash
# Build for your platform
npm run build:bun-linux    # Linux x64
npm run build:bun-macos    # macOS x64
npm run build:bun-windows  # Windows x64

# Or build all platforms
npm run build:all

# Test the binary directly
./dist/deposium-linux --version

# Or install globally
sudo cp ./dist/deposium-linux /usr/local/bin/deposium
deposium --version

# Uninstall
sudo rm /usr/local/bin/deposium
```

**✅ Best for:**

- Testing production binaries
- Distribution without Node.js dependency
- CI/CD environments
- End-user testing

**⚠️ Requires:** Bun runtime installed (`curl -fsSL https://bun.sh/install | bash`)

### Method 5: npm run dev (No installation)

Run directly from source without any installation. Fastest for quick tests.

```bash
npm run dev -- --version
npm run dev -- search "test query"
npm run dev -- health
```

**✅ Best for:**

- Quick testing during development
- Debugging with TypeScript source maps
- No global installation needed
