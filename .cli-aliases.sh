#!/bin/bash
# Deposium CLI Aliases and Usage Guide
# Source this file to get quick aliases for the CLI

# ====================================
# CLI Aliases (Non-Global Installation)
# ====================================

# If you haven't installed the CLI globally, use these aliases:
alias deposium='cd /home/nico/code_source/tss/deposium_fullstack/deposium_CLI && npm run dev --'
alias dep='cd /home/nico/code_source/tss/deposium_fullstack/deposium_CLI && npm run dev --'

# Quick commands
alias dep-health='cd /home/nico/code_source/tss/deposium_fullstack/deposium_CLI && npm run dev -- health'
alias dep-search='cd /home/nico/code_source/tss/deposium_fullstack/deposium_CLI && npm run dev -- search'
alias dep-config='cd /home/nico/code_source/tss/deposium_fullstack/deposium_CLI && npm run dev -- config get'

# ====================================
# How to Use
# ====================================

# 1. Add to your shell rc file:
#    echo 'source /home/nico/code_source/tss/deposium_fullstack/deposium_CLI/.cli-aliases.sh' >> ~/.bashrc
#    # OR for zsh:
#    echo 'source /home/nico/code_source/tss/deposium_fullstack/deposium_CLI/.cli-aliases.sh' >> ~/.zshrc

# 2. Reload your shell:
#    source ~/.bashrc  # or ~/.zshrc

# 3. Use the CLI from anywhere:
#    deposium health
#    dep search "machine learning"
#    dep-health

# ====================================
# Examples
# ====================================

# Health check
# deposium health

# Search
# deposium search "AI"
# dep search "machine learning" --vector

# Config
# deposium config set mcp-url http://localhost:4001
# deposium config get

# Interactive mode
# deposium interactive

echo "✅ Deposium CLI aliases loaded!"
echo "Usage: deposium <command> | dep <command> | dep-<shortcut>"
