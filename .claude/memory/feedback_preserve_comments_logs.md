---
name: Preserve comments and debug logs
description: Do not remove comments or debug log messages unless the code logic they relate to is also changing
type: feedback
---

Do not remove comments or debug log messages from files unless the relevant code logic is also being changed.

**Why:** User wants to retain all existing comments and debug instrumentation — only remove them if the surrounding logic itself is being rewritten.

**How to apply:** When making UI or refactor changes, copy over all existing `console.log`, `console.debug`, `// comments`, `/* comments */` etc. verbatim. Only omit them if the code block they live in is being deleted or replaced with different logic.
