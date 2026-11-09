import { Command, Help } from 'commander';
import { getLanguage, tr } from './i18n';

/** Translate descriptions at render time; command names, flags and JSON keys remain stable. */
export function configureLanguageHelp(command: Command): void {
  const defaults = new Help();
  command.configureHelp({
    showGlobalOptions: true,
    commandDescription: (cmd) => tr(defaults.commandDescription(cmd)),
    subcommandDescription: (cmd) => tr(defaults.subcommandDescription(cmd)),
    optionDescription: (option) => {
      const description = defaults.optionDescription(option);
      return (
        tr(option.description) +
        description
          .slice(option.description.length)
          .replace(/\b(choices|default|preset|env):/g, (label) => tr(label))
      );
    },
    argumentDescription: (argument) => tr(defaults.argumentDescription(argument)),
    formatHelp: (cmd, helper) => {
      const text = defaults.formatHelp(cmd, helper);
      return getLanguage() === 'fr'
        ? text.replace(/^(Usage|Arguments|Options|Commands|Global Options):/gm, (label) =>
            tr(label)
          )
        : text;
    },
  });
  command.configureOutput({
    outputError: (message, write) => {
      if (getLanguage() === 'en') return write(message);
      write(
        message
          .replace(/^error: unknown command '([^']*)'/, (_, name: string) =>
            tr("error: unknown command '{0}'", name)
          )
          .replace(/^error: unknown option '([^']*)'/, (_, name: string) =>
            tr("error: unknown option '{0}'", name)
          )
          .replace(/^error: missing required argument '([^']*)'/, (_, name: string) =>
            tr("error: missing required argument '{0}'", name)
          )
          .replace(/^error: option '([^']*)' argument missing/, (_, name: string) =>
            tr("error: option '{0}' argument missing", name)
          )
          .replace(/\(Did you mean ([^\n]*)\?\)/g, (_, hint: string) =>
            tr('(Did you mean {0}?)', hint)
          )
          .replace(/^error:/, tr('error:'))
      );
    },
  });
  for (const child of command.commands) configureLanguageHelp(child);
}
