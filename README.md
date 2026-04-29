# ogame

A Mario-like 2D side-scrolling platformer for the web.

## Stack
- [Phaser 3](https://phaser.io/) (Arcade Physics) — loaded from CDN
- Vanilla JavaScript (ES modules), HTML5 Canvas
- Zero build step

## Run locally
Any static file server works:

```sh
npx serve .
# or
python3 -m http.server 8000
```

Then open http://localhost:3000 (serve) or http://localhost:8000 (python).

## Controls
- **Arrow keys** / **WASD** — move
- **Space** / **Up** / **W** — jump (variable height; coyote time + jump buffering)

## Project layout
```
.
├── index.html              # entry; loads Phaser + main.js
├── src/
│   ├── main.js             # Phaser config + scene registration
│   └── scenes/
│       └── GameScene.js    # baseline player + platforms
├── assets/                 # sprites, tilemaps, audio (add as needed)
└── .github/
    ├── copilot-instructions.md
    ├── instructions/game.instructions.md
    └── skills/game-engine/ # awesome-copilot game-engine skill
```

## Copilot
This repo has the **`game-engine`** skill from
[github/awesome-copilot](https://github.com/github/awesome-copilot/tree/main/skills/game-engine)
installed at [.github/skills/game-engine/](.github/skills/game-engine/SKILL.md).
Copilot will consult it automatically for game-development tasks.
