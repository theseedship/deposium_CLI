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
import { promptApiKey, validateApiKeyWithServer, maskApiKey } from '../utils/auth';
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
          console.log(chalk.yellow('\n⚠️  You are already logged in'));
          console.log(chalk.gray('Your current API key: ') + chalk.cyan(maskApiKey(getApiKey()!)));
          console.log(
            chalk.gray('\nTo logout first, run: ') + chalk.cyan('deposium auth logout\n')
          );
          process.exit(0);
        }

        console.log(chalk.cyan('\n🔐 Login to Deposium\n'));
        console.log(chalk.gray(`Server: ${baseUrl}\n`));

        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const apiKey = await promptApiKey();

            console.log(chalk.gray('\nValidating API key...'));
            const isValid = await validateApiKeyWithServer(baseUrl, apiKey);

            if (isValid) {
              setApiKey(apiKey);
              console.log(chalk.green('\n✅ Login successful!'));
              console.log(chalk.gray('API key: ') + chalk.cyan(maskApiKey(apiKey)));
              console.log(
                chalk.gray(
                  '\nYou can now use all Deposium CLI commands without providing credentials.\n'
                )
              );
              process.exit(0);
            } else {
              if (attempt < maxAttempts) {
                console.log(
                  chalk.red(`\n❌ Invalid API key (attempt ${attempt}/${maxAttempts})\n`)
                );
              } else {
                console.log(chalk.red('\n❌ Invalid API key - maximum attempts reached'));
              }
            }
          } catch (error: unknown) {
            if (attempt < maxAttempts) {
              console.log(
                chalk.red(
                  `\n❌ Error: ${getErrorMessage(error)} (attempt ${attempt}/${maxAttempts})\n`
                )
              );
            } else {
              console.log(chalk.red(`\n❌ Error: ${getErrorMessage(error)}`));
            }
          }
        }

        console.log(
          chalk.yellow('\n💡 Make sure you are using a valid API key from your Deposium account.\n')
        );
        process.exit(1);
      } catch (error: unknown) {
        console.error(chalk.red('\n❌ Login failed:'), getErrorMessage(error));
        process.exit(1);
      }
    })
  )
  .addCommand(
    new Command('logout').description('Remove stored credentials').action(async () => {
      try {
        if (!hasApiKey()) {
          console.log(chalk.yellow('\n⚠️  You are not logged in\n'));
          process.exit(0);
        }

        const currentKey = getApiKey()!;
        deleteApiKey();

        console.log(chalk.green('\n✅ Logged out successfully'));
        console.log(chalk.gray('Removed API key: ') + chalk.cyan(maskApiKey(currentKey)));
        console.log(chalk.gray('\nTo login again, run: ') + chalk.cyan('deposium auth login\n'));
      } catch (error: unknown) {
        console.error(chalk.red('\n❌ Logout failed:'), getErrorMessage(error));
        process.exit(1);
      }
    })
  )
  .addCommand(
    new Command('status').description('Show authentication status').action(async () => {
      try {
        const config = getConfig();
        const baseUrl = getBaseUrl(config);

        console.log(chalk.bold('\n🔐 Authentication Status\n'));

        console.log(chalk.gray('Deposium URL: ') + chalk.cyan(baseUrl));

        if (hasApiKey()) {
          const apiKey = getApiKey()!;
          console.log(chalk.gray('Authentication: ') + chalk.green('✅ Logged in'));
          console.log(chalk.gray('API Key: ') + chalk.cyan(maskApiKey(apiKey)));

          // Try to validate the key
          console.log(chalk.gray('\nValidating credentials...'));
          try {
            const { validateApiKeyWithServer } = await import('../utils/auth');
            const isValid = await validateApiKeyWithServer(baseUrl, apiKey);

            if (isValid) {
              console.log(chalk.green('✅ API key is valid\n'));
            } else {
              console.log(chalk.red('❌ API key is invalid'));
              console.log(
                chalk.gray('Run: ') +
                  chalk.cyan('deposium auth login') +
                  chalk.gray(' to re-authenticate\n')
              );
            }
          } catch (error: unknown) {
            console.log(chalk.yellow('⚠️  Could not validate: ' + getErrorMessage(error) + '\n'));
          }
        } else {
          console.log(chalk.gray('Authentication: ') + chalk.red('❌ Not logged in'));
          console.log(
            chalk.gray('\nRun: ') +
              chalk.cyan('deposium auth login') +
              chalk.gray(' to authenticate\n')
          );
        }
      } catch (error: unknown) {
        console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
        process.exit(1);
      }
    })
  );
