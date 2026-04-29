/**
 * GameScene — Güzide School Adventure (Mario-like platformer).
 *
 * - Player head can be a real photo (assets/face.png). If the file is not
 *   present, a procedurally drawn shaded face is used as fallback.
 * - Player carries three helium balloons (red, yellow, blue) on long
 *   strings, each with its own spring-damped physics.
 * - Stomping enemies makes them vanish (disableBody) and bounces the player.
 * - Restart on R is wired through Phaser's keyboard, the canvas DOM,
 *   the document, and a visible on-screen "Restart" button at game-over.
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');

    this.RUN_SPEED = 220;
    // Jump increased by 25% (was -560).
    this.JUMP_VELOCITY = -700;
    this.COYOTE_MS = 90;
    this.JUMP_BUFFER_MS = 100;

    this.lastGroundedAt = -Infinity;
    this.lastJumpPressedAt = -Infinity;

    this.score = 0;
  }

  preload() {
    // Try to load the real photo for the head. If it's missing the load
    // simply errors silently and we draw a fallback face.
    this.load.image('face', 'assets/face.png');
    this.load.on('loaderror', (file) => {
      if (file.key === 'face') this._faceMissing = true;
    });
  }

  create() {
    // Always clear the restart guard at scene start — otherwise after one
    // restart the flag stays true and R/the button do nothing.
    this._restarting = false;
    this.gameOver = false;

    this._buildTextures();

    const viewW = this.scale.width;
    const viewH = this.scale.height;
    const worldWidth = Math.max(4200, viewW * 5);
    const worldHeight = viewH;
    const groundY = worldHeight - 64;

    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.groundY = groundY;

    this._createSky(viewW, viewH);
    this._createClouds(worldWidth, viewH);
    this._createHills(worldWidth, groundY);
    this._createCityWall(worldWidth, groundY);
    this._createSchool(worldWidth, groundY);
    this._createPlanetsClassroom(worldWidth, groundY);
    this._createPlayground(worldWidth, groundY);
    this._createNasa(worldWidth, groundY);
    this._createSakaryaBridge(worldWidth, groundY);
    this._createTrees(worldWidth, groundY);

    // --- Ground.
    this.platforms = this.physics.add.staticGroup();
    for (let x = 0; x < worldWidth; x += 32) {
      this.platforms.create(x + 16, groundY + 16, 'grass').refreshBody();
      this.platforms.create(x + 16, groundY + 48, 'dirt').refreshBody();
    }

    const benches = [
      [260, groundY - 110, 3], [460, groundY - 180, 3],
      [700, groundY - 240, 4], [980, groundY - 160, 3],
      [1220, groundY - 220, 3], [1460, groundY - 130, 4],
      [1740, groundY - 200, 3], [2000, groundY - 280, 3],
      [2280, groundY - 170, 4], [2540, groundY - 230, 3],
      [2800, groundY - 140, 3], [3060, groundY - 200, 3],
      [3320, groundY - 260, 4], [3600, groundY - 150, 3],
      [3880, groundY - 210, 3],
    ];

    // ---- Sky towers between graduation and the finish line ----
    // Stacked zig-zag bench platforms so the player can climb really high
    // in the NASA / post-graduation stretch. Vertical gap ~120 px is well
    // within the player's jump arc (~240 px apex). The towers are spread
    // EVENLY between graduation and the finish line so there's never a long
    // empty stretch at the end of the level.
    const gradX = (this._graduateAtX != null) ? this._graduateAtX : worldWidth * 0.55;
    const finishX = worldWidth - 100;
    const span = finishX - gradX;
    if (span > 400) {
      // Pick a count that keeps each tower comfortably ~500-650 px apart.
      const towerCount = Math.max(4, Math.min(7, Math.round(span / 560)));
      const margin = 220; // keep clear of the graduation point and the flag
      const usable = span - margin * 2;
      const step = usable / Math.max(1, towerCount - 1);
      for (let i = 0; i < towerCount; i++) {
        const baseX = Math.round(gradX + margin + i * step);
        // Alternate the zig-zag direction per tower for variety.
        const dir = (i % 2 === 0) ? 1 : -1;
        const xLeft = baseX;
        const xRight = baseX + 100 * dir;
        // 4 stacked tiers + a wider top platform.
        benches.push(
          [xLeft,  groundY - 320, 2],
          [xRight, groundY - 440, 2],
          [xLeft,  groundY - 560, 2],
          [xRight, groundY - 680, 2],
          [Math.round(baseX + 20 * dir), groundY - 800, 3],
        );
      }
    }
    benches.forEach(([px, py, len]) => {
      for (let i = 0; i < len; i++) {
        this.platforms.create(px + i * 32, py, 'bench').refreshBody();
      }
    });

    // --- Vitamins (mixed fruit & veg). Textures are drawn at 64x64 so
    // they stay crisp without any upscaling.
    this.apples = this.physics.add.group({ allowGravity: false, immovable: true });
    const FRUIT_KEYS = [
      'apple', 'banana', 'orange', 'strawberry', 'grapes',
      'watermelon', 'carrot', 'tomato', 'eggplant', 'pear', 'broccoli',
    ];
    const randFruit = () => FRUIT_KEYS[Phaser.Math.Between(0, FRUIT_KEYS.length - 1)];

    // Vitamins that sit on top of the existing benches.
    benches.forEach(([px, py, len]) => {
      const ax = px + Math.floor(len / 2) * 32;
      const ay = py - 26; // lifted so the sprite sits cleanly on the bench
      const apple = this.apples.create(ax, ay, randFruit());
      apple.setScale(0.5);
      apple.body.setSize(48, 48).setOffset(8, 8);
      apple.refreshBody();
      this.tweens.add({
        targets: apple, y: ay - 8, duration: 800,
        ease: 'sine.inOut', yoyo: true, repeat: -1,
      });
    });

    // High-altitude vitamins — placed UP IN THE SKY so the player has to
    // time jumps to catch them. They bob with a larger amplitude.
    const skyApples = [
      // Reachable with a normal jump from the ground (~240px max).
      [380,  groundY - 200], [1140, groundY - 210], [1900, groundY - 220],
      [2620, groundY - 200], [3240, groundY - 215], [3780, groundY - 205],
      // Higher ones — reachable by jumping off a nearby bench.
      [820,  groundY - 320], [1580, groundY - 340], [2200, groundY - 360],
      [2940, groundY - 330], [3500, groundY - 350],
      // Even higher, requiring chained bench jumps.
      [600,  groundY - 430], [1340, groundY - 460], [2400, groundY - 480],
      [3100, groundY - 450], [3680, groundY - 470],
    ];
    skyApples.forEach(([ax, ay]) => {
      const apple = this.apples.create(ax, ay, randFruit());
      apple.setScale(0.5);
      apple.body.setSize(48, 48).setOffset(8, 8);
      apple.refreshBody();
      // Bigger, springy bob so they look like they're hopping in the air.
      const amp = Phaser.Math.Between(22, 36);
      const dur = Phaser.Math.Between(700, 1100);
      this.tweens.add({
        targets: apple, y: ay - amp, duration: dur,
        ease: 'sine.inOut', yoyo: true, repeat: -1,
      });
      // Subtle wobble to break the uniformity.
      this.tweens.add({
        targets: apple, angle: Phaser.Math.Between(-8, -3),
        duration: Phaser.Math.Between(900, 1400),
        ease: 'sine.inOut', yoyo: true, repeat: -1,
      });
    });

    // --- Rivals.
    this.enemies = this.physics.add.group();
    [600, 1300, 2100, 2700, 3400, 3900].forEach((x) => {
      const e = this.enemies.create(x, groundY - 24, 'rival');
      e.setCollideWorldBounds(true);
      e.setBounce(1, 0);
      e.setVelocityX(Phaser.Math.Between(0, 1) ? 70 : -70);
      e.body.setSize(28, 28);
      // Roll the ball as it moves.
      e._spinPerPxlDeg = 4;
    });

    // --- Goal flag.
    this.goal = this.physics.add.staticImage(worldWidth - 100, groundY - 40, 'flag');
    this.goal.body.setSize(8, 80).setOffset(14, 0);

    // --- Player. Body texture is 96x96 with the visible body running from
    // canvas y=8 (top of sweater) to y=80 (bottom of crocs). The physics body
    // is sized so its bottom edge sits exactly at the bottom of the crocs —
    // no gap between feet and ground.
    this.player = this.physics.add.sprite(80, groundY - 200, 'playerBody');
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(40, 72).setOffset(28, 8);
    this.player.body.setMaxVelocity(260, 1100);
    // Bigger render scale so the body reads well next to the head.
    this.player.setScale(1);

    // Hand anchor offset (relative to player center) — used for balloon strings.
    // The drawn hands sit at canvas (cx ± 28, 40), and origin is (48,48),
    // so the right hand is at (player.x + 28, player.y - 8).
    this.HAND_DX = 28;
    this.HAND_DY = -8;

    // --- Player head: real photo if present, else drawn face. The head is
    // sized to read big next to the body. Photos often have padding around
    // the face, so we size by WIDTH (not height) and center the image on
    // the body so the face lands on the neck/shoulders regardless of crop.
    const headKey = (this.textures.exists('face') && !this._faceMissing) ? 'face' : 'playerFace';
    this.HEAD_TARGET_W = 80; // pixel width of the head image on screen
    this.playerHead = this.add.image(this.player.x, this.player.y, headKey)
      .setDepth(this.player.depth + 1);
    this.playerHead.setOrigin(0.5, 0.5);
    if (headKey === 'face') {
      const tex = this.textures.get('face').getSourceImage();
      this.playerHead.setScale(this.HEAD_TARGET_W / tex.width);
    } else {
      this.playerHead.setScale(this.HEAD_TARGET_W / 96);
    }

    // --- Helium balloons on long strings. The player starts with 10 of them;
    // each enemy hit pops one. The set of colors and per-balloon size is
    // randomized every game so it looks fresh each restart.
    this.balloons = [];
    this.balloonStrings = this.add.graphics().setDepth(5);
    this._initBalloons(10);

    // --- Graduation outfit (gown over body, cap on head). Hidden until the
    // player walks past the NASA launchpad — see _syncOutfit().
    this.gownImg = this.add.image(this.player.x, this.player.y, 'gown')
      .setOrigin(0.5, 0.5).setDepth(this.player.depth + 1).setVisible(false);
    this.capImg = this.add.image(this.player.x, this.player.y, 'cap')
      .setOrigin(0.5, 1).setDepth(this.playerHead.depth + 1).setVisible(false);
    this._graduated = false;

    // Balloon constants (slightly stronger lift so longer ropes stay taut).
    this.BALLOON_LIFT = -440;
    this.BALLOON_DAMP = 2.0;
    this.BALLOON_STIFF = 28;
    this.BALLOON_GRAVITY = 50;

    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.overlap(this.player, this.apples, this._collectApple, null, this);
    this.physics.add.overlap(this.player, this.enemies, this._hitEnemy, null, this);
    this.physics.add.overlap(this.player, this.goal, this._reachGoal, null, this);

    // --- Input.
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,R');
    this.input.addPointer(3); // allow up to 4 simultaneous touches
    this.touch = { left: false, right: false, jump: false, jumpJustPressed: false };

    // ---- Multi-channel R restart -----------------------------------------
    // 1) Phaser keyboard event.
    this.input.keyboard.on('keydown-R', () => this._doRestart());
    // 2) Document-level keydown (catches focus-lost cases).
    this._domRestartHandler = (ev) => {
      if (ev.key === 'r' || ev.key === 'R' || ev.code === 'KeyR') {
        ev.preventDefault();
        this._doRestart();
      }
    };
    document.addEventListener('keydown', this._domRestartHandler, true);

    // ---- Audio unlock ----------------------------------------------------
    // Browsers (especially iOS Safari and HTTPS contexts like GitHub Pages)
    // require the AudioContext to be created/resumed inside a *real* user
    // gesture event. We attach a one-shot listener that runs on the very
    // first pointerdown / touchstart / keydown anywhere in the document.
    this._unlockAudio = () => {
      try {
        if (!this._audioCtx) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (Ctx) this._audioCtx = new Ctx();
        }
        if (this._audioCtx && this._audioCtx.state === 'suspended') {
          this._audioCtx.resume();
        }
        // Play a 1-sample silent buffer to fully unlock on iOS.
        if (this._audioCtx) {
          const buf = this._audioCtx.createBuffer(1, 1, 22050);
          const src = this._audioCtx.createBufferSource();
          src.buffer = buf;
          src.connect(this._audioCtx.destination);
          src.start(0);
        }
      } catch { /* ignore */ }
      document.removeEventListener('pointerdown', this._unlockAudio, true);
      document.removeEventListener('touchstart', this._unlockAudio, true);
      document.removeEventListener('keydown', this._unlockAudio, true);
    };
    document.addEventListener('pointerdown', this._unlockAudio, true);
    document.addEventListener('touchstart', this._unlockAudio, true);
    document.addEventListener('keydown', this._unlockAudio, true);

    this.events.once('shutdown', () => {
      document.removeEventListener('keydown', this._domRestartHandler, true);
      document.removeEventListener('pointerdown', this._unlockAudio, true);
      document.removeEventListener('touchstart', this._unlockAudio, true);
      document.removeEventListener('keydown', this._unlockAudio, true);
      this.scale.off('resize', this._handleResize, this);
    });

    // --- HUD: nice rounded card with apple icon + count.
    this._buildHudPanel(viewW, viewH);
    this._buildTouchControls(viewW, viewH);

    this.messageText = this.add.text(viewW / 2, viewH / 2 - 40, '', {
      font: 'bold 36px monospace', color: '#ffeb3b',
      stroke: '#000', strokeThickness: 6, align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200);

    // On-screen Restart button (always present, becomes prominent at game over).
    this.restartBtn = this.add.text(viewW / 2, viewH / 2 + 40, '↻ YENİDEN BAŞLA', {
      font: 'bold 28px monospace',
      color: '#ffffff',
      backgroundColor: '#1e88e5',
      padding: { left: 18, right: 18, top: 10, bottom: 10 },
    })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.restartBtn.on('pointerdown', () => this._doRestart());

    this.scale.on('resize', this._handleResize, this);
    this._scheduleRocketLaunch();
  }

  update(time, delta) {
    const dt = delta / 1000;

    // Defensive R-in-update fallback.
    if (this.keys && Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this._doRestart();
      return;
    }

    if (!this.gameOver) this._updatePlayer(time);

    // Always update visuals.
    this._animateWalk(time);
    this._syncHead();
    this._syncOutfit();
    this._updateBalloons(dt);
    this._updateRocket(dt);
  }

  _animateWalk(time) {
    if (!this.player) return;
    const moving = Math.abs(this.player.body.velocity.x) > 10;
    const grounded = this.player.body.blocked.down || this.player.body.touching.down;
    if (moving && grounded) {
      // Walking cycle: bob + slight tilt; arms/legs read via the body bob.
      const phase = time * 0.018;
      this._walkBob = Math.abs(Math.sin(phase)) * 3;     // 0..3 px up bob
      this._walkTilt = Math.sin(phase) * 4;              // ±4 deg sway
    } else if (!grounded) {
      this._walkBob = 0;
      this._walkTilt = this.player.body.velocity.y * 0.01; // lean from vertical motion
      this._walkTilt = Phaser.Math.Clamp(this._walkTilt, -8, 8);
    } else {
      this._walkBob *= 0.7;
      this._walkTilt *= 0.7;
    }
    // Apply offsets (display only — doesn't affect physics body).
    this.player.setOrigin(0.5, 0.5);
    this.player.angle = this._walkTilt;
    this.player.setDisplayOrigin(48, 48 + this._walkBob);
  }

  _updatePlayer(time) {
    this.enemies.children.iterate((e) => {
      if (!e?.active) return;
      if (e.body.blocked.left) e.setVelocityX(70);
      else if (e.body.blocked.right) e.setVelocityX(-70);
      // Roll the dodgeball visually.
      e.angle += e.body.velocity.x * 0.05;
    });

    const onGround = this.player.body.blocked.down || this.player.body.touching.down;
    if (onGround) this.lastGroundedAt = time;

    // Detect landing: was airborne last frame, on ground this frame, and was
    // moving downward fast. Used by the balloons to add a small downward dip
    // (impulse through taut strings) when the player thumps onto the ground.
    const wasAir = this._wasAirborne === true;
    this._wasAirborne = !onGround;
    if (onGround && wasAir && (this._prevVy || 0) > 220) {
      // Store impulse magnitude (px/s of downward kick) for one frame so
      // _updateBalloons can consume it.
      this._landingImpulse = Phaser.Math.Clamp((this._prevVy - 100) * 0.45, 0, 320);
    }
    this._prevVy = this.player.body.velocity.y;

    const left = this.cursors.left.isDown || this.keys.A.isDown || this.touch.left;
    const right = this.cursors.right.isDown || this.keys.D.isDown || this.touch.right;
    if (left && !right) {
      this.player.setVelocityX(-this.RUN_SPEED);
      this.player.setFlipX(true);
    } else if (right && !left) {
      this.player.setVelocityX(this.RUN_SPEED);
      this.player.setFlipX(false);
    } else {
      this.player.setVelocityX(0);
    }

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.keys.W) ||
      Phaser.Input.Keyboard.JustDown(this.keys.SPACE) ||
      this.touch.jumpJustPressed;
    this.touch.jumpJustPressed = false;
    if (jumpPressed) this.lastJumpPressedAt = time;

    const canCoyote = time - this.lastGroundedAt <= this.COYOTE_MS;
    const buffered = time - this.lastJumpPressedAt <= this.JUMP_BUFFER_MS;
    if (buffered && canCoyote) {
      this.player.setVelocityY(this.JUMP_VELOCITY);
      this.lastJumpPressedAt = -Infinity;
      this.lastGroundedAt = -Infinity;
      this._sfx('jump');
    }

    const jumpHeld =
      this.cursors.up.isDown || this.cursors.space.isDown ||
      this.keys.W.isDown || this.keys.SPACE.isDown ||
      this.touch.jump;
    if (!jumpHeld && this.player.body.velocity.y < -160) {
      this.player.setVelocityY(this.player.body.velocity.y * 0.5);
    }
  }

  _syncHead() {
    if (!this.playerHead) return;
    // Sit head image so its bottom rests on the body's neck, with bob+tilt.
    const headHalf = this.playerHead.displayHeight / 2;
    const bob = this._walkBob || 0;
    const tilt = this._walkTilt || 0;
    this.playerHead.setPosition(this.player.x, this.player.y - 48 + 4 - headHalf - bob);
    this.playerHead.setAngle(tilt);
    this.playerHead.setFlipX(this.player.flipX);
    this.playerHead.setTint(this.gameOver ? 0xbbbbbb : 0xffffff);
    this.playerHead.setVisible(this.player.visible);
  }

  _syncOutfit() {
    if (!this.gownImg || !this.capImg || !this.playerHead) return;
    const past = (this._graduateAtX != null) && (this.player.x > this._graduateAtX);
    if (past && !this._graduated) {
      this._graduated = true;
      this.gownImg.setVisible(true);
      this.capImg.setVisible(true);
      // Little celebration pop.
      this.tweens.add({
        targets: [this.gownImg, this.capImg],
        scale: { from: 0.6, to: 1 },
        duration: 280, ease: 'Back.Out',
      });
      this._sfx && this._sfx('win');
      // Brief Turkish congratulations message.
      const cam = this.cameras.main;
      const msg = this.add.text(cam.width / 2, 90, 'Tebrikler! Mezun oldun! \ud83c\udf93', {
        font: 'bold 28px monospace', color: '#ffeb3b',
        stroke: '#000', strokeThickness: 5, align: 'center',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(120);
      this.tweens.add({
        targets: msg, alpha: { from: 1, to: 0 }, y: 60,
        delay: 1200, duration: 900, onComplete: () => msg.destroy(),
      });
    }
    if (!this._graduated) return;
    const bob = this._walkBob || 0;
    const tilt = this._walkTilt || 0;
    // Gown follows the body, lifted so collar sits at the neck (not waist).
    this.gownImg.setPosition(this.player.x, this.player.y - 14 - bob);
    this.gownImg.setAngle(tilt);
    this.gownImg.setFlipX(this.player.flipX);
    this.gownImg.setVisible(this.player.visible);
    // Cap sits on top of the head image.
    const headTopY = this.playerHead.y - this.playerHead.displayHeight / 2 + 6;
    this.capImg.setPosition(this.playerHead.x, headTopY);
    this.capImg.setAngle(tilt);
    this.capImg.setFlipX(this.player.flipX);
    this.capImg.setVisible(this.playerHead.visible);
  }

  _doRestart() {
    if (this._restarting) return;
    this._restarting = true;
    // Hard refresh the whole page — the most reliable possible restart.
    window.location.reload();
  }

  // --- Balloons -----------------------------------------------------------

  _initBalloons(count) {
    // Curated palette of cheerful balloon colours.
    const palette = [
      { main: 0xe53935, hi: 0xff7a6b, knot: 0xb71c1c }, // red
      { main: 0xfbc02d, hi: 0xfff59d, knot: 0xf57f17 }, // yellow
      { main: 0x1e88e5, hi: 0x90caf9, knot: 0x0d47a1 }, // blue
      { main: 0x43a047, hi: 0xa5d6a7, knot: 0x1b5e20 }, // green
      { main: 0xec407a, hi: 0xf8bbd0, knot: 0xad1457 }, // pink
      { main: 0x8e24aa, hi: 0xce93d8, knot: 0x4a148c }, // purple
      { main: 0xff9800, hi: 0xffcc80, knot: 0xe65100 }, // orange
      { main: 0x00acc1, hi: 0x80deea, knot: 0x006064 }, // cyan
      { main: 0x7cb342, hi: 0xc5e1a5, knot: 0x33691e }, // lime
      { main: 0xffffff, hi: 0xeeeeee, knot: 0xbdbdbd }, // white
      { main: 0x6d4c41, hi: 0xa1887f, knot: 0x3e2723 }, // brown
      { main: 0xffd54f, hi: 0xfff8e1, knot: 0xff8f00 }, // amber
    ];

    const g = this.add.graphics();
    for (let i = 0; i < count; i++) {
      const def = Phaser.Utils.Array.GetRandom(palette);
      const key = `balloon-rng-${i}-${Date.now()}`;
      this._buildBalloonTexture(g, key, def.main, def.hi, def.knot);

      const scale  = Phaser.Math.FloatBetween(0.85, 1.35); // some bigger / smaller
      const length = Phaser.Math.Between(140, 220);
      const handDX = Phaser.Math.Between(-12, 12);

      const img = this.add.image(this.player.x, this.player.y - length, key)
        .setDepth(6)
        .setScale(scale);
      this.balloons.push({
        img, scale, color: def.main,
        pos: new Phaser.Math.Vector2(this.player.x + handDX, this.player.y - length),
        vel: new Phaser.Math.Vector2(0, 0),
        length, handDX,
      });
    }
    g.destroy();
  }

  _popOneBalloon() {
    if (this.balloons.length === 0) return;
    // Pop the LAST balloon (newest in hand) for a nice visual flow.
    const b = this.balloons.pop();
    const x = b.pos.x, y = b.pos.y, color = b.color, scale = b.scale;

    // --- Stage 1: Anticipation — balloon stretches sideways for ONE frame
    // before exploding. This little "squish" sells the pop hugely.
    this.tweens.add({
      targets: b.img,
      scaleX: scale * 1.45,
      scaleY: scale * 0.7,
      duration: 50, ease: 'Quad.Out',
      onComplete: () => {
        // Stage 2: balloon vanishes instantly (it has been replaced by the
        // shrapnel pieces below).
        this.tweens.add({
          targets: b.img,
          scale: scale * 2.4, alpha: 0,
          duration: 90, ease: 'Quad.Out',
          onComplete: () => b.img.destroy(),
        });
      },
    });

    // --- Layer 1: Long curly rubber strips (real popped balloon look) ---
    // Each strip is an elongated rubber-coloured rectangle that flies out
    // and tumbles wildly while shrinking — like the deflated rubber skin.
    const STRIPS = 14;
    for (let i = 0; i < STRIPS; i++) {
      const ang = (i / STRIPS) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.18, 0.18);
      const speed = Phaser.Math.Between(180, 360);
      const len = Phaser.Math.Between(18, 34);
      const strip = this.add.rectangle(x, y, len, 4, color)
        .setDepth(8)
        .setRotation(ang);
      // Tiny lighter highlight on the strip so it reads as rubber.
      const high = this.add.rectangle(x, y, len * 0.6, 1, 0xffffff, 0.6)
        .setDepth(9)
        .setRotation(ang);
      const tx = x + Math.cos(ang) * speed;
      const ty = y + Math.sin(ang) * speed + Phaser.Math.Between(80, 180);
      const spin = Phaser.Math.Between(-900, 900);
      this.tweens.add({
        targets: [strip, high],
        x: tx, y: ty,
        alpha: 0,
        angle: spin,
        scaleX: 0.15, scaleY: 0.35,
        duration: Phaser.Math.Between(700, 1000),
        ease: 'Quad.Out',
        onComplete: () => { strip.destroy(); high.destroy(); },
      });
    }

    // --- Layer 2: Tiny rubber dust (small squares from the balloon skin) ---
    for (let i = 0; i < 22; i++) {
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const speed = Phaser.Math.Between(60, 200);
      const dust = this.add.rectangle(
        x, y,
        Phaser.Math.Between(2, 4),
        Phaser.Math.Between(2, 4),
        color,
      ).setDepth(8);
      this.tweens.add({
        targets: dust,
        x: x + Math.cos(ang) * speed,
        y: y + Math.sin(ang) * speed + Phaser.Math.Between(40, 100),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(450, 700),
        ease: 'Quad.Out',
        onComplete: () => dust.destroy(),
      });
    }

    // --- Layer 3: Multi-coloured confetti fountain ---
    const confettiColors = [0xff3b30, 0xffcc00, 0x34c759, 0x00c7ff, 0xff2d92, 0xaf52de, 0xffffff];
    for (let i = 0; i < 26; i++) {
      const ang = Phaser.Math.FloatBetween(-Math.PI, 0); // mostly upward fountain
      const speed = Phaser.Math.Between(120, 320);
      const c = confettiColors[Phaser.Math.Between(0, confettiColors.length - 1)];
      const conf = this.add.rectangle(
        x, y,
        Phaser.Math.Between(3, 6),
        Phaser.Math.Between(7, 14),
        c,
      ).setDepth(9).setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2));
      this.tweens.add({
        targets: conf,
        x: x + Math.cos(ang) * speed + Phaser.Math.Between(-40, 40),
        y: y + Math.sin(ang) * speed + Phaser.Math.Between(160, 280), // gravity
        alpha: 0,
        angle: Phaser.Math.Between(-720, 720),
        duration: Phaser.Math.Between(800, 1200),
        ease: 'Quad.Out',
        onComplete: () => conf.destroy(),
      });
    }

    // --- Layer 4: Sparkle bursts at random offsets (twinkles) ---
    for (let i = 0; i < 14; i++) {
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(10, 40);
      const sx = x + Math.cos(ang) * dist;
      const sy = y + Math.sin(ang) * dist;
      const spark = this.add.star(sx, sy, 4, 1, 5, 0xffffff)
        .setDepth(10)
        .setScale(0);
      const delay = Phaser.Math.Between(0, 180);
      this.tweens.add({
        targets: spark,
        scale: Phaser.Math.FloatBetween(0.6, 1.1),
        duration: 120, ease: 'Back.Out',
        delay,
        onComplete: () => {
          this.tweens.add({
            targets: spark, scale: 0, alpha: 0,
            duration: 180, ease: 'Quad.In',
            onComplete: () => spark.destroy(),
          });
        },
      });
    }

    // --- Layer 5: Outward shockwave — TWO concentric rings ---
    const ring1 = this.add.circle(x, y, 8, 0xffffff, 0.95).setDepth(7);
    this.tweens.add({
      targets: ring1, radius: 56, alpha: 0,
      duration: 320, ease: 'Quad.Out',
      onComplete: () => ring1.destroy(),
    });
    const ring2 = this.add.circle(x, y, 4, color, 0.75).setDepth(7);
    this.tweens.add({
      targets: ring2, radius: 80, alpha: 0,
      duration: 420, ease: 'Quad.Out',
      onComplete: () => ring2.destroy(),
    });

    // --- Layer 6: bright central white-out flash ---
    const flash = this.add.circle(x, y, 26, 0xffffff, 1).setDepth(11);
    this.tweens.add({
      targets: flash, scale: 0.15, alpha: 0,
      duration: 200, ease: 'Quad.Out',
      onComplete: () => flash.destroy(),
    });

    // --- Layer 7: Big spiky impact star (cartoon "BOOM") ---
    const impact = this.add.star(x, y, 12, 8, 30, 0xffeb3b).setDepth(11);
    this.tweens.add({
      targets: impact, scale: 2.4, alpha: 0, angle: 60,
      duration: 300, ease: 'Quad.Out',
      onComplete: () => impact.destroy(),
    });
    // Inner orange star for depth.
    const impact2 = this.add.star(x, y, 8, 4, 18, 0xff6f00).setDepth(11);
    this.tweens.add({
      targets: impact2, scale: 1.8, alpha: 0, angle: -45,
      duration: 260, ease: 'Quad.Out',
      onComplete: () => impact2.destroy(),
    });

    // --- Layer 8: "PAATTT!" text with overshoot bounce ---
    const pop = this.add.text(x, y - 4, 'PAATTT!', {
      font: 'bold 34px monospace', color: '#ffeb3b',
      stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(12).setScale(0.2);
    this.tweens.add({
      targets: pop,
      scale: 1.4,
      angle: Phaser.Math.Between(-8, 8),
      duration: 160, ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: pop, y: y - 50, alpha: 0, scale: 1.7,
          duration: 520, ease: 'Quad.Out',
          onComplete: () => pop.destroy(),
        });
      },
    });

    this._sfx('pop');
  }

  _updateBalloons(dtRaw) {
    const dt = Math.min(dtRaw, 0.033);
    this.balloonStrings.clear();
    this.balloonStrings.lineStyle(1.5, 0xffffff, 0.95);

    // Consume any one-shot landing impulse from the player. This is added
    // ONLY to balloons whose string is currently taut, mimicking a real
    // jolt being transmitted through a tight string when the player thumps
    // onto the ground after a jump.
    const landingKick = this._landingImpulse || 0;
    this._landingImpulse = 0;

    // Hand anchor: at the actual drawn HAND position on the body texture.
    // We anchor the balloons to the HAND BEHIND the direction of motion
    // (so when the player walks right, the strings come from the left/back
    // hand, and vice versa). This matches how a kid running with balloons
    // would naturally trail them behind.
    const dirX = this.player.flipX ? 1 : -1;
    const handBaseX = this.player.x + dirX * this.HAND_DX;
    const handBaseY = this.player.y + this.HAND_DY;

    this.balloons.forEach((b, idx) => {
      const anchorX = handBaseX + b.handDX * dirX;
      const anchorY = handBaseY;

      const dx = b.pos.x - anchorX;
      const dy = b.pos.y - anchorY;
      const dist = Math.max(0.0001, Math.hypot(dx, dy));
      const nx = dx / dist;
      const ny = dy / dist;

      // If string is taut at the moment of landing, transmit a small
      // downward impulse to the balloon so it dips with some inertia.
      if (landingKick > 0 && dist >= b.length * 0.96) {
        b.vel.y += landingKick * Phaser.Math.FloatBetween(0.85, 1.15);
      }

      const stretch = dist - b.length;
      const springMag = stretch > 0 ? -this.BALLOON_STIFF * stretch : 0;
      const ax = nx * springMag - this.BALLOON_DAMP * b.vel.x;
      const ay = ny * springMag + this.BALLOON_LIFT + this.BALLOON_GRAVITY
                 - this.BALLOON_DAMP * b.vel.y;

      b.vel.x += ax * dt;
      b.vel.y += ay * dt;
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;

      // Hard string-length constraint.
      const ndx = b.pos.x - anchorX;
      const ndy = b.pos.y - anchorY;
      const ndist = Math.hypot(ndx, ndy);
      const maxLen = b.length * 1.05;
      if (ndist > maxLen) {
        const k = maxLen / ndist;
        b.pos.x = anchorX + ndx * k;
        b.pos.y = anchorY + ndy * k;
        const rx = ndx / ndist, ry = ndy / ndist;
        const radial = b.vel.x * rx + b.vel.y * ry;
        if (radial > 0) {
          b.vel.x -= radial * rx;
          b.vel.y -= radial * ry;
        }
      }

      // Mild collision avoidance between balloons (so they don't perfectly overlap).
      this.balloons.forEach((other, j) => {
        if (j === idx) return;
        const odx = b.pos.x - other.pos.x;
        const ody = b.pos.y - other.pos.y;
        const od = Math.hypot(odx, ody);
        const minD = 30;
        if (od < minD && od > 0.0001) {
          const push = (minD - od) * 0.5;
          b.pos.x += (odx / od) * push;
          b.pos.y += (ody / od) * push;
        }
      });

      b.img.setPosition(b.pos.x, b.pos.y);
      const tilt = Phaser.Math.Clamp((b.pos.x - anchorX) * 0.5, -25, 25);
      b.img.setAngle(tilt);

      // String (curved bezier with sag).
      const midX = (anchorX + b.pos.x) / 2;
      const midY = (anchorY + b.pos.y) / 2 + 14;
      this.balloonStrings.beginPath();
      this.balloonStrings.moveTo(anchorX, anchorY);
      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const omt = 1 - t;
        const x = omt * omt * anchorX + 2 * omt * t * midX + t * t * b.pos.x;
        const y = omt * omt * anchorY + 2 * omt * t * midY + t * t * (b.pos.y + 18);
        this.balloonStrings.lineTo(x, y);
      }
      this.balloonStrings.strokePath();
    });
  }

  // --- Rocket -------------------------------------------------------------

  _scheduleRocketLaunch() {
    const launch = () => {
      if (!this.rocket) return;
      this.rocket.launching = true;
      this.rocket.vy = -20;
    };
    this.time.delayedCall(2000, launch);
    this.time.addEvent({ delay: 12000, callback: launch, loop: true });
  }

  _updateRocket(dt) {
    const r = this.rocket;
    if (!r) return;

    if (r.launching) {
      r.vy -= 320 * dt;
      r.body.y += r.vy * dt;
      if (r.smokeTimer === undefined) r.smokeTimer = 0;
      r.smokeTimer += dt;
      if (r.smokeTimer > 0.04) {
        r.smokeTimer = 0;
        const puff = this.add.image(
          r.body.x + Phaser.Math.Between(-6, 6),
          r.body.y + 36,
          'smoke'
        ).setScrollFactor(0.6).setDepth(-45).setAlpha(0.9)
         .setScale(Phaser.Math.FloatBetween(0.6, 1.2));
        this.tweens.add({
          targets: puff, alpha: 0,
          scale: puff.scale * 2.2,
          y: puff.y + Phaser.Math.Between(20, 60),
          duration: 1400, onComplete: () => puff.destroy(),
        });
      }
      r.flame.setScale(1, Phaser.Math.FloatBetween(0.8, 1.4));
      r.flame.setPosition(r.body.x, r.body.y + 38);
      if (r.body.y < -200) {
        r.body.y = r.startY;
        r.vy = 0;
        r.launching = false;
        r.flame.setVisible(false);
      } else {
        r.flame.setVisible(true);
      }
    } else {
      r.flame.setVisible(false);
    }
  }

  // --- Game events --------------------------------------------------------

  _collectApple(_p, apple) {
    apple.disableBody(true, true);
    this.score += 1;
    this._updateScoreText();
    this._sfx('coin');
    // Quick scale pop on the score card.
    if (this.hudPanel) {
      this.tweens.add({
        targets: this.hudPanel, scale: 1.1, duration: 90, yoyo: true, ease: 'sine.out',
      });
    }
  }

  _hitEnemy(player, enemy) {
    // Anything coming down from above counts as a stomp -> enemy disappears.
    const stomping =
      player.body.velocity.y > 30 &&
      player.body.bottom - 10 < enemy.body.top;

    if (stomping) {
      // Pop effect + remove enemy completely.
      const px = enemy.x, py = enemy.y;
      enemy.disableBody(true, true);
      const burst = this.add.text(px, py - 10, '★', {
        font: 'bold 24px monospace', color: '#ffeb3b',
        stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(50);
      this.tweens.add({
        targets: burst, y: py - 50, alpha: 0, scale: 1.6,
        duration: 500, onComplete: () => burst.destroy(),
      });
      player.setVelocityY(-300);
      this.score += 2;
      this._updateScoreText();
      this._sfx('stomp');
      return;
    }

    // Damage taken: short invulnerability so we don't re-trigger every frame.
    if (this._invulnUntil && this.time.now < this._invulnUntil) return;
    this._invulnUntil = this.time.now + 1100;

    // Knockback away from the enemy.
    const dir = player.x < enemy.x ? -1 : 1;
    player.setVelocity(220 * dir, -260);

    if (this.balloons.length > 0) {
      this._popOneBalloon();
      this._flashDamage();
      if (this.balloons.length === 0) {
        // Last balloon just popped — end the game on the next tick so the
        // pop animation has a moment to play.
        this.time.delayedCall(250, () => {
          this._endGame(this._isTouch
            ? 'Eyvah! Tüm balonlar patladı!'
            : 'Eyvah! Tüm balonlar patladı!\nR ile yeniden başla');
        });
      }
    } else {
      this._endGame(this._isTouch ? 'Eyvah!' : 'Eyvah!\nR ile yeniden başla');
    }
  }

  _flashDamage() {
    // Translucent red overlay on the player + head, blinking a few times.
    const targets = [this.player, this.playerHead].filter(Boolean);
    targets.forEach((t) => t.setTintFill(0xff3030));
    const blinks = 6;
    let count = 0;
    const ev = this.time.addEvent({
      delay: 90, repeat: blinks - 1,
      callback: () => {
        count += 1;
        const on = count % 2 === 1;
        targets.forEach((t) => t.setAlpha(on ? 0.55 : 1));
      },
    });
    this.time.delayedCall(blinks * 90 + 40, () => {
      ev.remove();
      targets.forEach((t) => { t.clearTint(); t.setAlpha(1); });
      if (this.playerHead) this.playerHead.setTint(this.gameOver ? 0xbbbbbb : 0xffffff);
    });
  }

  _reachGoal() {
    this._sfx('win');
    const hint = this._isTouch ? '' : '\nR ile tekrar oyna';
    this._endGame('Tebrikler!\nVitamin: ' + this.score + hint);
  }

  _endGame(text) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.player.setTint(0xbbbbbb);
    this.player.setVelocity(0, 0);
    this.physics.pause();
    this.messageText.setText(text);
    this.restartBtn.setVisible(true);
    // Make sure the on-screen tap-jump zone doesn't eat the restart click.
    if (this.tapZone) this.tapZone.disableInteractive();
    if (this.touchBtnLeft)  this.touchBtnLeft._hit.disableInteractive();
    if (this.touchBtnRight) this.touchBtnRight._hit.disableInteractive();
    if (this.touchBtnJump)  this.touchBtnJump._hit.disableInteractive();
  }

  _handleResize(gameSize) {
    if (this.messageText) {
      this.messageText.setPosition(gameSize.width / 2, gameSize.height / 2 - 40);
    }
    if (this.restartBtn) {
      this.restartBtn.setPosition(gameSize.width / 2, gameSize.height / 2 + 40);
    }
    this._layoutTouchControls(gameSize.width, gameSize.height);
  }

  // ---- Touch controls (iPad / phones) ------------------------------------

  _buildTouchControls(viewW, viewH) {
    // Build three big translucent on-screen buttons (left, right, jump) plus
    // a tap-anywhere-to-jump zone covering the rest of the screen.
    const make = (label) => {
      const c = this.add.container(0, 0).setScrollFactor(0).setDepth(110);
      const bg = this.add.graphics();
      const txt = this.add.text(0, 0, label, {
        font: 'bold 56px monospace', color: '#ffffff',
        stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5);
      c.add([bg, txt]);
      c._bg = bg; c._txt = txt;
      return c;
    };

    this.touchBtnLeft  = make('\u25C0');
    this.touchBtnRight = make('\u25B6');
    this.touchBtnJump  = make('\u25B2');

    // Background tap zone (whole screen) — taps that are NOT on a button
    // count as a jump. Lives below the buttons in depth.
    this.tapZone = this.add.zone(0, 0, viewW, viewH)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(105)
      .setInteractive();
    this.tapZone.on('pointerdown', () => {
      this.touch.jumpJustPressed = true;
      this.touch.jump = true;
    });
    this.tapZone.on('pointerup',   () => { this.touch.jump = false; });
    this.tapZone.on('pointerout',  () => { this.touch.jump = false; });

    const wireHold = (btn, key) => {
      btn._hit.on('pointerdown', (pointer, _x, _y, ev) => {
        this.touch[key] = true;
        if (key === 'jump') this.touch.jumpJustPressed = true;
        if (ev && ev.stopPropagation) ev.stopPropagation();
      });
      const release = () => { this.touch[key] = false; };
      btn._hit.on('pointerup', release);
      btn._hit.on('pointerout', release);
      btn._hit.on('pointerupoutside', release);
    };

    [this.touchBtnLeft, this.touchBtnRight, this.touchBtnJump].forEach((b) => {
      b._hit = this.add.zone(0, 0, 1, 1)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(112)
        .setInteractive();
      b.add(b._hit);
    });
    wireHold(this.touchBtnLeft,  'left');
    wireHold(this.touchBtnRight, 'right');
    wireHold(this.touchBtnJump,  'jump');

    // Hide on devices without touch (e.g. desktop with mouse only).
    const isTouch =
      ('ontouchstart' in window) ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    this._isTouch = !!isTouch;
    if (!isTouch) {
      [this.touchBtnLeft, this.touchBtnRight, this.touchBtnJump, this.tapZone]
        .forEach((o) => o.setVisible(false));
      // Still let mouse clicks tap-jump? Keep zone disabled to avoid surprise.
      this.tapZone.disableInteractive();
    }

    this._layoutTouchControls(viewW, viewH);
  }

  _layoutTouchControls(viewW, viewH) {
    if (!this.touchBtnLeft) return;
    if (this.tapZone) this.tapZone.setSize(viewW, viewH);

    // Size the buttons against the SHORT side of the viewport so they shrink
    // on small/portrait phones. Also cap by horizontal space so left+right+jump
    // never overlap (need 6r + gaps + margins to fit across viewW).
    const short = Math.min(viewW, viewH);
    let r = Math.round(short * 0.09);
    r = Math.max(28, Math.min(72, r));
    const gap = Math.round(r * 0.5);
    const margin = Math.round(r * 0.6);
    // If left+right pair plus jump button can't fit horizontally, shrink r.
    const needed = margin * 2 + r * 6 + gap * 2; // two left btns + jump
    if (needed > viewW) {
      const scale = viewW / needed;
      r = Math.max(22, Math.round(r * scale));
    }
    const m = Math.round(r * 0.6);
    const g = Math.round(r * 0.5);

    const drawBtn = (btn, cx, cy) => {
      btn.setPosition(cx, cy);
      btn._bg.clear();
      btn._bg.fillStyle(0x000000, 0.35);
      btn._bg.fillCircle(0, 0, r);
      btn._bg.lineStyle(3, 0xffffff, 0.85);
      btn._bg.strokeCircle(0, 0, r);
      btn._txt.setFontSize(Math.round(r * 0.9));
      btn._hit.setSize(r * 2, r * 2);
    };

    // Left + right at bottom-left, jump at bottom-right.
    drawBtn(this.touchBtnLeft,  m + r,             viewH - m - r);
    drawBtn(this.touchBtnRight, m + r * 3 + g,     viewH - m - r);
    drawBtn(this.touchBtnJump,  viewW - m - r,     viewH - m - r);
  }

  // ---- HUD card ----------------------------------------------------------

  _buildHudPanel(_viewW, _viewH) {
    // A rounded translucent panel with an apple icon and score number.
    const panel = this.add.container(16, 14).setScrollFactor(0).setDepth(100);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.55);
    bg.fillRoundedRect(0, 0, 170, 48, 14);
    bg.lineStyle(2, 0xffffff, 0.9);
    bg.strokeRoundedRect(0, 0, 170, 48, 14);
    panel.add(bg);

    // Mixed fruit/veg basket icon.
    const ico = this.add.graphics();
    // Basket
    ico.fillStyle(0x8d6e63, 1);
    ico.fillRoundedRect(8, 26, 32, 14, 4);
    ico.fillStyle(0x6d4c41, 1);
    ico.fillRect(8, 26, 32, 2);
    // Basket weave lines
    ico.lineStyle(1, 0x4e342e, 0.7);
    for (let i = 12; i < 40; i += 5) ico.lineBetween(i, 28, i, 40);
    // Red apple (left)
    ico.fillStyle(0xe53935, 1); ico.fillCircle(15, 22, 6);
    ico.fillStyle(0xff7043, 1); ico.fillCircle(13, 20, 2);
    ico.fillStyle(0x2e7d32, 1); ico.fillRect(15, 14, 4, 2);
    // Orange (middle-back)
    ico.fillStyle(0xfb8c00, 1); ico.fillCircle(24, 20, 6);
    ico.fillStyle(0xffa726, 1); ico.fillCircle(22, 18, 2);
    ico.fillStyle(0x2e7d32, 1); ico.fillTriangle(23, 13, 26, 13, 24, 16);
    // Banana (right, draped)
    ico.fillStyle(0xfdd835, 1);
    ico.fillEllipse(33, 22, 12, 5);
    ico.fillStyle(0xf9a825, 1);
    ico.fillEllipse(33, 21, 10, 3);
    // Grapes peeking
    ico.fillStyle(0x6a1b9a, 1);
    [[33,16],[36,17],[34,19]].forEach(([cx,cy]) => ico.fillCircle(cx, cy, 2));
    panel.add(ico);

    this.scoreText = this.add.text(50, 24, '0', {
      font: 'bold 24px monospace', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0.5);
    panel.add(this.scoreText);

    const label = this.add.text(86, 24, 'Vitamin', {
      font: 'bold 14px monospace', color: '#ffeb3b',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0.5);
    panel.add(label);

    panel.setSize(170, 48);
    this.hudPanel = panel;
    this._updateScoreText();
  }

  _updateScoreText() {
    if (this.scoreText) this.scoreText.setText(String(this.score).padStart(2, '0'));
  }

  // ---- Sound effects (WebAudio, no asset files needed) ------------------

  _sfx(kind) {
    // Lazy-init AudioContext after first user interaction.
    if (!this._audioCtx) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this._audioCtx = new Ctx();
      } catch { return; }
    }
    const ctx = this._audioCtx;

    // Chrome on PC keeps the context "suspended" on HTTPS until a real
    // user gesture has resumed it. resume() is async — if we schedule
    // tones immediately while it's still suspended, they get dropped.
    // Wait for the resume to settle, THEN play.
    const play = () => this._playSfx(kind);
    if (ctx.state === 'suspended') {
      const p = ctx.resume();
      if (p && typeof p.then === 'function') p.then(play, play);
      else play();
    } else {
      play();
    }
  }

  _playSfx(kind) {
    const ctx = this._audioCtx;
    if (!ctx || ctx.state !== 'running') return;

    // Each tone reads ctx.currentTime FRESH so that audio scheduled across
    // multiple ticks always lands in the future.
    const tone = (freq, dur, type = 'square', vol = 0.18, slideTo = null) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo !== null) osc.frequency.linearRampToValueAtTime(slideTo, now + dur);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now); osc.stop(now + dur);
    };

    switch (kind) {
      case 'jump':
        tone(420, 0.18, 'square', 0.15, 720); break;
      case 'coin':
        tone(880, 0.07, 'square', 0.18);
        setTimeout(() => tone(1320, 0.12, 'square', 0.18), 70); break;
      case 'stomp':
        tone(180, 0.12, 'square', 0.22, 90); break;
      case 'hurt':
        tone(300, 0.18, 'sawtooth', 0.22, 90);
        setTimeout(() => tone(180, 0.30, 'sawtooth', 0.22, 60), 120); break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) =>
          setTimeout(() => tone(f, 0.18, 'square', 0.20), i * 110));
        break;
      case 'pop': {
        // Short pitch-down 'pop' (sounds like a balloon bursting).
        tone(900, 0.05, 'square', 0.22, 220);
        // Brief noise burst layered on top.
        try {
          const noiseNow = ctx.currentTime;
          const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
          const data = buf.getChannelData(0);
          for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
          }
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const ng = ctx.createGain();
          ng.gain.setValueAtTime(0.18, noiseNow);
          ng.gain.exponentialRampToValueAtTime(0.0001, noiseNow + 0.08);
          src.connect(ng).connect(ctx.destination);
          src.start(noiseNow);
        } catch { /* noise buffer optional */ }
        break;
      }
      default: break;
    }
  }

  // --- Texture generation -------------------------------------------------

  _buildTextures() {
    const g = this.add.graphics();

    // Player body (no head — head is a separate image overlay).
    this._buildPlayerBodyTexture();
    // Fallback drawn face (used only if assets/face.png is missing).
    this._buildPlayerFaceTexture();

    // Three balloons (red / yellow / blue) -- legacy textures kept for code
    // that may still reference them; runtime balloons are generated on the
    // fly with random colors in _initBalloons().
    this._buildBalloonTexture(g, 'balloon-red',    0xe53935, 0xff7a6b, 0xb71c1c);
    this._buildBalloonTexture(g, 'balloon-yellow', 0xfbc02d, 0xfff59d, 0xf57f17);
    this._buildBalloonTexture(g, 'balloon-blue',   0x1e88e5, 0x90caf9, 0x0d47a1);

    // Grass tile.
    g.fillStyle(0x6d4023, 1); g.fillRect(0, 0, 32, 32);
    g.fillStyle(0x4caf50, 1); g.fillRect(0, 0, 32, 10);
    g.fillStyle(0x66bb6a, 1);
    for (let x = 0; x < 32; x += 3) g.fillRect(x, 0, 1, 4);
    g.fillStyle(0x2e7d32, 1);
    for (let x = 1; x < 32; x += 4) g.fillRect(x, 6, 1, 3);
    g.lineStyle(1, 0x000000, 0.15); g.strokeRect(0, 0, 32, 32);
    g.generateTexture('grass', 32, 32);
    g.clear();

    // Dirt tile.
    g.fillStyle(0x6d4023, 1); g.fillRect(0, 0, 32, 32);
    g.fillStyle(0x5a3219, 1);
    for (let i = 0; i < 8; i++) g.fillRect((i * 7) % 32, (i * 5) % 28, 3, 2);
    g.lineStyle(1, 0x000000, 0.1); g.strokeRect(0, 0, 32, 32);
    g.generateTexture('dirt', 32, 32);
    g.clear();

    // Bench plank.
    g.fillStyle(0xa1662f, 1); g.fillRect(0, 0, 32, 12);
    g.fillStyle(0x7a4a1f, 1); g.fillRect(0, 10, 32, 2);
    g.fillStyle(0x5d3a18, 1); g.fillRect(2, 4, 1, 4); g.fillRect(20, 4, 1, 4);
    g.lineStyle(1, 0x000000, 0.2); g.strokeRect(0, 0, 32, 12);
    g.generateTexture('bench', 32, 12);
    g.clear();

    // ---- Fruit & Veg textures (64×64 — crisp, no upscaling blur) ----
    const FRUIT_SIZE = 64;
    const F = FRUIT_SIZE;

    // Apple — bright red with shine and stem.
    g.fillStyle(0xb71c1c, 1); g.fillCircle(F/2, F/2 + 4, 26);
    g.fillStyle(0xe53935, 1); g.fillCircle(F/2, F/2 + 4, 22);
    g.fillStyle(0xff8a65, 1); g.fillCircle(F/2 - 8, F/2 - 4, 8);
    g.fillStyle(0xffccbc, 1); g.fillCircle(F/2 - 10, F/2 - 6, 4);
    // Indent at top
    g.fillStyle(0x8e0000, 1); g.fillEllipse(F/2, F/2 - 18, 10, 5);
    // Stem
    g.fillStyle(0x4e342e, 1); g.fillRect(F/2 - 1, 8, 3, 12);
    // Leaf
    g.fillStyle(0x2e7d32, 1); g.fillEllipse(F/2 + 8, 14, 14, 7);
    g.fillStyle(0x66bb6a, 1); g.fillEllipse(F/2 + 6, 13, 8, 3);
    g.generateTexture('apple', F, F);
    g.clear();

    // Banana — yellow crescent.
    g.fillStyle(0xf57f17, 1);
    g.fillEllipse(F/2, F/2 + 8, 50, 22);
    g.fillStyle(0xfdd835, 1);
    g.fillEllipse(F/2, F/2 + 4, 48, 18);
    g.fillStyle(0xfff176, 1);
    g.fillEllipse(F/2, F/2, 44, 10);
    // "Eat" the inner curve so it becomes a crescent.
    g.fillStyle(0x000000, 0); // we have no eraser; instead, use overpainting trick
    // Re-cover the top with crescent-cutout via a bigger ellipse offset upward,
    // matching no background — instead use a crescent shadow band.
    g.fillStyle(0xf9a825, 1);
    g.fillEllipse(F/2, F/2 + 16, 46, 10);
    // Tips and stem
    g.fillStyle(0x6d4c41, 1);
    g.fillRect(8, F/2 + 6, 4, 8);
    g.fillRect(F - 12, F/2 + 6, 4, 8);
    g.fillRect(F/2 - 2, F/2 - 8, 4, 6);
    g.generateTexture('banana', F, F);
    g.clear();

    // Orange.
    g.fillStyle(0xe65100, 1); g.fillCircle(F/2, F/2 + 4, 26);
    g.fillStyle(0xfb8c00, 1); g.fillCircle(F/2, F/2 + 4, 23);
    g.fillStyle(0xffa726, 1); g.fillCircle(F/2 - 7, F/2 - 4, 9);
    g.fillStyle(0xffe0b2, 1); g.fillCircle(F/2 - 9, F/2 - 6, 4);
    // Stem hole
    g.fillStyle(0xbf360c, 1); g.fillCircle(F/2, F/2 - 18, 4);
    // Leaf
    g.fillStyle(0x2e7d32, 1); g.fillEllipse(F/2 + 6, 16, 14, 6);
    g.generateTexture('orange', F, F);
    g.clear();

    // Strawberry — heart-ish red with seeds and leafy crown.
    g.fillStyle(0xb71c1c, 1);
    g.fillTriangle(8, 24, F - 8, 24, F/2, F - 6);
    g.fillStyle(0xe53935, 1);
    g.fillTriangle(12, 26, F - 12, 26, F/2, F - 10);
    // Round shoulders
    g.fillStyle(0xe53935, 1);
    g.fillCircle(20, 26, 10);
    g.fillCircle(F - 20, 26, 10);
    // Seeds
    g.fillStyle(0xfff59d, 1);
    [[20,32],[30,40],[40,32],[24,46],[36,46],[32,52],[44,42]].forEach(([sx,sy]) => {
      g.fillEllipse(sx, sy, 3, 4);
    });
    // Leafy crown
    g.fillStyle(0x2e7d32, 1);
    g.fillTriangle(10, 22, 24, 14, 22, 26);
    g.fillTriangle(22, 22, F/2, 8, 30, 26);
    g.fillTriangle(F/2, 8, 42, 22, 34, 26);
    g.fillTriangle(40, 22, F - 10, 22, 42, 26);
    g.fillStyle(0x66bb6a, 1);
    g.fillTriangle(F/2 - 4, 12, F/2 + 4, 12, F/2, 22);
    g.generateTexture('strawberry', F, F);
    g.clear();

    // Grapes — cluster of purple grapes.
    const grapePositions = [
      [22,26],[F/2,26],[42,26],
      [18,36],[30,36],[42,36],[F-14,36],
      [24,46],[36,46],[F-18,46],
      [30,54],[F/2,54],
    ];
    g.fillStyle(0x4a148c, 1);
    grapePositions.forEach(([gx,gy]) => g.fillCircle(gx, gy, 8));
    g.fillStyle(0x6a1b9a, 1);
    grapePositions.forEach(([gx,gy]) => g.fillCircle(gx, gy, 6));
    g.fillStyle(0xab47bc, 1);
    grapePositions.forEach(([gx,gy]) => g.fillCircle(gx - 2, gy - 2, 2));
    // Stem + leaf
    g.fillStyle(0x4e342e, 1); g.fillRect(F/2 - 1, 8, 3, 14);
    g.fillStyle(0x2e7d32, 1); g.fillEllipse(F/2 + 10, 14, 16, 8);
    g.generateTexture('grapes', F, F);
    g.clear();

    // Watermelon slice.
    g.fillStyle(0x1b5e20, 1); g.fillTriangle(6, F - 14, F - 6, F - 14, F/2, 10);
    g.fillStyle(0x66bb6a, 1); g.fillTriangle(10, F - 16, F - 10, F - 16, F/2, 14);
    g.fillStyle(0xfff8e1, 1); g.fillTriangle(13, F - 19, F - 13, F - 19, F/2, 17);
    g.fillStyle(0xe53935, 1); g.fillTriangle(16, F - 22, F - 16, F - 22, F/2, 22);
    // Seeds
    g.fillStyle(0x212121, 1);
    [[26,40],[F/2,32],[F-26,40],[F/2-8,46],[F/2+8,46],[F/2,52]].forEach(([sx,sy]) => {
      g.fillEllipse(sx, sy, 4, 6);
    });
    g.generateTexture('watermelon', F, F);
    g.clear();

    // Carrot — orange cone with leafy top.
    g.fillStyle(0xe65100, 1);
    g.fillTriangle(16, 22, F - 16, 22, F/2, F - 6);
    g.fillStyle(0xfb8c00, 1);
    g.fillTriangle(20, 24, F - 20, 24, F/2, F - 10);
    // Ridges
    g.fillStyle(0xef6c00, 1);
    g.fillRect(28, 32, 8, 2); g.fillRect(F/2 - 4, 42, 8, 2); g.fillRect(F/2 - 2, 50, 4, 2);
    // Leaves
    g.fillStyle(0x2e7d32, 1);
    g.fillTriangle(14, 24, 26, 24, 16, 4);
    g.fillTriangle(22, 24, 38, 24, F/2, 0);
    g.fillTriangle(F - 26, 24, F - 14, 24, F - 16, 4);
    g.fillStyle(0x66bb6a, 1);
    g.fillTriangle(20, 24, 28, 24, 22, 10);
    g.fillTriangle(F - 28, 24, F - 20, 24, F - 22, 10);
    g.generateTexture('carrot', F, F);
    g.clear();

    // Tomato.
    g.fillStyle(0x8b0000, 1); g.fillCircle(F/2, F/2 + 4, 26);
    g.fillStyle(0xc62828, 1); g.fillCircle(F/2, F/2 + 4, 23);
    g.fillStyle(0xe53935, 1); g.fillCircle(F/2 - 8, F/2 - 4, 9);
    g.fillStyle(0xff8a80, 1); g.fillCircle(F/2 - 10, F/2 - 6, 4);
    // Crown of leaves
    g.fillStyle(0x2e7d32, 1);
    g.fillTriangle(F/2 - 14, 18, F/2 + 14, 18, F/2, 28);
    g.fillTriangle(F/2 - 16, 14, F/2 - 4, 14, F/2 - 10, 4);
    g.fillTriangle(F/2 - 6, 14, F/2 + 6, 14, F/2, 0);
    g.fillTriangle(F/2 + 4, 14, F/2 + 16, 14, F/2 + 10, 4);
    g.generateTexture('tomato', F, F);
    g.clear();

    // Eggplant — purple oval with green crown.
    g.fillStyle(0x4a148c, 1); g.fillEllipse(F/2, F/2 + 8, 36, 46);
    g.fillStyle(0x6a1b9a, 1); g.fillEllipse(F/2, F/2 + 10, 32, 42);
    g.fillStyle(0x9c27b0, 1); g.fillEllipse(F/2 - 6, F/2 - 4, 10, 18);
    g.fillStyle(0xce93d8, 1); g.fillEllipse(F/2 - 8, F/2 - 8, 4, 8);
    // Stem & calyx
    g.fillStyle(0x2e7d32, 1);
    g.fillTriangle(F/2 - 16, 16, F/2 + 16, 16, F/2, 30);
    g.fillRect(F/2 - 2, 4, 4, 14);
    g.fillStyle(0x66bb6a, 1);
    g.fillTriangle(F/2 - 10, 18, F/2 + 10, 18, F/2, 26);
    g.generateTexture('eggplant', F, F);
    g.clear();

    // Pear — yellow-green teardrop.
    g.fillStyle(0x558b2f, 1); g.fillCircle(F/2, F - 18, 22);
    g.fillStyle(0x9ccc65, 1); g.fillCircle(F/2, F - 18, 19);
    g.fillStyle(0x558b2f, 1); g.fillCircle(F/2, F/2 - 4, 14);
    g.fillStyle(0x9ccc65, 1); g.fillCircle(F/2, F/2 - 4, 11);
    g.fillStyle(0xdcedc8, 1); g.fillCircle(F/2 - 6, F/2 - 8, 5);
    // Stem & leaf
    g.fillStyle(0x4e342e, 1); g.fillRect(F/2 - 2, 8, 4, 12);
    g.fillStyle(0x2e7d32, 1); g.fillEllipse(F/2 + 10, 16, 14, 7);
    g.generateTexture('pear', F, F);
    g.clear();

    // Broccoli — green florets on a pale stalk.
    // Stalk
    g.fillStyle(0xc5e1a5, 1); g.fillRect(F/2 - 8, 36, 16, F - 40);
    g.fillStyle(0x9ccc65, 1); g.fillRect(F/2 - 4, 36, 8, F - 40);
    // Florets
    g.fillStyle(0x1b5e20, 1);
    [[18,28],[30,18],[F/2,12],[42,18],[F-18,28],[26,32],[F-26,32],[F/2,32]].forEach(([fx,fy]) => {
      g.fillCircle(fx, fy, 11);
    });
    g.fillStyle(0x2e7d32, 1);
    [[18,28],[30,18],[F/2,12],[42,18],[F-18,28],[26,32],[F-26,32],[F/2,32]].forEach(([fx,fy]) => {
      g.fillCircle(fx, fy, 8);
    });
    g.fillStyle(0x66bb6a, 1);
    [[18,28],[30,18],[F/2,12],[42,18],[F-18,28]].forEach(([fx,fy]) => {
      g.fillCircle(fx - 2, fy - 2, 3);
    });
    g.generateTexture('broccoli', F, F);
    g.clear();

    // Rival — a spiked rolling dodgeball (no eyes, no face). Designed to read
    // as a thing, not an animal or person.
    g.fillStyle(0xb71c1c, 1); g.fillCircle(14, 14, 12);
    g.fillStyle(0xe53935, 1); g.fillCircle(14, 14, 10);
    // White stripe band
    g.fillStyle(0xffffff, 1);
    g.fillRect(2, 12, 24, 4);
    g.fillStyle(0xb71c1c, 1);
    for (let i = 0; i < 6; i++) g.fillRect(2 + i * 4, 13, 2, 2);
    // Stubby spikes around the rim
    g.fillStyle(0x424242, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sx = 14 + Math.cos(a) * 12;
      const sy = 14 + Math.sin(a) * 12;
      g.fillTriangle(sx, sy, 14 + Math.cos(a + 0.2) * 14, 14 + Math.sin(a + 0.2) * 14,
                     14 + Math.cos(a - 0.2) * 14, 14 + Math.sin(a - 0.2) * 14);
    }
    // Highlight
    g.fillStyle(0xffffff, 0.5); g.fillCircle(10, 10, 2.5);
    g.generateTexture('rival', 28, 28);
    g.clear();

    // Goal flag.
    g.fillStyle(0xbdbdbd, 1); g.fillRect(14, 0, 4, 80);
    g.fillStyle(0x00bcd4, 1); g.fillTriangle(18, 4, 18, 30, 36, 17);
    g.fillStyle(0xfbc02d, 1); g.fillCircle(16, 0, 4);
    g.generateTexture('flag', 36, 80);
    g.clear();

    // Cloud.
    g.fillStyle(0xffffff, 1);
    g.fillCircle(20, 20, 15); g.fillCircle(38, 22, 13);
    g.fillCircle(56, 20, 15); g.fillCircle(28, 28, 13); g.fillCircle(48, 28, 13);
    g.generateTexture('cloud', 76, 40);
    g.clear();

    // Hill.
    g.fillStyle(0x81c784, 1); g.fillEllipse(140, 90, 280, 140);
    g.generateTexture('hill', 280, 90);
    g.clear();

    // Tree.
    g.fillStyle(0x5d4037, 1); g.fillRect(18, 36, 10, 36);
    g.fillStyle(0x2e7d32, 1); g.fillCircle(23, 22, 22);
    g.fillStyle(0x388e3c, 1); g.fillCircle(12, 28, 13); g.fillCircle(34, 28, 13);
    g.fillStyle(0x1b5e20, 1); g.fillCircle(28, 18, 8);
    g.generateTexture('tree', 46, 72);
    g.clear();

    // Hedge.
    g.fillStyle(0x2e7d32, 1); g.fillRect(0, 4, 64, 28);
    g.fillStyle(0x43a047, 1);
    for (let x = 0; x < 64; x += 8) g.fillCircle(x + 4, 4, 6);
    g.fillStyle(0x1b5e20, 1);
    for (let x = 2; x < 64; x += 6) g.fillRect(x, 14, 1, 4);
    g.lineStyle(1, 0x000000, 0.15); g.strokeRect(0, 4, 64, 28);
    g.generateTexture('hedge', 64, 32);
    g.clear();

    // Smoke puff.
    g.fillStyle(0xffffff, 1); g.fillCircle(8, 8, 7);
    g.fillStyle(0xeeeeee, 1); g.fillCircle(5, 6, 4); g.fillCircle(12, 9, 4);
    g.generateTexture('smoke', 16, 16);
    g.clear();

    g.destroy();

    this._buildSchoolTexture();
    this._buildPlaygroundTexture();
    this._buildNasaTexture();
    this._buildRocketTextures();
    this._buildBasaltWallsTexture();
    this._buildSakaryaBridgeTexture();
    this._buildPlanetsBannerTexture();
    this._buildGraduationTextures();
  }

  _buildGraduationTextures() {
    // ----- Gown (96x96, transparent) -----
    const gown = this.textures.createCanvas('gown', 96, 96);
    const gx = gown.getContext();
    // Robe body — black with subtle highlight, V-neck open at top
    gx.fillStyle = '#1b1b1b';
    // Left half
    gx.beginPath();
    gx.moveTo(48, 22);   // neck top
    gx.lineTo(20, 32);   // left shoulder
    gx.lineTo(8,  60);   // sleeve cuff out
    gx.lineTo(18, 64);   // sleeve cuff in
    gx.lineTo(28, 50);   // armpit
    gx.lineTo(28, 88);   // hem left
    gx.lineTo(48, 90);   // hem center
    gx.closePath(); gx.fill();
    // Right half (mirror)
    gx.beginPath();
    gx.moveTo(48, 22);
    gx.lineTo(76, 32);
    gx.lineTo(88, 60);
    gx.lineTo(78, 64);
    gx.lineTo(68, 50);
    gx.lineTo(68, 88);
    gx.lineTo(48, 90);
    gx.closePath(); gx.fill();
    // Subtle vertical seam shading
    gx.strokeStyle = 'rgba(255,255,255,0.08)';
    gx.lineWidth = 1;
    gx.beginPath(); gx.moveTo(48, 26); gx.lineTo(48, 90); gx.stroke();
    // Sleeve cuff trim
    gx.strokeStyle = '#ffd54f'; gx.lineWidth = 2;
    gx.beginPath(); gx.moveTo(8, 60);  gx.lineTo(18, 64); gx.stroke();
    gx.beginPath(); gx.moveTo(88, 60); gx.lineTo(78, 64); gx.stroke();
    // Hood / stole — red strip down each side of the V-neck
    gx.fillStyle = '#c62828';
    gx.beginPath();
    gx.moveTo(40, 24); gx.lineTo(46, 22); gx.lineTo(46, 70); gx.lineTo(38, 70);
    gx.closePath(); gx.fill();
    gx.beginPath();
    gx.moveTo(56, 24); gx.lineTo(50, 22); gx.lineTo(50, 70); gx.lineTo(58, 70);
    gx.closePath(); gx.fill();
    // Hood trim (yellow)
    gx.strokeStyle = '#ffd54f'; gx.lineWidth = 1.5;
    gx.beginPath(); gx.moveTo(38, 70); gx.lineTo(46, 70); gx.stroke();
    gx.beginPath(); gx.moveTo(50, 70); gx.lineTo(58, 70); gx.stroke();
    gown.refresh();

    // ----- Cap (mortarboard) 96x48, transparent -----
    const cap = this.textures.createCanvas('cap', 96, 48);
    const cx = cap.getContext();
    // Cap base (rounded rectangle hugging the head)
    cx.fillStyle = '#111';
    this._roundRect(cx, 22, 26, 52, 16, 6); cx.fill();
    // Mortarboard (square top, slight perspective)
    cx.fillStyle = '#000';
    cx.beginPath();
    cx.moveTo(8, 22);
    cx.lineTo(48, 8);
    cx.lineTo(88, 22);
    cx.lineTo(48, 32);
    cx.closePath(); cx.fill();
    // Top edge highlight
    cx.strokeStyle = 'rgba(255,255,255,0.18)'; cx.lineWidth = 1;
    cx.beginPath();
    cx.moveTo(8, 22); cx.lineTo(48, 8); cx.lineTo(88, 22);
    cx.stroke();
    // Tassel button (center of board)
    cx.fillStyle = '#ffd54f';
    cx.beginPath(); cx.arc(48, 18, 2.4, 0, Math.PI * 2); cx.fill();
    // Tassel string trailing to right edge then hanging
    cx.strokeStyle = '#ffd54f'; cx.lineWidth = 1.6;
    cx.beginPath();
    cx.moveTo(48, 18);
    cx.quadraticCurveTo(70, 14, 80, 22);
    cx.lineTo(80, 38);
    cx.stroke();
    // Tassel pom
    cx.fillStyle = '#ffb300';
    cx.beginPath(); cx.arc(80, 42, 4, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = '#ffd54f';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      cx.fillRect(80 + Math.cos(a) * 3 - 0.5, 42 + Math.sin(a) * 3 - 0.5, 1, 3);
    }
    cap.refresh();
  }

  _buildPlanetsBannerTexture() {
    const W = 320, H = 160;
    const tex = this.textures.createCanvas('planets-banner', W, H);
    const ctx = tex.getContext();

    // Posts
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(8, 30, 6, H - 30);
    ctx.fillRect(W - 14, 30, 6, H - 30);

    // Board background (deep space gradient)
    const grad = ctx.createLinearGradient(0, 36, 0, H - 6);
    grad.addColorStop(0, '#0d1b3d');
    grad.addColorStop(1, '#1a237e');
    ctx.fillStyle = grad;
    this._roundRect(ctx, 14, 30, W - 28, H - 36, 10); ctx.fill();
    ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 3;
    this._roundRect(ctx, 14, 30, W - 28, H - 36, 10); ctx.stroke();

    // Stars
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      const x = 22 + Math.random() * (W - 44);
      const y = 38 + Math.random() * (H - 50);
      const r = Math.random() < 0.85 ? 1 : 1.6;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Title
    ctx.fillStyle = '#ffeb3b';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('GEZEGENLER', W / 2, 56);
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('SINIFI', W / 2, 78);

    // Sun
    const sunX = 40, sunY = H - 36;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 14);
    sunGrad.addColorStop(0, '#fff59d');
    sunGrad.addColorStop(1, '#fb8c00');
    ctx.fillStyle = sunGrad;
    ctx.beginPath(); ctx.arc(sunX, sunY, 12, 0, Math.PI * 2); ctx.fill();

    // Tiny planets along the bottom (Mercury → Neptune)
    const planets = [
      { c: '#bdbdbd', r: 3 },
      { c: '#f4a259', r: 4 },
      { c: '#4fc3f7', r: 4.5 },
      { c: '#e57373', r: 3.5 },
      { c: '#ffb74d', r: 7, ring: true },
      { c: '#ffe082', r: 6, ring: true },
      { c: '#80deea', r: 5 },
      { c: '#5c6bc0', r: 5 },
    ];
    let px = 70;
    planets.forEach((p) => {
      px += p.r + 8;
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(px, sunY, p.r, 0, Math.PI * 2); ctx.fill();
      if (p.ring) {
        ctx.strokeStyle = '#fff8e1'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(px, sunY, p.r + 4, 1.6, 0.4, 0, Math.PI * 2); ctx.stroke();
      }
      px += p.r;
    });

    tex.refresh();
  }

  _buildBalloonTexture(g, key, mainColor, highlightColor, knotColor) {
    g.fillStyle(mainColor, 1); g.fillCircle(20, 20, 18);
    g.fillStyle(highlightColor, 0.9); g.fillCircle(13, 13, 5);
    g.fillStyle(0xffffff, 0.55); g.fillCircle(11, 11, 2);
    g.fillStyle(knotColor, 1); g.fillTriangle(16, 36, 24, 36, 20, 42);
    g.generateTexture(key, 40, 44);
    g.clear();
  }

  // ----- Player body (sweater + pants + crocs) ---------------------------

  _buildPlayerBodyTexture() {
    const W = 96, H = 96;
    const tex = this.textures.createCanvas('playerBody', W, H);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;

    // Neck
    ctx.fillStyle = '#d8a37c';
    ctx.fillRect(cx - 8, 0, 16, 10);

    // Sweater
    ctx.fillStyle = '#f6f1e3';
    this._roundRect(ctx, cx - 24, 8, 48, 40, 9); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(cx - 24, 42, 48, 6);
    // Sleeves
    ctx.fillStyle = '#f6f1e3';
    this._roundRect(ctx, cx - 34, 12, 12, 28, 5); ctx.fill();
    this._roundRect(ctx, cx + 22, 12, 12, 28, 5); ctx.fill();
    // Hands
    ctx.fillStyle = '#f4c8a0';
    ctx.beginPath(); ctx.arc(cx - 28, 40, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 28, 40, 5, 0, Math.PI * 2); ctx.fill();

    // Pants (brown)
    const pantsY = 48;
    ctx.fillStyle = '#9a6536';
    ctx.fillRect(cx - 24, pantsY, 48, 24);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(cx - 1, pantsY, 2, 24);
    ctx.fillStyle = '#7d4f25';
    ctx.fillRect(cx - 24, pantsY + 20, 22, 4);
    ctx.fillRect(cx + 2, pantsY + 20, 22, 4);

    // Crocs (blue)
    const shoeY = pantsY + 24;
    ctx.fillStyle = '#1f5fae';
    ctx.beginPath(); ctx.ellipse(cx - 14, shoeY + 4, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 14, shoeY + 4, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#163f78';
    ctx.fillRect(cx - 26, shoeY + 5, 24, 2);
    ctx.fillRect(cx + 2, shoeY + 5, 24, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = -3; i <= 3; i += 2) {
      ctx.beginPath(); ctx.arc(cx - 14 + i * 2, shoeY + 2, 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 14 + i * 2, shoeY + 2, 0.7, 0, Math.PI * 2); ctx.fill();
    }

    tex.refresh();
  }

  // ----- Fallback drawn face (used only if assets/face.png missing) ------

  _buildPlayerFaceTexture() {
    const W = 96, H = 96;
    const tex = this.textures.createCanvas('playerFace', W, H);
    const ctx = tex.getContext();
    const cx = W / 2, headY = H / 2;
    const headRX = 36, headRY = 40;

    const skinGrad = ctx.createRadialGradient(cx - 8, headY - 6, 6, cx, headY, headRX + 4);
    skinGrad.addColorStop(0, '#fde0c2');
    skinGrad.addColorStop(0.55, '#f4c8a0');
    skinGrad.addColorStop(1, '#c98e64');
    ctx.fillStyle = skinGrad;
    ctx.beginPath(); ctx.ellipse(cx, headY, headRX, headRY, 0, 0, Math.PI * 2); ctx.fill();

    // Hair
    ctx.fillStyle = '#3a1f10';
    ctx.beginPath();
    ctx.moveTo(cx - headRX + 2, headY - 4);
    ctx.bezierCurveTo(cx - 30, headY - headRY - 16, cx + 30, headY - headRY - 16, cx + headRX - 2, headY - 4);
    ctx.bezierCurveTo(cx + headRX - 6, headY - 18, cx - headRX + 6, headY - 18, cx - headRX + 2, headY - 4);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#fbfbf6';
    ctx.beginPath(); ctx.ellipse(cx - 12, headY + 1, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 12, headY + 1, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5b3a1c';
    ctx.beginPath(); ctx.arc(cx - 12, headY + 1, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 12, headY + 1, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0604';
    ctx.beginPath(); ctx.arc(cx - 12, headY + 1, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 12, headY + 1, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx - 11, headY, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 13, headY, 0.9, 0, Math.PI * 2); ctx.fill();

    // Eyebrows
    ctx.fillStyle = '#2a1608';
    ctx.beginPath(); ctx.ellipse(cx - 12, headY - 6, 7, 2.2, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 12, headY - 6, 7, 2.2, 0.15, 0, Math.PI * 2); ctx.fill();

    // Nose
    ctx.strokeStyle = 'rgba(140,90,55,0.55)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - 2, headY + 4);
    ctx.quadraticCurveTo(cx - 4, headY + 12, cx - 1, headY + 14);
    ctx.lineTo(cx + 3, headY + 14);
    ctx.stroke();

    // Smile
    ctx.strokeStyle = '#7a3a18'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - 8, headY + 21);
    ctx.quadraticCurveTo(cx, headY + 26, cx + 8, headY + 21);
    ctx.stroke();

    // Cheeks
    ctx.fillStyle = 'rgba(240,140,130,0.45)';
    ctx.beginPath(); ctx.ellipse(cx - 18, headY + 10, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 18, headY + 10, 5, 3, 0, 0, Math.PI * 2); ctx.fill();

    tex.refresh();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- Güzide school texture --------------------------------------------

  _buildSchoolTexture() {
    const SW = 420, SH = 280;
    const tex = this.textures.createCanvas('school', SW, SH);
    const ctx = tex.getContext();
    const TEAL = '#1ec3c3', TEAL_DK = '#149a9a', BLACK = '#1a1a1a';
    const WALL = '#efe4d2', ROOF_DK = '#2b2b2b';

    ctx.fillStyle = WALL; ctx.fillRect(0, 90, SW, SH - 90);
    ctx.strokeStyle = '#d6c8ad'; ctx.lineWidth = 1;
    for (let y = 110; y < SH; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SW, y); ctx.stroke();
    }
    ctx.fillStyle = ROOF_DK;
    ctx.beginPath();
    ctx.moveTo(40, 100); ctx.lineTo(SW - 40, 100); ctx.lineTo(SW / 2, 10);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = TEAL; ctx.fillRect(40, 100, SW - 80, 6);
    ctx.fillStyle = TEAL_DK; ctx.fillRect(40, 106, SW - 80, 2);
    ctx.fillStyle = TEAL;
    ctx.fillRect(60, 108, 28, SH - 108);
    ctx.fillRect(SW - 88, 108, 28, SH - 108);
    ctx.fillStyle = TEAL_DK;
    ctx.fillRect(60, SH - 30, 28, 30);
    ctx.fillRect(SW - 88, SH - 30, 28, 30);
    ctx.fillStyle = BLACK;
    ctx.fillRect(56, 104, 36, 8);
    ctx.fillRect(SW - 92, 104, 36, 8);
    ctx.fillStyle = BLACK;
    ctx.fillRect(88, 108, SW - 176, 70);

    const cx = SW / 2, cy = 142;
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(cx, cy, 100, 35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = TEAL; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, 100, 35, 0, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = '#33d6d6'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx - 40, cy - 18);
    ctx.quadraticCurveTo(cx, cy - 28, cx + 40, cy - 18); ctx.stroke();
    ctx.fillStyle = '#33d6d6';
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const lx = cx + i * 10;
      ctx.beginPath(); ctx.ellipse(lx, cy - 16, 2.2, 5, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(lx + 2, cy - 22, 2.2, 5, -0.4, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = '#f0f0f0';
    ctx.font = 'bold 22px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('GÜZİDE', cx, cy + 2);
    ctx.fillStyle = '#bdbdbd';
    ctx.font = '8px sans-serif';
    ctx.fillText('7/24 BEBEK & ÇOCUK BAKIMEVİ', cx, cy + 18);

    ctx.fillStyle = ROOF_DK;
    ctx.beginPath();
    ctx.moveTo(SW - 110, 130); ctx.lineTo(SW - 20, 130); ctx.lineTo(SW - 65, 80);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(SW - 110, 130, 90, 60);
    ctx.fillStyle = TEAL; ctx.fillRect(SW - 110, 130, 90, 4);
    ctx.fillStyle = '#88c2cc'; ctx.fillRect(SW - 90, 150, 50, 28);
    ctx.strokeStyle = BLACK; ctx.lineWidth = 2; ctx.strokeRect(SW - 90, 150, 50, 28);
    ctx.beginPath(); ctx.moveTo(SW - 65, 150); ctx.lineTo(SW - 65, 178); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(SW - 90, 164); ctx.lineTo(SW - 40, 164); ctx.stroke();

    const gateX = 88, gateY = SH - 90, gateW = SW - 176, gateH = 90;
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(gateX, gateY, gateW, gateH);
    ctx.strokeStyle = TEAL_DK; ctx.lineWidth = 1;
    for (let x = gateX + 6; x < gateX + gateW; x += 10) {
      ctx.beginPath(); ctx.moveTo(x, gateY + 4); ctx.lineTo(x, gateY + gateH - 4); ctx.stroke();
    }
    ctx.strokeStyle = TEAL; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, gateY + 6, gateW / 2 - 10, Math.PI, 0, false); ctx.stroke();

    ctx.fillStyle = TEAL;
    ctx.fillRect(64, 180, 20, 20);
    ctx.fillRect(SW - 84, 180, 20, 20);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GEBZE', 74, 190);
    ctx.fillText('GEBZE', SW - 74, 190);

    tex.refresh();
  }

  _buildPlaygroundTexture() {
    const W = 280, H = 200;
    const tex = this.textures.createCanvas('playground', W, H);
    const ctx = tex.getContext();

    ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(20, H - 4); ctx.lineTo(70, 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(120, H - 4); ctx.lineTo(70, 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40, H - 4); ctx.lineTo(70, 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(70, 30); ctx.lineTo(170, 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(120, H - 4); ctx.lineTo(170, 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(220, H - 4); ctx.lineTo(170, 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(200, H - 4); ctx.lineTo(170, 30); ctx.stroke();
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(95, 32); ctx.lineTo(90, 110); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(115, 32); ctx.lineTo(120, 110); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(145, 32); ctx.lineTo(150, 105); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(165, 32); ctx.lineTo(170, 105); ctx.stroke();
    ctx.fillStyle = '#fbc02d'; ctx.fillRect(82, 110, 36, 6);
    ctx.fillStyle = '#1976d2'; ctx.fillRect(142, 105, 36, 6);

    ctx.strokeStyle = '#37474f'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(232, H - 4); ctx.lineTo(232, 70); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(252, H - 4); ctx.lineTo(252, 70); ctx.stroke();
    ctx.lineWidth = 2;
    for (let y = 90; y < H - 4; y += 18) {
      ctx.beginPath(); ctx.moveTo(232, y); ctx.lineTo(252, y); ctx.stroke();
    }
    ctx.fillStyle = '#fbc02d'; ctx.fillRect(228, 64, 32, 8);
    ctx.strokeStyle = '#e53935'; ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(258, 70);
    ctx.quadraticCurveTo(280, 130, 270, H - 4);
    ctx.stroke();
    ctx.strokeStyle = '#ff8a80'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(258, 70);
    ctx.quadraticCurveTo(280, 130, 270, H - 4);
    ctx.stroke();
    ctx.fillStyle = '#e6c98f';
    ctx.fillRect(180, H - 20, 50, 16);
    ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 2;
    ctx.strokeRect(180, H - 20, 50, 16);

    tex.refresh();
  }

  _buildNasaTexture() {
    const W = 360, H = 220;
    const tex = this.textures.createCanvas('nasa', W, H);
    const ctx = tex.getContext();

    ctx.fillStyle = '#cfd8dc'; ctx.fillRect(0, 40, W, H - 40);
    ctx.fillStyle = '#90a4ae'; ctx.fillRect(0, 40, W, 10);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 12; col++) {
        const x = 14 + col * 28, y = 60 + row * 28;
        const grad = ctx.createLinearGradient(x, y, x, y + 18);
        grad.addColorStop(0, '#82b1d8');
        grad.addColorStop(1, '#3a6ea5');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, 22, 18);
        ctx.strokeStyle = '#37474f'; ctx.lineWidth = 1;
        ctx.strokeRect(x, y, 22, 18);
      }
    }
    ctx.fillStyle = '#263238'; ctx.fillRect(W / 2 - 28, H - 50, 56, 50);
    ctx.fillStyle = '#90caf9'; ctx.fillRect(W / 2 - 24, H - 46, 22, 42);
    ctx.fillStyle = '#90caf9'; ctx.fillRect(W / 2 + 2, H - 46, 22, 42);

    const lx = W / 2, ly = 22;
    ctx.fillStyle = '#0b3d91';
    ctx.beginPath(); ctx.arc(lx, ly, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(lx + Math.cos(a) * 10, ly + Math.sin(a) * 10, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#fc3d21'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx - 14, ly + 4);
    ctx.quadraticCurveTo(lx, ly - 6, lx + 14, ly + 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(lx, ly, 16, 5, -0.4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#0b3d91';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('NASA', lx + 70, ly + 2);

    ctx.fillStyle = '#0b3d91';
    ctx.fillRect(W / 2 - 60, H - 64, 120, 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('SPACE CENTER', W / 2, H - 57);

    tex.refresh();
  }

  _buildRocketTextures() {
    const RW = 40, RH = 96;
    const rt = this.textures.createCanvas('rocket', RW, RH);
    const rc = rt.getContext();
    rc.fillStyle = '#e53935';
    rc.beginPath();
    rc.moveTo(RW / 2, 0); rc.lineTo(RW - 8, 22); rc.lineTo(8, 22); rc.closePath(); rc.fill();
    const bodyGrad = rc.createLinearGradient(0, 0, RW, 0);
    bodyGrad.addColorStop(0, '#bdbdbd');
    bodyGrad.addColorStop(0.5, '#fafafa');
    bodyGrad.addColorStop(1, '#9e9e9e');
    rc.fillStyle = bodyGrad;
    rc.fillRect(8, 22, RW - 16, RH - 36);
    rc.fillStyle = '#0b3d91';
    rc.beginPath(); rc.arc(RW / 2, 36, 5, 0, Math.PI * 2); rc.fill();
    rc.fillStyle = '#fff';
    rc.beginPath(); rc.arc(RW / 2 - 2, 34, 1.5, 0, Math.PI * 2); rc.fill();
    rc.fillStyle = '#e53935'; rc.fillRect(8, 50, RW - 16, 4);
    rc.fillStyle = '#fff';     rc.fillRect(8, 54, RW - 16, 4);
    rc.fillStyle = '#e53935';
    rc.beginPath();
    rc.moveTo(8, RH - 14); rc.lineTo(0, RH - 4); rc.lineTo(8, RH - 4); rc.closePath(); rc.fill();
    rc.beginPath();
    rc.moveTo(RW - 8, RH - 14); rc.lineTo(RW, RH - 4); rc.lineTo(RW - 8, RH - 4); rc.closePath(); rc.fill();
    rc.fillStyle = '#424242'; rc.fillRect(12, RH - 14, RW - 24, 10);
    rt.refresh();

    const FW = 26, FH = 50;
    const ft = this.textures.createCanvas('flame', FW, FH);
    const fc = ft.getContext();
    const fg = fc.createLinearGradient(0, 0, 0, FH);
    fg.addColorStop(0, '#ffffff');
    fg.addColorStop(0.3, '#ffeb3b');
    fg.addColorStop(0.7, '#ff9800');
    fg.addColorStop(1, 'rgba(244,67,54,0)');
    fc.fillStyle = fg;
    fc.beginPath();
    fc.moveTo(FW / 2, 0);
    fc.quadraticCurveTo(FW, FH * 0.5, FW / 2, FH);
    fc.quadraticCurveTo(0, FH * 0.5, FW / 2, 0);
    fc.fill();
    ft.refresh();

    const PW = 80, PH = 140;
    const pt = this.textures.createCanvas('launchpad', PW, PH);
    const pc = pt.getContext();
    pc.strokeStyle = '#ff9800'; pc.lineWidth = 3;
    pc.beginPath(); pc.moveTo(10, PH); pc.lineTo(15, 6); pc.stroke();
    pc.beginPath(); pc.moveTo(70, PH); pc.lineTo(65, 6); pc.stroke();
    pc.lineWidth = 2;
    for (let y = 20; y < PH; y += 20) {
      pc.beginPath(); pc.moveTo(10 + (y / PH) * 5, y); pc.lineTo(70 - (y / PH) * 5, y); pc.stroke();
    }
    for (let y = 20; y < PH - 20; y += 40) {
      pc.beginPath(); pc.moveTo(15, y); pc.lineTo(65, y + 40); pc.stroke();
      pc.beginPath(); pc.moveTo(65, y); pc.lineTo(15, y + 40); pc.stroke();
    }
    pc.fillStyle = '#9e9e9e'; pc.fillRect(0, PH - 12, PW, 12);
    pt.refresh();
  }

  _buildSignTexture(name, label, color) {
    const W = 180, H = 90;
    const tex = this.textures.createCanvas(name, W, H);
    const ctx = tex.getContext();
    ctx.fillStyle = '#5d4037'; ctx.fillRect(W / 2 - 4, 36, 8, H - 36);
    ctx.fillStyle = color;
    this._roundRect(ctx, 10, 6, W - 20, 44, 8); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    this._roundRect(ctx, 14, 10, W - 28, 36, 6); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, W / 2, 28);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(W - 18, 28); ctx.lineTo(W - 8, 22); ctx.lineTo(W - 8, 34);
    ctx.closePath(); ctx.fill();
    tex.refresh();
  }

  _buildBasaltWallsTexture() {
    const W = 480, H = 110;
    const tex = this.textures.createCanvas('basalt-walls', W, H);
    const ctx = tex.getContext();
    ctx.fillStyle = '#2c2c34';
    ctx.fillRect(0, 30, W, H - 30);
    ctx.fillStyle = '#2c2c34';
    for (let x = 0; x < W; x += 24) ctx.fillRect(x, 18, 14, 14);
    for (const tx of [40, 200, 360, 440]) {
      ctx.fillRect(tx - 18, 0, 36, H);
      ctx.fillStyle = '#1c1c22';
      ctx.fillRect(tx - 18, 0, 36, 6);
      ctx.fillStyle = '#2c2c34';
      for (let i = 0; i < 4; i++) ctx.fillRect(tx - 16 + i * 9, -6, 6, 12);
      ctx.fillStyle = '#0a0a0d';
      ctx.fillRect(tx - 2, 30, 4, 16);
      ctx.fillRect(tx - 2, 60, 4, 16);
      ctx.fillStyle = '#2c2c34';
    }
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let i = 0; i < 200; i++) {
      ctx.fillRect(Math.random() * W, 30 + Math.random() * (H - 30), 2, 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 30, W, 2);
    tex.refresh();
  }

  _buildSakaryaBridgeTexture() {
    // Sakarya river + the historic Justinian Bridge (Beşköprü):
    // a long stone bridge with multiple semicircular arches over a blue river.
    const W = 480, H = 160;
    const tex = this.textures.createCanvas('sakarya-bridge', W, H);
    const ctx = tex.getContext();

    // River strip across the bottom (with a sky-coloured cutout above water
    // line so it blends nicely into the world background).
    const waterTop = H - 40;
    const grad = ctx.createLinearGradient(0, waterTop, 0, H);
    grad.addColorStop(0, '#4fc3f7');
    grad.addColorStop(1, '#1565c0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, waterTop, W, H - waterTop);

    // Soft river ripples
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      const y = waterTop + 6 + i * 3;
      ctx.beginPath();
      for (let x = 0; x < W; x += 16) ctx.lineTo(x, y + (i % 2 ? 1 : -1));
      ctx.stroke();
    }

    // Bridge geometry
    const deckTop = waterTop - 56;     // top of bridge deck
    const deckBot = waterTop - 36;     // bottom of bridge deck (above water)
    const archCount = 5;
    const padX = 24;
    const span = (W - padX * 2) / archCount;
    const archR = span * 0.42;

    // Bridge deck base (light beige stone)
    ctx.fillStyle = '#d7ccb2';
    ctx.fillRect(padX - 8, deckTop, W - padX * 2 + 16, deckBot - deckTop);

    // Stone deck blocks (subtle outlines)
    ctx.strokeStyle = 'rgba(80,60,40,0.35)';
    ctx.lineWidth = 1;
    for (let x = padX - 8; x < W - padX + 8; x += 22) {
      ctx.beginPath(); ctx.moveTo(x, deckTop); ctx.lineTo(x, deckBot); ctx.stroke();
    }
    // Top trim line
    ctx.strokeStyle = 'rgba(80,60,40,0.55)';
    ctx.beginPath(); ctx.moveTo(padX - 8, deckTop); ctx.lineTo(W - padX + 8, deckTop); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padX - 8, deckTop + 4); ctx.lineTo(W - padX + 8, deckTop + 4); ctx.stroke();

    // Piers + arches
    for (let i = 0; i < archCount; i++) {
      const cx = padX + span * (i + 0.5);
      // Pier (rectangle from deckBot to water)
      ctx.fillStyle = '#bfa882';
      ctx.fillRect(cx - archR - 6, deckBot, 12, waterTop - deckBot);
      // Pier shadow
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(cx - archR - 6 + 8, deckBot, 4, waterTop - deckBot);

      // Arch opening (semicircle revealing sky-blue background)
      ctx.fillStyle = '#7fb6e8';
      ctx.beginPath();
      ctx.arc(cx, deckBot, archR, Math.PI, 2 * Math.PI);
      ctx.rect(cx - archR, deckBot, archR * 2, 0);
      ctx.fill();

      // Voussoir outline (dark arc) gives the stone arch look
      ctx.strokeStyle = 'rgba(80,60,40,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, deckBot, archR, Math.PI, 2 * Math.PI);
      ctx.stroke();

      // Reflection of arch in water
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(cx, waterTop + 2, archR * 0.85, 0, Math.PI);
      ctx.fill();
    }
    // End piers (left + right abutments)
    ctx.fillStyle = '#bfa882';
    ctx.fillRect(padX - 14, deckBot, 8, waterTop - deckBot);
    ctx.fillRect(W - padX + 6, deckBot, 8, waterTop - deckBot);

    // Railing posts on top of the deck
    ctx.fillStyle = '#a8916a';
    for (let x = padX; x < W - padX; x += 28) {
      ctx.fillRect(x, deckTop - 8, 4, 8);
    }
    // Railing rail
    ctx.fillRect(padX, deckTop - 4, W - padX * 2, 2);

    tex.refresh();
  }

  // ---- Background construction -----------------------------------------

  _createSky(viewW, viewH) {
    const tex = this.textures.createCanvas('sky', Math.ceil(viewW), Math.ceil(viewH));
    const ctx = tex.getContext();
    const grad = ctx.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, '#3a7bd5');
    grad.addColorStop(0.55, '#7fb6e8');
    grad.addColorStop(1, '#dff0fb');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);
    tex.refresh();
    this.add.image(0, 0, 'sky').setOrigin(0, 0).setScrollFactor(0).setDepth(-100);
  }

  _createClouds(worldWidth, viewH) {
    const count = Math.ceil(worldWidth / 280);
    for (let i = 0; i < count; i++) {
      const x = i * 280 + Phaser.Math.Between(0, 140);
      const y = Phaser.Math.Between(40, Math.max(80, viewH * 0.35));
      this.add.image(x, y, 'cloud').setScrollFactor(0.2).setAlpha(0.95).setDepth(-90);
    }
  }

  _createHills(worldWidth, groundY) {
    const count = Math.ceil(worldWidth / 380) + 1;
    for (let i = 0; i < count; i++) {
      const x = i * 380 + Phaser.Math.Between(-40, 40);
      this.add.image(x, groundY - 10, 'hill')
        .setOrigin(0, 1).setScrollFactor(0.4)
        .setTint(0xa5d6a7).setDepth(-80);
    }
  }

  _createCityWall(worldWidth, groundY) {
    const tileW = 480;
    const startX = worldWidth * 0.5;
    const endX = worldWidth * 0.95;
    for (let x = startX; x < endX; x += tileW - 20) {
      this.add.image(x, groundY - 4, 'basalt-walls')
        .setOrigin(0, 1).setScrollFactor(0.55).setDepth(-70);
    }
  }

  _createSchool(worldWidth, _g) {
    const groundY = this.groundY;
    this.add.image(worldWidth * 0.18, groundY, 'school')
      .setOrigin(0.5, 1).setScrollFactor(0.7).setDepth(-50)
      .setScale(1.1);
    this.add.image(worldWidth * 0.55, groundY, 'school')
      .setOrigin(0.5, 1).setScrollFactor(0.7)
      .setScale(0.8).setTint(0xe8f5e9).setDepth(-50);
    [worldWidth * 0.18, worldWidth * 0.55].forEach((sx) => {
      for (let x = sx - 240; x <= sx + 240; x += 64) {
        this.add.image(x, groundY, 'hedge').setOrigin(0.5, 1).setScrollFactor(0.85).setDepth(-30);
      }
    });
  }

  _createPlanetsClassroom(worldWidth, groundY) {
    // "Gezegenler Sınıfı" banner standing in the school yard.
    const x = worldWidth * 0.235;
    this.add.image(x, groundY, 'planets-banner')
      .setOrigin(0.5, 1).setScrollFactor(0.7).setDepth(-48);
  }

  _createPlayground(worldWidth, groundY) {
    [worldWidth * 0.30, worldWidth * 0.72].forEach((px) => {
      this.add.image(px, groundY, 'playground')
        .setOrigin(0.5, 1).setScrollFactor(0.85).setDepth(-25);
    });
  }

  _createNasa(worldWidth, groundY) {
    const nx = worldWidth * 0.45;
    this.add.image(nx, groundY, 'nasa')
      .setOrigin(0.5, 1).setScrollFactor(0.6).setDepth(-55);
    const padX = nx + 200;
    // World-x past which the player has "graduated" (cap + gown appear).
    this._graduateAtX = padX + 80;
    this.add.image(padX, groundY, 'launchpad')
      .setOrigin(0.5, 1).setScrollFactor(0.6).setDepth(-54);
    const rocketImg = this.add.image(padX, groundY - 12, 'rocket')
      .setOrigin(0.5, 1).setScrollFactor(0.6).setDepth(-53);
    const flameImg = this.add.image(padX, groundY - 12, 'flame')
      .setOrigin(0.5, 0).setScrollFactor(0.6).setDepth(-53).setVisible(false);
    this.rocket = {
      body: rocketImg, flame: flameImg,
      startY: groundY - 12, vy: 0, launching: false,
    };
  }

  _createSakaryaBridge(worldWidth, groundY) {
    // Historic Sakarya river crossing: a long blue river strip with the
    // multi-arched stone Justinian Bridge (Beşköprü) sitting on top.
    const cx = worldWidth * 0.40;
    // Place the bridge image so its bottom rests on the ground line.
    this.add.image(cx, groundY, 'sakarya-bridge')
      .setOrigin(0.5, 1).setScrollFactor(0.85).setDepth(-22);
  }

  _createTrees(worldWidth, groundY) {
    const spacing = 220;
    for (let x = 80; x < worldWidth - 80; x += spacing) {
      const jitter = Phaser.Math.Between(-30, 30);
      this.add.image(x + jitter, groundY, 'tree')
        .setOrigin(0.5, 1).setScrollFactor(0.9).setDepth(-20);
    }
  }
}
