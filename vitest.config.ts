import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Many test files mock chalk/inquirer/MCPClient at module level. With 25+
    // files running in parallel + dynamic `await import('../chat')` inside
    // tests, the import phase can spike under load. 15s leaves headroom for
    // CI runners without masking real hangs.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
