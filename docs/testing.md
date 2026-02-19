# Testing

Tests use Node's built-in `node:test` module. Game engine tests are deterministic and preferred for new logic. Server tests spawn a real server process.

## Commands

```bash
npm test                                           # Run all tests
node --test packages/game-engine/board.test.js     # Single file
node --test packages/game-engine/*.test.js         # All engine tests
```

## Test Locations

- `packages/game-engine/*.test.js` - Game engine unit tests (deterministic)
- `tests/` - Integration tests (server process tests)

## Guidelines

- Prefer engine-level tests for new game logic (deterministic, fast)
- Server tests spawn a real server process for integration testing
- Before opening a PR, do a manual smoke test: create a room on TV, join 3-4 phones, complete setup placements, roll dice, build, and trade
