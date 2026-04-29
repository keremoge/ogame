# ogame — Project Copilot Instructions

## Project
**ogame** is a Mario-like 2D side-scrolling platformer for the web.

## Tech stack
- **Engine**: [Phaser 3](https://phaser.io/) (Arcade Physics) — loaded via CDN, no build step required.
- **Language**: Vanilla JavaScript (ES modules), HTML5, CSS.
- **Runtime**: Modern browsers with HTML5 Canvas / WebGL.
- **Local dev**: Any static file server (e.g. `npx serve .` or `python3 -m http.server`).

## Folder layout
```
.
├── index.html              # entry; loads Phaser from CDN, mounts <canvas>
├── src/
│   ├── main.js             # Phaser game config + scene registration
│   └── scenes/             # one file per scene (Boot, Game, UI, ...)
├── assets/                 # sprites, tilemaps, audio (binary assets)
└── .github/
    ├── copilot-instructions.md       # this file
    ├── instructions/                 # scoped instructions
    └── skills/game-engine/           # installed awesome-copilot skill
```

## Skill
This repo has the awesome-copilot **`game-engine`** skill installed at
[.github/skills/game-engine/](.github/skills/game-engine/SKILL.md).

For **any** game-development task (game loop, physics, collision, sprites,
tilemaps, controls, audio, performance, publishing) Copilot should:
1. Consult [.github/skills/game-engine/SKILL.md](.github/skills/game-engine/SKILL.md) first.
2. For platformer-specific work, prefer the
   [2d-platform-game.md](.github/skills/game-engine/assets/2d-platform-game.md)
   template (it is Phaser-based and the closest match to a Mario-like game).
3. For deep dives, consult the matching reference under
   [.github/skills/game-engine/references/](.github/skills/game-engine/references/).

## Conventions
- Keep scenes small and focused (`BootScene`, `GameScene`, `UIScene`, ...).
- Use Phaser's Arcade Physics for player + tile collisions.
- Use **delta time** in custom update logic; never hardcode per-frame values.
- Use **tilemaps** (Tiled JSON) for level data — do not hand-place tiles in code.
- Pixel-art assets: set `pixelArt: true` and `roundPixels: true` in the Phaser config.
- All audio playback must be triggered after the first user input (browser autoplay policy).

## Out of scope (for now)
- Build tooling (Vite, Webpack, TypeScript) — keep zero-config.
- 3D / WebGL shaders.
- Multiplayer / networking.
