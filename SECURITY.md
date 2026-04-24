# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅ Yes    |
| < 1.0   | ❌ No     |

## Reporting a Vulnerability

If you discover a security vulnerability in Deposium CLI, please **do not
open a public issue**. Instead, report it privately so we can address it
before disclosure.

**Email**: `security@deposium.vip`

Include in your report:

- A clear description of the issue
- Steps to reproduce (minimal example preferred)
- The version of the CLI (`deposium --version`) and your OS
- Any known mitigations or workarounds

## Disclosure Timeline

We follow a coordinated 90-day disclosure window:

- **Within 48 hours** — we acknowledge receipt and open an internal ticket
- **Within 7 days** — we confirm whether the issue is reproducible and
  assess severity (CVSS)
- **Within 30 days** — we publish a patched version if the severity
  warrants a release
- **Within 90 days** — we publicly disclose the vulnerability and credit
  the reporter (if they consent)

If the issue is actively exploited in the wild, we may accelerate the
timeline.

## Scope

In scope:

- Vulnerabilities in the CLI code itself (`@deposium/cli` npm package)
- Credential leakage through the CLI (config files, env vars, stdout/stderr)
- Insecure defaults (TLS, auth, storage)
- Supply chain issues in our direct dependencies

Out of scope:

- The Deposium server infrastructure (reachable via `DEPOSIUM_URL`) — report
  those separately via the same email with `[SERVER]` in the subject line
- Social engineering of npm / GitHub accounts
- Vulnerabilities in third-party CLIs or tools unrelated to ours

## Safe Harbor

We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations and service disruption
- Report promptly without making the vulnerability public before resolution
- Do not exfiltrate more data than strictly necessary to demonstrate the issue

Thank you for helping keep Deposium and its users secure.
