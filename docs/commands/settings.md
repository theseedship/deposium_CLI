> Revision: 2026-11-09

# Settings — language and default space (CLI 1.8.0+)

Open **Settings** in the main menu, or run `deposium settings`. The main menu
and local Settings can open before login; only an API-backed operation asks for
authentication. Language settings
and the settings view work offline; choosing a default space needs your account's
fresh authorized catalogue. These settings use the existing encrypted configuration;
they do not change your saved API key or server permissions.

```bash
deposium settings
deposium settings show --json
deposium settings language fr
deposium settings language en
deposium settings language auto
```

Language priority: **`--lang fr|en` for this invocation → saved `fr|en` → terminal
locale → English**. Automatic mode ignores a saved language override. Locale
precedence is `LC_ALL`, `LC_MESSAGES`, then `LANG`; the first nonempty value wins.
Unsupported locales, `C` and `POSIX` fall back to English. The flag is never saved.

```bash
deposium --lang en --help
deposium --lang fr chat
```

The effective language controls the main menu, settings, authentication prompts,
chat activity/source/verification labels, shared diagnostics and command help.
Chat sends it as the default response language; an explicit request in your
question can still ask for another language. Commands, flags, JSON keys, model
names, schemas, quoted passages and server-provided descriptions/errors keep
their original values. Some historical advanced-command output and third-party
prompt keyboard hints remain English; this release does not translate server data.
`validate --language` remains its separate task-specific server option, and
`evaluate --language` still means a programming language.

## Remember one authorized default space

```bash
deposium settings space
deposium settings space YOUR_SPACE_ID --json
deposium settings space --clear
```

Without an ID, choose by **name** in a terminal. An explicit ID is rechecked against
the current catalogue before saving. A refusal, empty catalogue or network failure
preserves the prior preference. `--clear` removes only the saved default and never
calls the server. JSON/scripts require an explicit ID or `--clear`, without prompts.

The saved default is shared by Chat and the existing scoped Search/Graph/Corpus
commands. Chat and the menu revalidate its access; an inaccessible interactive
default warns and requires a new choice. An inaccessible script default fails.
An explicit `--space` is never silently replaced. The server still authorizes every
operation; a local preference grants no access. Chat's `/space` changes the running
conversation, without overwriting the saved default. A real scope change clears
conversation history as before.

`DEPOSIUM_SPACE` overrides the saved default. Settings warns when that variable is
active: clearing or changing the saved value cannot remove the environment override.
General AI (Compound) remains unscoped; a default space does not change its contract.

## Diagnose the effective configuration

```bash
deposium health --context
deposium health --context --format json
deposium health --context --verbose --format json
```

`settings show --json` returns local context only, with a configured space marked
`unverified`. Health context checks that ID against a fresh catalogue and reports
`accessible`, `inaccessible`, `unavailable` (catalogue failed), or `none`. It never
selects a replacement. A healthy endpoint and a failed catalogue are distinct facts.
The displayed origins omit URL credentials, paths, query values and fragments.
No API key is included.

Existing `health --format json` keeps the original response shape. Only explicit
`--context` adds the `{ health, context }` envelope; verbose context also includes
`details`. JSON keys and status codes stay stable in both languages. Diagnostics
go to stderr, without progress output on JSON stdout.
