# Xirp MCP server

Lets one Claude Code session start, watch, message and stop other Xirp sessions. It wraps the
CLI bundled inside `Xirp.app`, so Xirp must be running on the same Mac. It has no dependencies.

## Setup

Register it once for your user, from this repo's root:

```sh
claude mcp add --scope user xirp -- node "$PWD/server.mjs"
```

- `XIRP_CLI` overrides the CLI path (default `/Applications/Xirp.app/Contents/Resources/chirp-cli/xirp`).
- The bundled CLI exits with `CHIRP_CLI_NAME is not set` unless `CHIRP_EDITION=external` is set;
  the server sets it.

## Orchestrating

Run the orchestrator Claude session inside Xirp. Xirp sets `CHIRP_SESSION_ID` in its terminals,
so every session created through `xirp_create_session` becomes a child of the orchestrator and
shows up under it in Xirp. Poll `xirp_get_session` to see when a child is waiting or done, and
answer it with `xirp_send_message`.

Xirp's API returns no transcript for terminal sessions, so `xirp_read_session` reads the tmux
screen the child runs in. Claude Code redraws a full screen, so only what is on screen can be read,
and only while the child runs: stopping it closes its terminal.
