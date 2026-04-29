---
applyTo: "src/**/*.{js,ts,html}"
---

# Mario-like 2D Platformer — Coding Guidance

These instructions apply to all source files in `src/`. They complement the
project-wide [copilot-instructions.md](../copilot-instructions.md) and the
installed [game-engine skill](../skills/game-engine/SKILL.md).

## Engine
- **Phaser 3** with **Arcade Physics**.
- Load Phaser from CDN in `index.html`; do not bundle.
- Use ES module `import`/`export` between scene files.

## Player physics (Mario-like feel)
- Gravity: `~800–1200 px/s²` on the world (`physics.arcade.gravity.y`).
- Run speed: `~160–200 px/s` horizontal.
- Jump velocity: `~-450 to -550 px/s` (negative = up).
- Variable jump height: cut vertical velocity in half when the jump key is released early.
- Coyote time (~80–100 ms after leaving a ledge) and jump buffering (~100 ms before landing) for snappy controls.
- Use `body.blocked.down` / `body.touching.down` to detect grounded state, not just velocity.

## Controls
- Arrow keys + `WASD` for movement.
- `Space` or `W`/`Up` for jump.
- Use `scene.input.keyboard.createCursorKeys()` and `addKeys('W,A,S,D,SPACE')`.
- Keep input reading in the scene's `update(time, delta)`.

## Levels
- Author levels in **Tiled** as JSON tilemaps under `assets/tilemaps/`.
- Load with `this.load.tilemapTiledJSON(...)` in `preload()`.
- Mark solid tiles with a `collides: true` property and call
  `layer.setCollisionByProperty({ collides: true })`.
- Use `this.physics.add.collider(player, layer)` for player↔world collisions.

## Camera
- `this.cameras.main.startFollow(player, true, 0.1, 0.1)` for smooth scroll.
- `this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)`.
- `this.physics.world.setBounds(...)` so the player can't leave the level.

## Sprites & animation
- Use sprite sheets via `this.load.spritesheet(key, path, { frameWidth, frameHeight })`.
- Define animations once in a Boot/Preload scene with `this.anims.create(...)`.
- Pixel art: enable `pixelArt: true` in the game config; do **not** apply texture smoothing.

## Scenes
- One file per scene under `src/scenes/`.
- Minimum set for a Mario-like: `BootScene` (asset loading), `GameScene` (gameplay),
  `UIScene` (HUD: score, lives, time — runs in parallel via `scene.launch`).

## Performance
- Reuse objects (object pooling) for projectiles, particles, enemies.
- Cull off-screen entities; disable physics on bodies far from the camera.
- Prefer texture atlases over many individual images.

## Don'ts
- Don't use `setInterval` / `setTimeout` for game logic — use Phaser's `time.addEvent`
  or delta-time math in `update()`.
- Don't manipulate `x`/`y` directly when a body has physics — set `velocity` instead.
- Don't load assets inside `create()` or `update()` — only in `preload()`.
