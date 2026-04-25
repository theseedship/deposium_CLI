> Revision: 2026-04-25

# MCP Auth Error Codes

The CLI surfaces structured authentication errors as instances of
`MCPAuthError` (exported from `@deposium/cli`'s internal client). Programmatic
callers should switch on `errorCode`, which is stable across server versions.
The human-readable `message` and `hint` may change wording.

## Stable enum

Mirrors the server-side `ApiKeyErrorCode` enum in `deposium_MCPs`.

| `errorCode`           | Meaning                                                     |
| --------------------- | ----------------------------------------------------------- |
| `key_missing`         | No `X-API-Key` and no `Authorization: Bearer` header        |
| `format_invalid`      | Key doesn't match `dep_(live\|test)_<43 b64url>`            |
| `key_invalid`         | Format OK but revoked / expired / not in DB                 |
| `permission_denied`   | Key valid but lacks scope or tool permission                |
| `rate_limited`        | Upstream 429                                                |
| `auth_unavailable`    | Upstream auth circuit breaker OPEN                          |
| `auth_timeout`        | Upstream auth >8s                                           |
| `auth_internal_error` | Upstream 5xx / 404                                          |
| `accept_invalid`      | Bad `Accept` header (CLI bug — should never reach the user) |
| `unknown`             | Catch-all (legacy responses, unexpected shapes)             |

## Class shape

```typescript
import { MCPAuthError, MCPAuthErrorCode } from '@deposium/cli';
//      ↑ exported from src/client/mcp-client.ts

class MCPAuthError extends Error {
  readonly errorCode: MCPAuthErrorCode;
  readonly hint?: string;
  readonly docsUrl?: string;
}
```

The `message` field already includes the hint (prefixed `💡`) and docs link
(prefixed `📖`) on separate lines, so printing `error.message` is fine for
end-user output.

## Recommended pattern

```typescript
import { MCPClient, MCPAuthError } from '@deposium/cli';

const client = new MCPClient(baseUrl, apiKey);

try {
  await client.callTool('search_hub', { query: 'x' });
} catch (e) {
  if (e instanceof MCPAuthError) {
    switch (e.errorCode) {
      case 'format_invalid':
        console.error(`API key is malformed. ${e.hint}`);
        process.exit(2);
      case 'key_invalid':
        console.error(`API key was rejected. ${e.hint}`);
        console.error('Run `deposium auth` to refresh.');
        process.exit(2);
      case 'permission_denied':
        console.error(`Permission denied. ${e.hint}`);
        process.exit(3);
      case 'rate_limited':
        console.error(e.message);
        process.exit(4);
      default:
        // auth_unavailable, auth_timeout, auth_internal_error, unknown
        console.error(e.message);
        process.exit(1);
    }
  }
  throw e;
}
```

## When the error is NOT an `MCPAuthError`

If the server returns a 401 with a non-structured body (older server, or
non-`/api/cli/mcp` endpoint), the CLI throws a plain `Error` with the
message `Authentication failed (401)\n<body.message>`. The caller can
still recover with `instanceof MCPAuthError` checks (which will fall
through to the generic catch).

## Server reference

Defined upstream in `deposium_solid` commit `7af3a6a02` (2026-04-25). See
the `/api/cli/mcp` route handler for the exact response shape.
