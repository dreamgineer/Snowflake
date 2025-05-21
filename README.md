# Snowflake

This package is very new and highly unstable. Please do not use it for production yet.

Lightweight Discord API wrapper. Act as thin client between your code and Discord API. This is a successor of [Styrocord.js](https://npmjs.com/styrocord.js).

Previously, Styrocord.js powers tens of bots under our organization. Each of them runs in their own Docker container. But they only use tiny amount of storage because of how lightweight it is.

But, Styrocord.js depends on many old APIs like `node:http` module and bundling modified version of `ws` within it's code. By using Bun and TypeScript to get benefits of standard Web APIs and eliminate bugs.

## Features

- The entire library in 5 kilobytes. Zero-dependency.
- Being a thin client, breaking changes depends entirely on Discord API. And it doesn't require Snowflake to update to use the latest Discord API features.

## Thin client

Discord API consist of 2 main components, Gateway and REST. Snowflake maintain small size by:
- Only handling crucial gateway events, forwarding events directly to your code.
- API Usage is fetched from Discord's OpenAPI specification repository with ability to lock specific commit. It then gets transformed into format that Snowflake can optimally understand. Reducing storage size.