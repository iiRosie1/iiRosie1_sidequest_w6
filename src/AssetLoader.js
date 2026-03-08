// src/AssetLoader.js
// Asset loading (SYSTEM layer).
//
// Responsibilities:
// - Load image assets (tiles, spritesheets, UI, backgrounds) during preload()
// - Build animation definitions from tuning.json (including "hold": true → Infinity)
// - Return a normalized assets bundle used by Game/Level/entities
//
// Non-goals:
// - Does NOT create sprites, groups, or physics bodies
// - Does NOT decide game rules or world state
// - Does NOT draw anything to the screen
//
// Architectural notes:
// - main.js calls loadAssets() in preload().
// - Keeping assets + animation definitions separate supports data-driven tuning.

export async function loadAssets(levelPkg, tuningDoc) {
  // ---- images ----
  // IMPORTANT:
  // loadImage() is "preload-safe" only if p5 is actually tracking it inside preload().
  // To make this robust even if your boot flow uses async/await, we wrap loadImage in a Promise.
  // Pink_Monster: build sprite sheet from separate strips (idle, run, jump, etc.)
  const monsterBase = "assets/monster/";
  const idleImg = await loadImageAsync(monsterBase + "Pink_Monster_Idle_4.png");
  const runImg = await loadImageAsync(monsterBase + "Pink_Monster_Run_6.png");
  const jumpImg = await loadImageAsync(monsterBase + "Pink_Monster_Jump_8.png");
  const attackImg = await loadImageAsync(monsterBase + "Pink_Monster_Attack1_4.png");
  const hurtImg = await loadImageAsync(monsterBase + "Pink_Monster_Hurt_4.png");
  const deathImg = await loadImageAsync(monsterBase + "Pink_Monster_Death_8.png");
  const playerImg = buildPinkMonsterSpriteSheet({
    idleImg,
    runImg,
    jumpImg,
    attackImg,
    hurtImg,
    deathImg,
  });
  // Dude_Monster: build sprite sheet for boar (run, throwPose, death)
  const dudeBase = "assets/3 Dude_Monster/";
  const dudeRunImg = await loadImageAsync(dudeBase + "Dude_Monster_Run_6.png");
  const dudeThrowImg = await loadImageAsync(dudeBase + "Dude_Monster_Throw_4.png");
  const dudeDeathImg = await loadImageAsync(dudeBase + "Dude_Monster_Death_8.png");
  const boarImg = buildDudeMonsterBoarSheet({
    runImg: dudeRunImg,
    throwImg: dudeThrowImg,
    deathImg: dudeDeathImg,
  });
  const leafImg = await loadImageAsync("assets/2 Owlet_Monster/Owlet_Monster_Idle_4.png");
  const fireImg = await loadImageAsync("assets/slime_purple.png");

  const groundTileImg = await loadImageAsync("assets/groundTile.png");
  const groundTileDeepImg = await loadImageAsync("assets/groundTileDeep.png");
  const platformLCImg = await loadImageAsync("assets/platformLC.png");
  const platformRCImg = await loadImageAsync("assets/platformRC.png");
  const wallLImg = await loadImageAsync("assets/wallL.png");
  const wallRImg = await loadImageAsync("assets/wallR.png");

  const fontImg = await loadImageAsync("assets/bitmapFont.png");

  // Backgrounds (keys should match levels.json parallaxLayers[].key)
  // If levelPkg provides a parallax layer list with { key, src }, prefer that.
  // Otherwise fall back to the default 3-layer set.
  const backgrounds = await loadBackgrounds(levelPkg);

  // ---- anis ----
  // Pink_Monster: row/frames match the built sprite sheet
  let playerAnis = buildAnis(tuningDoc?.player?.animations, defaultPinkMonsterPlayerAnis(), {
    spriteSheet: playerImg,
  });

  let boarAnis = buildAnis(tuningDoc?.boar?.animations, defaultDudeMonsterBoarAnis(), {
    spriteSheet: boarImg,
  });

  // If tuning.json uses per-animation "img" fields (strings), preload them here and replace with p5.Images.
  // This prevents runtime XHRs and avoids /undefined crashes.
  playerAnis = await resolveAniImages(playerAnis, "player");
  boarAnis = await resolveAniImages(boarAnis, "boar");

  // Guard rails: fail early with a helpful message instead of crashing inside p5/p5play.
  validateAssets({
    playerImg,
    boarImg,
    leafImg,
    fireImg,
    groundTileImg,
    groundTileDeepImg,
    platformLCImg,
    platformRCImg,
    wallLImg,
    wallRImg,
    fontImg,
    backgrounds,
    playerAnis,
    boarAnis,
  });

  return {
    playerImg,
    boarImg,
    leafImg,
    fireImg,

    groundTileImg,
    groundTileDeepImg,
    platformLCImg,
    platformRCImg,
    wallLImg,
    wallRImg,

    fontImg,
    backgrounds,

    playerAnis,
    boarAnis,
  };
}

/**
 * Merge/normalize anis data:
 * - converts { hold:true } -> frameDelay: Infinity
 * - injects defaults (like spriteSheet) if not provided in tuning
 * - keeps other keys intact
 */
function buildAnis(tuningAnis, fallbackAnis, inject = {}) {
  const src = tuningAnis && typeof tuningAnis === "object" ? tuningAnis : fallbackAnis;
  const out = {};

  for (const [name, def] of Object.entries(src)) {
    // If tuning provides null/undefined for an animation by mistake, skip it safely.
    if (!def || typeof def !== "object") continue;

    const d = { ...inject, ...def };

    // JSON-safe "hold" -> Infinity
    if (d.hold === true) {
      d.frameDelay = Infinity;
      delete d.hold;
    }

    // If tuning accidentally sets img to undefined/empty, remove it so p5play doesn't loadImage(undefined).
    if ("img" in d && (d.img === undefined || d.img === null || d.img === "")) {
      delete d.img;
    }

    // If spriteSheet is missing, keep it missing (Level/Entity might set it),
    // BUT our loadAssets() injects spriteSheet by default for player/boar so it's usually present.
    out[name] = d;
  }

  return out;
}

// --- fallback anis (from your monolith) ---
function defaultPlayerAnis() {
  return {
    idle: { row: 0, frames: 4, frameDelay: 10 },
    run: { row: 1, frames: 4, frameDelay: 3 },
    jump: { row: 2, frames: 3, frameDelay: Infinity, frame: 0 },
    attack: { row: 3, frames: 6, frameDelay: 2 },
    hurtPose: { row: 5, frames: 4, frameDelay: Infinity },
    death: { row: 5, frames: 4, frameDelay: 16 },
  };
}

// Pink_Monster: row/frames match the built sprite sheet (Idle 4, Run 6, Jump 8, Attack 4, Hurt 4, Death 8)
function defaultPinkMonsterPlayerAnis() {
  return {
    idle: { row: 0, frames: 4, frameDelay: 10 },
    run: { row: 1, frames: 6, frameDelay: 3 },
    jump: { row: 2, frames: 8, frameDelay: Infinity, frame: 0 },
    attack: { row: 3, frames: 4, frameDelay: 2 },
    hurtPose: { row: 4, frames: 4, frameDelay: Infinity },
    death: { row: 5, frames: 8, frameDelay: 16 },
  };
}

/**
 * Build sprite sheet from Pink_Monster strips. Layout:
 * Row 0: idle (4) | 1: run (6) | 2: jump (8) | 3: attack (4) | 4: hurt (4) | 5: death (8)
 */
function buildPinkMonsterSpriteSheet(imgs) {
  const FW = 32;
  const FH = 32;
  const COLS = 8;
  const ROWS = 6;
  const pg = createGraphics(FW * COLS, FH * ROWS);
  pg.noSmooth();
  pg.drawingContext.imageSmoothingEnabled = false;

  const drawStrip = (img, row, frameCount) => {
    pg.image(img, 0, row * FH, FW * frameCount, FH);
  };

  drawStrip(imgs.idleImg, 0, 4);
  drawStrip(imgs.runImg, 1, 6);
  drawStrip(imgs.jumpImg, 2, 8);
  drawStrip(imgs.attackImg, 3, 4);
  drawStrip(imgs.hurtImg, 4, 4);
  drawStrip(imgs.deathImg, 5, 8);

  return pg.get();
}

function defaultBoarAnis() {
  return {
    run: { row: 1, frames: 4, frameDelay: 3 },
    throwPose: { row: 4, frames: 1, frameDelay: Infinity, frame: 0 },
    death: { row: 5, frames: 4, frameDelay: 16 },
  };
}

// Dude_Monster: boar sprite sheet layout (run 6, throwPose 1, death 8)
function defaultDudeMonsterBoarAnis() {
  return {
    run: { row: 0, frames: 6, frameDelay: 3 },
    throwPose: { row: 1, frames: 1, frameDelay: Infinity, frame: 0 },
    death: { row: 2, frames: 8, frameDelay: 16 },
  };
}

function buildDudeMonsterBoarSheet(imgs) {
  const FW = 32;
  const FH = 32;
  const COLS = 8;
  const ROWS = 3;
  const pg = createGraphics(FW * COLS, FH * ROWS);
  pg.noSmooth();
  pg.drawingContext.imageSmoothingEnabled = false;

  const drawStrip = (img, row, frameCount) => {
    pg.image(img, 0, row * FH, FW * frameCount, FH);
  };

  drawStrip(imgs.runImg, 0, 6);
  drawStrip(imgs.throwImg, 1, 4);
  drawStrip(imgs.deathImg, 2, 8);

  return pg.get();
}

// ------------------------
// helpers
// ------------------------

function loadImageAsync(path) {
  if (!path) {
    // This is the exact scenario that led to GET /undefined.
    throw new Error(`[AssetLoader] loadImageAsync called with invalid path: ${path}`);
  }
  return new Promise((resolve, reject) => {
    try {
      loadImage(
        path,
        (img) => resolve(img),
        (err) => reject(new Error(`[AssetLoader] Failed to load image "${path}": ${err}`)),
      );
    } catch (e) {
      reject(new Error(`[AssetLoader] loadImage("${path}") threw: ${e?.message ?? e}`));
    }
  });
}

async function loadBackgrounds(levelPkg) {
  // If levels.json supplies parallaxLayers with keys and sources, load them dynamically.
  // Expected shape (flexible):
  // levelPkg.parallaxLayers = [{ key:"bgFar", src:"assets/..." }, ...]
  // Your levels.json stores parallax in: level.view.parallax
  const layers = levelPkg?.level?.view?.parallax || levelPkg?.parallaxLayers;
  
  if (Array.isArray(layers) && layers.length > 0) {
    const bg = {};
    for (const layer of layers) {
      const key = layer?.key;
      const src = layer?.src || layer?.path || layer?.img;
      if (!key) continue;

      // If src is missing, keep it undefined but DON'T crash here;
      // validation will catch it with a clean error.
      bg[key] = src ? await loadImageAsync(src) : undefined;
    }
    return bg;
  }

  // Default fallback set
  return {
    bgFar: await loadImageAsync("assets/back.jpg"),
    bgMid: await loadImageAsync("assets/middle.jpg"),
    bgFore: await loadImageAsync("assets/front.jpg"),
  };
}

async function resolveAniImages(anis, label = "entity") {
  if (!anis || typeof anis !== "object") return anis;

  // If tuning uses { img: "assets/some.png" } per animation, convert those strings to p5.Images now.
  const out = {};
  for (const [name, def] of Object.entries(anis)) {
    if (!def || typeof def !== "object") continue;

    const d = { ...def };

    // If img is a string, preload it and replace with the loaded image.
    if (typeof d.img === "string") {
      if (!d.img) {
        delete d.img;
      } else {
        d.img = await loadImageAsync(d.img);
      }
    }

    // If spriteSheet is accidentally a string path, preload it too.
    // (This makes tuning flexible and prevents p5play from trying to load "undefined".)
    if (typeof d.spriteSheet === "string") {
      if (!d.spriteSheet) {
        throw new Error(`[AssetLoader] ${label}.${name}.spriteSheet is an empty string`);
      }
      d.spriteSheet = await loadImageAsync(d.spriteSheet);
    }

    // If img exists but is still undefined/null, remove it to avoid loadImage(undefined).
    if ("img" in d && (d.img === undefined || d.img === null)) {
      delete d.img;
    }

    out[name] = d;
  }

  return out;
}

function validateAssets(bundle) {
  const mustHaveImages = [
    "playerImg",
    "boarImg",
    "leafImg",
    "fireImg",
    "groundTileImg",
    "groundTileDeepImg",
    "platformLCImg",
    "platformRCImg",
    "wallLImg",
    "wallRImg",
    "fontImg",
  ];

  for (const key of mustHaveImages) {
    if (!bundle[key]) {
      throw new Error(`[AssetLoader] Missing required image: ${key}`);
    }
  }

  if (!bundle.backgrounds || typeof bundle.backgrounds !== "object") {
    throw new Error(`[AssetLoader] Missing backgrounds object`);
  }

  // Background values should all be defined images.
  for (const [k, v] of Object.entries(bundle.backgrounds)) {
    if (!v) {
      throw new Error(
        `[AssetLoader] Background "${k}" is missing/undefined (check levels.json parallaxLayers or default bg paths)`,
      );
    }
  }

  // Anis sanity checks (prevents p5play from crashing deep in addAnis/loadImage).
  const checkAnis = (anis, label) => {
    if (!anis || typeof anis !== "object") {
      throw new Error(`[AssetLoader] Missing ${label}Anis object`);
    }
    for (const [name, def] of Object.entries(anis)) {
      if (!def || typeof def !== "object") {
        throw new Error(`[AssetLoader] ${label}Anis.${name} is invalid`);
      }
      // If an ani uses spriteSheet rows/frames, spriteSheet must exist at runtime.
      // We inject spriteSheet by default, so this catches tuning mistakes.
      if (!def.spriteSheet && !def.img) {
        // Allow cases where your entity sets sprite.spriteSheet later,
        // but this warning is *usually* what causes the /undefined crash.
        // Throwing here keeps the failure obvious.
        throw new Error(
          `[AssetLoader] ${label}Anis.${name} has no spriteSheet and no img. ` +
            `This can cause addAnis() to loadImage(undefined).`,
        );
      }
      if ("img" in def && (def.img === undefined || def.img === null)) {
        throw new Error(`[AssetLoader] ${label}Anis.${name}.img is undefined/null`);
      }
    }
  };

  checkAnis(bundle.playerAnis, "player");
  checkAnis(bundle.boarAnis, "boar");
}
