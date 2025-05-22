# Snowflake

**Snowflake** is a lightweight, zero-dependency Discord API wrapper designed to act as a thin client between your code and the Discord API. It is the spiritual successor to [Styrocord.js](https://npmjs.com/styrocord.js), offering a modern, minimal, and efficient approach for building Discord bots.

> ⚠️ **Warning:** This package is in early development and highly unstable. Do not use in production.

Snowflake is built with Bun and TypeScript, leveraging modern Web APIs for improved performance and reliability. Unlike its predecessor, it avoids legacy Node.js dependencies and keeps the codebase lean.

**Why Snowflake?**
- Minimal footprint: The entire library is just 5 KB. (With ongoing feature expansion)
- Zero dependencies: No bloat, no unnecessary packages.
- API-first: Breaking changes only occur when Discord updates their API.
- Fast and modern: Uses Bun and TypeScript for speed and type safety.

## Installation

```
bun i @sfjs/snowflake
```

## Quick Start

```ts
import { Snowflake, GatewayIntents } from "@sfjs/snowflake";

const client = new Snowflake({
  token: process.env.TOKEN,
  intents: [GatewayIntents.GUILDS],
});

client.on("ready", () => {
  console.log("Bot is ready!");
});
```

> **Info:** Types package is available at `@sfjs/types` for autocomplete.

## Thin Client

Snowflake keeps its size minimal by focusing only on essential Discord API features:

- **Gateway:** Only crucial gateway events are handled and forwarded directly to your code, giving you full control.
- **REST API:** Endpoints and methods are dynamically generated from Discord’s official OpenAPI specification. You can lock to a specific API version for stability.
- **No Bloat:** Unnecessary abstractions and features are omitted, ensuring the library remains lightweight and easy to maintain.

## TODO

[Tracked on this GitHub project](https://github.com/users/dreamgineer/projects/5)