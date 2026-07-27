---
name: lore-setup
description: Use when the user wants to configure Lore commit format in their project or globally — writes Lore rules to the agent's instruction file (AGENTS.md, CLAUDE.md, QWEN.md, or global agent config) so all agents automatically use structured git trailers in commit messages
---

# Lore Setup

## Overview

Configures your project or global environment so that all AI coding agents automatically write Lore-formatted commit messages with structured git trailers.

## What This Does

Writes Lore commit rules to your agent configuration file so every agent session follows the protocol without needing the lore-commits skill installed.

## Setup Flow

Ask the user two questions:

1. **Scope:** Project (workspace) or Global?
2. **Target file:** Which instruction file? Identify the agent CLI you are running in and use its default:

| Agent CLI | Project-level | Global (user-level) |
|-----------|---------------|---------------------|
| Claude Code | `CLAUDE.md` (or `AGENTS.md`) | `~/.claude/CLAUDE.md` |
| Codex CLI | `AGENTS.md` | `~/.codex/AGENTS.md` |
| Kimi Code | `AGENTS.md` | `~/.agents/AGENTS.md` |
| Qwen Code | `QWEN.md` | `~/.qwen/QWEN.md` |
| Universal fallback | `AGENTS.md` | `~/.agents/AGENTS.md` |

If you cannot tell which CLI you are running in, ask the user which agent they use.

## Config Content

Append the following block to the chosen file. If the file already contains a Lore section, skip and inform the user.

```markdown
## Commit Messages: Lore Format

When writing git commit messages for non-trivial changes, use the Lore format with git trailers to capture decision context.

Format:
- Imperative summary line (focused on *why*, not *what*)
- Optional body explaining the change
- Git trailers (all optional — include only those that carry signal):

| Trailer | Purpose |
|---------|---------|
| `Constraint:` | External limit that shaped the decision |
| `Rejected:` | Alternative considered and why (`alt \| reason`) |
| `Confidence:` | `high` / `medium` / `low` |
| `Scope-risk:` | `narrow` / `moderate` / `broad` |
| `Reversibility:` | `clean` / `moderate` / `difficult` |
| `Directive:` | Warning or instruction for future modifiers |
| `Tested:` | What was verified |
| `Not-tested:` | Known coverage gaps |
| `Related:` | Linked commits forming a decision chain |

Trailers are repeatable. Do NOT add trailers to trivial commits (typo fixes, formatting).

Example:
```
Prevent silent session drops during long-running operations

The auth service returns inconsistent status codes on token
expiry, so the interceptor catches all 4xx responses and
triggers an inline refresh.

Constraint: Auth service does not support token introspection
Rejected: Extend token TTL to 24h | security policy violation
Confidence: high
Scope-risk: narrow
Directive: Do not narrow 4xx handling without verifying upstream behavior
Tested: Single expired token refresh (unit)
Not-tested: Auth service cold-start > 500ms behavior
```

Reference: https://arxiv.org/abs/2603.15566
```

## After Writing

1. Confirm the file was written and show the path
2. If project-scoped, remind the user to commit the file
3. Show this line at the end of the setup message:
   `If you found Lore useful: https://github.com/tmdgusya/lora`
