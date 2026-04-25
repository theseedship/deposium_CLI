import inquirer from 'inquirer';
import chalk from 'chalk';
import { getApiKey, setApiKey, hasApiKey } from './config';
import { getErrorMessage, hasErrorCauseWithCode } from './errors';

/**
 * Reject `dep_svc_*` keys at the CLI boundary.
 *
 * Service-keys are issued by edge_runtime for **server-side** inter-process
 * auth (Mastra agents, future GLiNER 2 wrapper). The CLI is invoked by a
 * human, who has a user-key (`dep_live_*` / `dep_test_*`) provisioned via
 * the Solid UI. Mixing them up is a footgun: a leaked user-key revokes one
 * user, a leaked service-key compromises the agent fleet.
 *
 * Defense in depth — the server would also reject this, but failing fast
 * here gives the user a precise message instead of a cryptic 401.
 *
 * @throws Error with actionable hint if `key` starts with `dep_svc_`.
 */
export function assertNotServiceKey(key: string, source: 'env' | 'stored' | 'prompt'): void {
  if (!key.startsWith('dep_svc_')) return;

  const sourceHint =
    source === 'env'
      ? 'DEPOSIUM_API_KEY env var'
      : source === 'stored'
        ? '~/.deposium/credentials'
        : 'the entered key';

  throw new Error(
    `${sourceHint} is a service-key (dep_svc_*).\n` +
      `Service-keys are for server-side agent traffic only and cannot be used by the CLI.\n` +
      `Provision a user-key (dep_live_* or dep_test_*) from the Deposium UI and use that instead.`
  );
}

/**
 * Prompt user for API key
 */
export async function promptApiKey(): Promise<string> {
  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter your API key:',
      mask: '*',
      validate: (input: string) => {
        const trimmed = input?.trim() ?? '';
        if (trimmed.length === 0) {
          return 'API key cannot be empty';
        }
        if (trimmed.length < 10) {
          return 'API key seems too short';
        }
        if (trimmed.startsWith('dep_svc_')) {
          return 'Service-keys (dep_svc_*) are for server-side use only — paste a user-key (dep_live_* or dep_test_*).';
        }
        return true;
      },
    },
  ]);

  return apiKey.trim();
}

/**
 * Validate API key with the Deposium API
 *
 * Calls POST /api/auth/validate-key to verify the key is valid
 * and associated with a user account.
 */
export async function validateApiKeyWithServer(baseUrl: string, apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/auth/validate-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
    });

    // Handle different response codes
    if (response.status === 401) {
      return false; // Invalid key
    }

    if (!response.ok) {
      // For other errors (500, etc.), throw to trigger retry logic
      throw new Error(`Validation failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { valid?: boolean };
    return data.valid === true;
  } catch (error: unknown) {
    // Check for connection errors (ECONNREFUSED, etc.)
    if (
      hasErrorCauseWithCode(error, 'ECONNREFUSED') ||
      getErrorMessage(error).includes('ECONNREFUSED')
    ) {
      throw new Error(`Cannot connect to Deposium API at ${baseUrl}`);
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Ensure user is authenticated, with retry logic.
 *
 * Resolution priority mirrors `getConfig().apiKey`:
 *   1. `DEPOSIUM_API_KEY` env var (returned as-is, no server validation —
 *      consistent with config resolution and friendly to CI/CD pipelines).
 *   2. Stored credential — validated against the server, with retry-prompt
 *      fallback on invalidation.
 *   3. Interactive prompt loop (max 3 attempts) that saves on success.
 */
export async function ensureAuthenticated(baseUrl: string): Promise<string> {
  // Env var takes priority — if set, use it directly (no server validation).
  // Matches getConfig().apiKey resolution order; CI/CD usage stays zero-prompt.
  const envKey = process.env.DEPOSIUM_API_KEY?.trim();
  if (envKey) {
    assertNotServiceKey(envKey, 'env');
    return envKey;
  }

  // Check if we already have a stored API key
  if (hasApiKey()) {
    const existingKey = getApiKey() as string;
    assertNotServiceKey(existingKey, 'stored');

    try {
      const isValid = await validateApiKeyWithServer(baseUrl, existingKey);
      if (isValid) {
        return existingKey;
      }

      // If key is invalid, notify user and continue to re-authentication
      console.log(chalk.yellow('\n⚠️  Stored API key is no longer valid\n'));
    } catch (error: unknown) {
      // If there's a connection error or other issue, we'll try to proceed with stored key
      console.log(
        chalk.yellow('\n⚠️  Could not validate stored API key: ' + getErrorMessage(error))
      );
      console.log(chalk.gray('Attempting to continue with stored key...\n'));
      return existingKey;
    }
  }

  // No valid key stored, need to authenticate
  console.log(chalk.cyan('🔐 Authentication required for Deposium API\n'));

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const apiKey = await promptApiKey();

      console.log(chalk.gray('Validating API key...'));
      const isValid = await validateApiKeyWithServer(baseUrl, apiKey);

      if (isValid) {
        // Save the valid key
        setApiKey(apiKey);
        console.log(chalk.green('✅ API key validated successfully\n'));
        return apiKey;
      } else {
        if (attempt < maxAttempts) {
          console.log(
            chalk.red(`\n❌ Authentication failed (attempt ${attempt}/${maxAttempts})\n`)
          );
        } else {
          console.log(chalk.red('\n❌ Authentication failed - maximum attempts reached\n'));
        }
      }
    } catch (error: unknown) {
      if (attempt < maxAttempts) {
        console.log(
          chalk.red(`\n❌ Error: ${getErrorMessage(error)} (attempt ${attempt}/${maxAttempts})\n`)
        );
      } else {
        console.log(chalk.red(`\n❌ Error: ${getErrorMessage(error)}\n`));
      }
    }
  }

  // If we get here, authentication failed after all attempts
  console.log(chalk.yellow('💡 To configure your API key manually, run:'));
  console.log(chalk.cyan('   deposium auth login\n'));
  console.log(chalk.gray('Or set it directly:'));
  console.log(chalk.cyan('   deposium config set apiKey <your-api-key>\n'));

  process.exit(1);
}

/**
 * Mask API key for display (show first 8 chars + ...)
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return '********';
  }
  return apiKey.substring(0, 8) + '...';
}
