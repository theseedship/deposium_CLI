import inquirer from 'inquirer';
import chalk from 'chalk';
import { getApiKey, setApiKey, hasApiKey } from './config';

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
        if (input?.trim().length === 0) {
          return 'API key cannot be empty';
        }
        if (input.trim().length < 10) {
          return 'API key seems too short';
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
  } catch (error: any) {
    // Check for connection errors (ECONNREFUSED, etc.)
    if (error.cause?.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
      throw new Error(`Cannot connect to Deposium API at ${baseUrl}`);
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Ensure user is authenticated, with retry logic
 */
export async function ensureAuthenticated(baseUrl: string): Promise<string> {
  // Check if we already have a stored API key
  if (hasApiKey()) {
    const existingKey = getApiKey()!;

    try {
      const isValid = await validateApiKeyWithServer(baseUrl, existingKey);
      if (isValid) {
        return existingKey;
      }

      // If key is invalid, notify user and continue to re-authentication
      console.log(chalk.yellow('\n⚠️  Stored API key is no longer valid\n'));
    } catch (error: any) {
      // If there's a connection error or other issue, we'll try to proceed with stored key
      console.log(chalk.yellow('\n⚠️  Could not validate stored API key: ' + error.message));
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
    } catch (error: any) {
      if (attempt < maxAttempts) {
        console.log(
          chalk.red(`\n❌ Error: ${error.message} (attempt ${attempt}/${maxAttempts})\n`)
        );
      } else {
        console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
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
 * Handle authentication errors (401) during operations
 */
export function handleAuthError(error: any): void {
  if (error.message.includes('401') || error.message.includes('Authentication')) {
    console.error(chalk.red('\n❌ Authentication failed'));
    console.log(chalk.yellow('\nYour API key may be invalid or expired.'));
    console.log(chalk.cyan('Run: deposium auth login') + chalk.gray(' to re-authenticate\n'));
    process.exit(1);
  }
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
