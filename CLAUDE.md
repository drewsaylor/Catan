# CLAUDE.md

Catan LAN - party game where the TV hosts the board and phones are player controllers. LAN only, no internet required.

- **TV**: `http://<host-ip>:3000/tv`
- **Phone**: `http://<host-ip>:3000/phone`

## Commands

```bash
npm run dev     # Start server on port 3000
npm test        # Run all tests
npm run lint    # Run ESLint
npm run format  # Format with Prettier
```

## Coding Conventions

- Plain ES modules, HTML, CSS (no framework)
- 2-space indentation, semicolons, `const` by default
- File names: `kebab-case` | DOM ids: `camelCase`

## Details

- `docs/architecture.md` - Server, game engine, client apps, key patterns
- `docs/testing.md` - Test commands and guidelines
- `docs/environment.md` - Environment variables
