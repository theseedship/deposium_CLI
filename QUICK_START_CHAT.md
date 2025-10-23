# 🚀 Quick Start: AI Chat

## What Changed?

✅ **Fixed**: The 500 error (backend compatibility issue)
✅ **New**: Continuous chat mode like Claude Code
✅ **New**: Three ways to chat with AI

## Three Ways to Chat

### 1. 💬 Dedicated Chat Mode (Easiest!)

```bash
npm run dev chat
# or after install: deposium chat
```

**Features:**

- Continuous conversation (no menus!)
- Just type and press enter
- Built-in commands: `/exit`, `/clear`, `/history`

```
? You: hello
🤖 AI:
[Response from AI...]

? You: tell me more
🤖 AI:
[Continues with context...]

? You: /exit
```

---

### 2. 🎯 Interactive Mode with Chat

```bash
npm run dev i
```

Then select **"💬 AI Chat (continuous)"** from the menu.

---

### 3. 📝 Single Query Mode

```bash
npm run dev compound analyze "your question"
```

Each query remembers previous ones in the same session!

## Architecture

```
┌─────────────────────────────────────────────┐
│         deposium chat                       │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ You: Hello                           │  │
│  │ AI:  Hi! How can I help?            │  │
│  │                                      │  │
│  │ You: What is TypeScript?            │  │
│  │ AI:  [explains TypeScript]          │  │
│  │                                      │  │
│  │ You: How is it different?    ◄──────┼──┼── Remembers context!
│  │ AI:  [explains diff from JS]        │  │
│  │                                      │  │
│  │ You: /exit                          │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## How Context Works

The AI receives the last 6 messages as context:

```
User: What is TypeScript?
Assistant: TypeScript is a superset of JavaScript...

User: How is it different from JavaScript? ← Current question
```

The AI knows you're asking about TypeScript vs JavaScript!

## Commands Inside Chat

| Command    | What it does               |
| ---------- | -------------------------- |
| `/exit`    | Leave the chat             |
| `/clear`   | Clear conversation history |
| `/history` | Show all previous messages |
| (any text) | Send message to AI         |

## Try It Now!

```bash
npm run dev chat
```

Then type: `hello` and press Enter!

The AI will respond and you can continue the conversation naturally.
