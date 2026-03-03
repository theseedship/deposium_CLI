# Sprint: Secure CLI before Publication

> Status: **Done**
> Date: 2026-03-03
> Completed: 2026-03-03
> Scope: `@deposium/cli` v1.0.0 pre-release hardening

---

## Objectif

Fermer les 3 failles de securite identifiees avant la publication npm/GitHub du
CLI. Chaque item est un **bloquant de release**.

---

## A. Chiffrer les secrets locaux

### Etat actuel → Corrige

- `Conf` stocke maintenant la config **chiffree AES-256-GCM** via `encryptionKey`
- Clef derivee via `scryptSync(pepper, hostname:username:deposium, 32)`
- API key stockee dans un fichier separe `~/.deposium/credentials` (chiffre, 0600)
- Config directory protege `chmod 0700`, fichiers `chmod 0600`
- Migration automatique des configs JSON en clair au premier lancement

### Fichiers modifies

| Fichier               | Changements                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `src/utils/config.ts` | `deriveEncryptionKey()`, `migrateIfPlaintext()`, credentials store |

### Taches

- [x] A.1 : `Conf({ encryptionKey })` derive machine via `scryptSync()`
- [x] A.2 : Migration transparente (JSON clair → chiffre, backup `.plaintext.bak`)
- [x] A.3 : `chmod 0700` sur `~/.deposium/`, `configFileMode: 0o600` sur les fichiers
- [x] A.4 : API key dans `~/.deposium/credentials` (store separe, chiffre)
- [x] A.5 : 10 tests (deriveEncryptionKey, migrateIfPlaintext, credentials CRUD)

### Risque residuel

La clef de chiffrement derivee de la machine n'est pas un vrai secret (un
attaquant avec acces au meme user peut la reproduire). C'est une protection
contre les lectures opportunistes, pas contre un attaquant cible.

---

## B. Router le chat-stream via l'Edge Runtime

### Etat actuel → Corrige

- `chatStream()` route par defaut via l'Edge Runtime (`/chat-stream`)
- Auth + rate-limiting geres par l'Edge Runtime (zero dev serveur)
- `--direct` disponible pour dev/debug (bypass Edge Runtime avec warning)
- Reponse 429 geree avec `Retry-After` header et message sur le tier

### Fichiers modifies

| Fichier                    | Changements                                       |
| -------------------------- | ------------------------------------------------- |
| `src/utils/config.ts`      | `edgeUrl`, `DEPOSIUM_EDGE_URL`, `getEdgeUrl()`    |
| `src/client/mcp-client.ts` | `chatStream()` routing + 429 handling             |
| `src/chat.ts`              | `getEdgeUrl()`, `ChatOptions`, `--direct` support |
| `src/cli.ts`               | `--direct` flag sur commande chat                 |

### Taches

- [x] B.1 : `edgeUrl` / `DEPOSIUM_EDGE_URL` dans config (default `localhost:9000`)
- [x] B.2 : `chatStream()` route via `/chat-stream` (Edge) ou `/api/chat-stream` (direct)
- [x] B.3 : `--direct` option pour bypass Edge Runtime (dev only, avec warning)
- [x] B.4 : `mcpDirectUrl` / `DEPOSIUM_MCP_DIRECT_URL` marques `@deprecated`
- [x] B.5 : 429 → `Retry-After` header + message tier rate-limit
- [x] B.6 : 9 tests (routing, 429, auth, citations, trailing slash, directMcp)

---

## C. Refuser les connexions non-TLS en production

### Etat actuel → Corrige

- `enforceUrlSecurity()` **refuse** (throw) les connexions HTTP non-localhost
- `--insecure` global flag + `DEPOSIUM_INSECURE` env var pour override
- `--silent` ne supprime plus les messages de securite
- Applique a `getBaseUrl()`, `getMcpDirectUrl()`, `getEdgeUrl()`

### Fichiers modifies

| Fichier                        | Changements                                  |
| ------------------------------ | -------------------------------------------- |
| `src/utils/config.ts`          | `enforceUrlSecurity()`, `isInsecureMode()`   |
| `src/cli.ts`                   | `--insecure` global option + preAction hook  |
| `src/utils/command-helpers.ts` | `insecure: isInsecureMode()` dans getBaseUrl |

### Taches

- [x] C.1 : `enforceUrlSecurity()` — throw au lieu de warn
- [x] C.2 : `--insecure` global option + `DEPOSIUM_INSECURE` env var
- [x] C.3 : Enforce TLS sur `getMcpDirectUrl()` et `getEdgeUrl()`
- [x] C.4 : Desaccoupler `--silent` des messages securite
- [x] C.5 : 9 tests TLS enforcement (throw, insecure, localhost, HTTPS, actionable msg)

---

## Resultats

| Metrique           | Avant | Apres |
| ------------------ | ----- | ----- |
| Tests              | 123   | 142   |
| Vulnerabilites     | 2     | 0     |
| Config chiffree    | Non   | Oui   |
| TLS enforce        | Warn  | Throw |
| Rate-limiting CLI  | Non   | Oui   |
| Credentials isoles | Non   | Oui   |

---

## Hors scope (a noter pour une v2)

- Keychain OS natif (quand Bun supportera les native addons ou via FFI)
- Rotation automatique des API keys
- Certificate pinning
- mTLS client certificates
