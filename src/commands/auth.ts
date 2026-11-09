import { tr } from '../utils/i18n';
import { Command } from 'commander';
import chalk from 'chalk';
import {
  getConfig,
  getBaseUrl,
  hasApiKey,
  getApiKey,
  deleteApiKey,
  setApiKey,
} from '../utils/config';
import {
  promptApiKey,
  validateApiKeyWithServer,
  maskApiKey,
  assertNotServiceKey,
} from '../utils/auth';
import { getErrorMessage } from '../utils/command-helpers';

export const authCommand = new Command('auth')
  .description('Manage authentication with Deposium API')
  .addCommand(
    new Command('login').description('Authenticate with API key').action(async () => {
      try {
        const config = getConfig();
        const baseUrl = getBaseUrl(config);

        // Check if already logged in
        if (hasApiKey()) {
          console.log(chalk.yellow(tr('\n⚠️  You are already logged in')));
          const currentApiKey = getApiKey();
          console.log(
            chalk.gray(tr('Your current API key: ')) + chalk.cyan(maskApiKey(currentApiKey ?? ''))
          );
          console.log(
            chalk.gray(tr('\nTo logout first, run: ')) + chalk.cyan(tr('deposium auth logout\n'))
          );
          process.exit(0);
        }

        console.log(chalk.cyan(tr('\n🔐 Login to Deposium\n')));
        console.log(chalk.gray(tr('Server: {0}\n', baseUrl)));

        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const apiKey = await promptApiKey();

            console.log(chalk.gray(tr('\nValidating API key...')));
            const isValid = await validateApiKeyWithServer(baseUrl, apiKey);

            if (isValid) {
              setApiKey(apiKey);
              console.log(chalk.green(tr('\n✅ Login successful!')));
              console.log(chalk.gray(tr('API key: ')) + chalk.cyan(maskApiKey(apiKey)));
              console.log(
                chalk.gray(
                  tr('\nYou can now use all Deposium CLI commands without providing credentials.\n')
                )
              );
              process.exit(0);
            }

            const msg =
              attempt < maxAttempts
                ? `\n❌ Invalid API key (attempt ${attempt}/${maxAttempts})\n`
                : '\n❌ Invalid API key - maximum attempts reached';
            console.log(chalk.red(msg));
          } catch (error: unknown) {
            if (attempt < maxAttempts) {
              console.log(
                chalk.red(
                  tr(
                    '\n❌ Error: {0} (attempt {1}/{2})\n',
                    getErrorMessage(error),
                    attempt,
                    maxAttempts
                  )
                )
              );
            } else {
              console.log(chalk.red(tr('\n❌ Error: {0}', getErrorMessage(error))));
            }
          }
        }

        console.log(
          chalk.yellow(
            tr('\n💡 Make sure you are using a valid API key from your Deposium account.\n')
          )
        );
        process.exit(1);
      } catch (error: unknown) {
        console.error(chalk.red(tr('\n❌ Login failed:')), getErrorMessage(error));
        process.exit(1);
      }
    })
  )
  .addCommand(
    new Command('logout').description('Remove stored credentials').action(async () => {
      try {
        if (!hasApiKey()) {
          console.log(chalk.yellow(tr('\n⚠️  You are not logged in\n')));
          process.exit(0);
        }

        const currentKey = getApiKey() ?? '';
        deleteApiKey();

        console.log(chalk.green(tr('\n✅ Logged out successfully')));
        console.log(chalk.gray(tr('Removed API key: ')) + chalk.cyan(maskApiKey(currentKey)));
        console.log(
          chalk.gray(tr('\nTo login again, run: ')) + chalk.cyan(tr('deposium auth login\n'))
        );
      } catch (error: unknown) {
        console.error(chalk.red(tr('\n❌ Logout failed:')), getErrorMessage(error));
        process.exit(1);
      }
    })
  )
  .addCommand(
    new Command('status').description('Show authentication status').action(async () => {
      try {
        const config = getConfig();
        const baseUrl = getBaseUrl(config);
        const envKey = process.env.DEPOSIUM_API_KEY?.trim();

        console.log(chalk.bold(tr('\n🔐 Authentication Status\n')));

        console.log(chalk.gray(tr('Deposium URL: ')) + chalk.cyan(baseUrl));

        if (envKey) {
          // Reject service-keys BEFORE sending them to the server — mirrors
          // ensureAuthenticated. Otherwise the validate-key request leaks
          // a dep_svc_* secret into server access logs via X-API-Key, even
          // though we know we'll reject it anyway.
          assertNotServiceKey(envKey, 'env');

          console.log(chalk.gray(tr('Authentication: ')) + chalk.green(tr('✅ Logged in')));
          console.log(chalk.gray(tr('API Key: ')) + chalk.cyan(maskApiKey(envKey)));
          console.log(
            chalk.gray(tr('Source: ')) +
              chalk.yellow(tr('DEPOSIUM_API_KEY env var')) +
              chalk.gray(tr(' (overrides stored credentials)'))
          );

          console.log(chalk.gray(tr('\nValidating credentials...')));
          try {
            const isValid = await validateApiKeyWithServer(baseUrl, envKey);

            if (isValid) {
              console.log(chalk.green(tr('✅ API key is valid\n')));
            } else {
              console.log(chalk.red(tr('❌ API key is invalid')));
              console.log(
                chalk.gray(tr('Update or unset ')) +
                  chalk.cyan(tr('DEPOSIUM_API_KEY')) +
                  chalk.gray(tr(' to fix\n'))
              );
            }
          } catch (error: unknown) {
            console.log(chalk.yellow('⚠️  Could not validate: ' + getErrorMessage(error) + '\n'));
          }
        } else if (hasApiKey()) {
          const apiKey = getApiKey() ?? '';

          // Same guard as the env-var branch — a stored service-key
          // should be rejected at the CLI boundary before we transmit it.
          assertNotServiceKey(apiKey, 'stored');

          console.log(chalk.gray(tr('Authentication: ')) + chalk.green(tr('✅ Logged in')));
          console.log(chalk.gray(tr('API Key: ')) + chalk.cyan(maskApiKey(apiKey)));
          console.log(chalk.gray(tr('Source: ')) + chalk.cyan(tr('stored credentials')));

          // Try to validate the key
          console.log(chalk.gray(tr('\nValidating credentials...')));
          try {
            const isValid = await validateApiKeyWithServer(baseUrl, apiKey);

            if (isValid) {
              console.log(chalk.green(tr('✅ API key is valid\n')));
            } else {
              console.log(chalk.red(tr('❌ API key is invalid')));
              console.log(
                chalk.gray(tr('Run: ')) +
                  chalk.cyan(tr('deposium auth login')) +
                  chalk.gray(tr(' to re-authenticate\n'))
              );
            }
          } catch (error: unknown) {
            console.log(chalk.yellow('⚠️  Could not validate: ' + getErrorMessage(error) + '\n'));
          }
        } else {
          console.log(chalk.gray(tr('Authentication: ')) + chalk.red(tr('❌ Not logged in')));
          console.log(
            chalk.gray(tr('\nRun: ')) +
              chalk.cyan(tr('deposium auth login')) +
              chalk.gray(tr(' to authenticate\n'))
          );
        }
      } catch (error: unknown) {
        console.error(chalk.red(tr('\n❌ Error:')), getErrorMessage(error));
        process.exit(1);
      }
    })
  );
