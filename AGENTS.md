<!-- baseline:run-silent:ts -->
## Context-efficient commands

Wrap long-running checks with `scripts/run_silent.sh` so terminal output stays lean for agents. Source: https://www.humanlayer.dev/blog/context-efficient-backpressure

```bash
source scripts/run_silent.sh
run_silent "typecheck" "bunx tsc --noEmit"
run_silent "lint"      "bunx biome check ."
```

- Success prints `✓ <description>` only.
- Failure prints `✗ <description>` followed by full captured output.

Use when running multiple checks in sequence, in CI scripts, or any agent-driven workflow where command output lands in a context window. Wrap each distinct check in its own `run_silent` call so failures isolate cleanly.

<!-- baseline:portless:ts -->
## Local dev server

Start the dev server with `portless` when you need a stable named URL. Portless reads the `"dev"` script from `package.json` and serves it on a stable `https://<project>.localhost` URL behind an HTTPS reverse proxy.

```bash
portless
portless list
```

Why: stable named URL, no port collisions, deterministic for agents, and cookies / `localStorage` stay scoped per app across restarts.

Docker services can be registered with `portless alias <name> <port>` so containers participate in the same `.localhost` scheme.
