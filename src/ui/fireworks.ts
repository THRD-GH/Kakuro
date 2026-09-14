/*
 * Fireworks above a dojo, for a solved puzzle.
 *
 * Self-contained on purpose — no imports, no stylesheet, nothing Kakuro-shaped
 * — so the other DanDoku games can take the file as it is. The canvas styles
 * itself, the colours default to the house tokens every one of them defines,
 * and the one thing the show needs from the page, the panel to stand on, is
 * passed in.
 *
 * One canvas over the whole window for as long as the show lasts, removed
 * after, and the pointer passes straight through it to the panel underneath.
 */

export interface FireworksOptions {
  /**
   * What the show stands on: the panel announcing the win. The dojo is drawn on
   * its top edge and the fireworks go off above it. Without one, or without
   * room above it, the fireworks take the top of the window and the dojo is
   * left out.
   */
  above?: Element | null;
  /** Spark colours. By default the house coral, blue, green and gold, read off the page. */
  colours?: string[];
  /** Draw the dojo. On unless set false. */
  dojo?: boolean;
  /** Stacking order of the canvas: over a panel's shade, under a toast. */
  zIndex?: number;
}

interface Rocket {
  /** When it goes up, in milliseconds after the show starts. */
  at: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  colour: string;
  burst: boolean;
}

interface Spark {
  x: number;
  y: number;
  /** In CSS pixels per millisecond. */
  vx: number;
  vy: number;
  /** How long this spark lives, and how long it has had, in milliseconds. */
  life: number;
  age: number;
  size: number;
  colour: string;
}

/** Where everything goes, worked out once from the window and the panel. */
interface Stage {
  width: number;
  /** The dojo's centre, the line it stands on, and its width; null for a show without one. */
  dojo: { cx: number; base: number; w: number } | null;
  /** The band the bursts go off in. */
  skyTop: number;
  skyBottom: number;
  /** How wide a band, centred, the bursts spread across. */
  band: number;
  /** Where rockets go up from. */
  launchY: number;
  /** Burst size as a share of a full one, which throws sparks about 110px. */
  scale: number;
}

const ROCKETS = 5;
const SPARKS_PER_BURST = 36;
/** How long a rocket takes to climb to where it bursts. */
const RISE_MS = 520;
/** The first rocket waits for the dojo to be there. */
const FIRST_ROCKET_MS = 250;
/** CSS pixels per millisecond squared at full size: about 240px/s², a firework rather than a stone. */
const GRAVITY = 0.00024;
/** The share of its speed a spark keeps each millisecond, so a burst opens fast and then hangs. */
const DRAG = 0.9985;
/** A frame longer than this is a tab that was hidden, not time for the sparks to fly. */
const MAX_STEP_MS = 32;
/** The dojo is this tall for each unit of its width. */
const DOJO_HEIGHT = 0.62;
const DOJO_FADE_IN_MS = 300;
const DOJO_FADE_OUT_MS = 450;
/**
 * The show's time is kept frame by frame, capped per frame, so frames that come
 * slowly — a throttled tab, a phone saving power — stretch it out, and a hidden
 * tab draws none at all. Whatever the frames do, a timer takes the canvas away
 * this long after the start.
 */
const DEADLINE_MS = 8000;

/** `rgba(r, g, b, a)` made solid; any other colour passes through as it is. */
function solid(colour: string): string {
  const match = /^rgba\(\s*([^,]+),\s*([^,]+),\s*([^,]+),[^)]*\)$/.exec(colour);
  return match ? `rgb(${match[1]}, ${match[2]}, ${match[3]})` : colour;
}

function stage(width: number, height: number, options: FireworksOptions): Stage {
  const floor = Math.min(options.above ? options.above.getBoundingClientRect().top : height, height);
  const room = floor - 8;
  if (options.dojo !== false && room >= 150) {
    // As tall as the room allows within reason, and never wider than most of the window.
    const w = Math.min(Math.min(Math.max(room * 0.42, 60), 150) / DOJO_HEIGHT, width * 0.7);
    const roof = floor - w * DOJO_HEIGHT;
    const radius = Math.min(Math.max(Math.min((roof - 8) * 0.55, width * 0.2), 36), 110);
    const skyTop = 8 + radius * 0.6;
    return {
      width,
      dojo: { cx: width / 2, base: floor, w },
      skyTop,
      skyBottom: Math.max(skyTop, roof - radius * 0.35),
      band: Math.min(width * 0.9, w * 1.8),
      launchY: floor,
      scale: radius / 110,
    };
  }
  return {
    width,
    dojo: null,
    skyTop: height * 0.14,
    skyBottom: height * 0.38,
    band: Math.min(width, 720),
    launchY: height + 8,
    scale: Math.min(1, Math.min(width, height) / 600),
  };
}

/** Rockets a little apart in time, their bursts spread across the band so no two land together. */
function plan(scene: Stage, colours: string[]): Rocket[] {
  const slots = Array.from({ length: ROCKETS }, (_, i) => (i + 0.5) / ROCKETS);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const held = slots[i] ?? 0.5;
    slots[i] = slots[j] ?? 0.5;
    slots[j] = held;
  }
  const left = (scene.width - scene.band) / 2;
  return slots.map((slot, i) => {
    const toX = left + scene.band * (0.1 + 0.8 * slot) + (Math.random() - 0.5) * scene.band * 0.06;
    // From behind the dojo, fanning out towards where each one bursts.
    const fromX = scene.dojo
      ? scene.dojo.cx + (toX - scene.dojo.cx) * 0.35 + (Math.random() - 0.5) * scene.dojo.w * 0.2
      : toX + (Math.random() - 0.5) * 60;
    return {
      at: FIRST_ROCKET_MS + i * 320 + Math.random() * 120,
      fromX,
      fromY: scene.launchY,
      toX,
      toY: scene.skyTop + Math.random() * (scene.skyBottom - scene.skyTop),
      colour: colours[i % colours.length] ?? '#f06951',
      burst: false,
    };
  });
}

/** A rocket on its way up: a bright head with a short fading tail. */
function drawRocket(context: CanvasRenderingContext2D, rocket: Rocket, t: number): void {
  context.fillStyle = rocket.colour;
  for (let k = 0; k < 4; k++) {
    const at = t - k * 0.05;
    if (at < 0) break;
    // Fast off the ground, slowing towards the top.
    const eased = 1 - (1 - at) ** 3;
    context.globalAlpha = 1 - k * 0.24;
    context.beginPath();
    context.arc(
      rocket.fromX + (rocket.toX - rocket.fromX) * eased,
      rocket.fromY + (rocket.toY - rocket.fromY) * eased,
      2.2 - k * 0.4,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.globalAlpha = 1;
}

/** Where a rocket tops out: sparks thrown evenly round a circle, each a little different. */
function burst(sparks: Spark[], rocket: Rocket, colours: string[], scale: number): void {
  // Mostly the rocket's own colour, with a few of another to catch the eye.
  const other = colours[(colours.indexOf(rocket.colour) + 2) % colours.length] ?? rocket.colour;
  for (let i = 0; i < SPARKS_PER_BURST; i++) {
    const angle = (i / SPARKS_PER_BURST) * Math.PI * 2 + Math.random() * 0.2;
    const speed = (0.07 + Math.random() * 0.13) * scale;
    sparks.push({
      x: rocket.toX,
      y: rocket.toY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 850 + Math.random() * 550,
      age: 0,
      size: (1.6 + Math.random() * 1.1) * (0.7 + 0.3 * scale),
      colour: i % 5 === 0 ? other : rocket.colour,
    });
  }
}

/**
 * The dojo, in units of its own width: x from -0.5 to 0.5 across it, y rising
 * from its base as it goes negative. Each solid part is filled on its own —
 * overlapping sub-paths wound opposite ways would cancel under one fill — and
 * everything is then drawn over in ink.
 */
function dojoShapes(): { solids: Path2D[]; lines: Path2D } {
  const lines = new Path2D();

  // The stone plinth it stands on, with a step at the front.
  const plinth = new Path2D();
  plinth.rect(-0.42, -0.055, 0.84, 0.055);
  lines.moveTo(-0.09, 0);
  lines.lineTo(-0.09, -0.0275);
  lines.lineTo(0.09, -0.0275);
  lines.lineTo(0.09, 0);

  // The hall: its posts, and the beam across their heads.
  const hall = new Path2D();
  hall.rect(-0.33, -0.25, 0.66, 0.195);
  for (const x of [-0.21, -0.09, 0.09, 0.21]) {
    lines.moveTo(x, -0.055);
    lines.lineTo(x, -0.25);
  }
  lines.moveTo(-0.33, -0.215);
  lines.lineTo(0.33, -0.215);

  // The lower roof, its eaves sagging in the middle and sweeping up at the corners.
  const lowerRoof = new Path2D();
  lowerRoof.moveTo(-0.53, -0.305);
  lowerRoof.quadraticCurveTo(0, -0.215, 0.53, -0.305);
  lowerRoof.quadraticCurveTo(0.36, -0.325, 0.25, -0.4);
  lowerRoof.lineTo(-0.25, -0.4);
  lowerRoof.quadraticCurveTo(-0.36, -0.325, -0.53, -0.305);
  lowerRoof.closePath();
  lines.moveTo(-0.5, -0.322);
  lines.quadraticCurveTo(0, -0.24, 0.5, -0.322);

  // The short wall between the two roofs.
  const band = new Path2D();
  band.rect(-0.2, -0.445, 0.4, 0.045);
  for (const x of [-0.1, 0, 0.1]) {
    lines.moveTo(x, -0.4);
    lines.lineTo(x, -0.445);
  }

  // The upper roof, hipped and gabled, with the gable's triangle under the ridge.
  const upperRoof = new Path2D();
  upperRoof.moveTo(-0.39, -0.46);
  upperRoof.quadraticCurveTo(0, -0.43, 0.39, -0.46);
  upperRoof.quadraticCurveTo(0.25, -0.475, 0.15, -0.585);
  upperRoof.lineTo(-0.15, -0.585);
  upperRoof.quadraticCurveTo(-0.25, -0.475, -0.39, -0.46);
  upperRoof.closePath();
  lines.moveTo(-0.09, -0.505);
  lines.lineTo(0, -0.565);
  lines.lineTo(0.09, -0.505);
  lines.closePath();

  // The ridge's ends turned up.
  lines.moveTo(-0.15, -0.585);
  lines.lineTo(-0.185, -0.62);
  lines.moveTo(0.15, -0.585);
  lines.lineTo(0.185, -0.62);

  return { solids: [plinth, hall, lowerRoof, band, upperRoof], lines };
}

function drawDojo(
  context: CanvasRenderingContext2D,
  dojo: NonNullable<Stage['dojo']>,
  shapes: ReturnType<typeof dojoShapes>,
  alpha: number,
  ink: string,
  paper: string,
): void {
  if (alpha <= 0) return;
  context.save();
  context.globalAlpha = alpha;
  context.translate(dojo.cx, dojo.base);
  context.scale(dojo.w, dojo.w);
  // Paper under the ink, so the drawing reads over whatever the shade has dimmed.
  context.fillStyle = paper;
  for (const part of shapes.solids) context.fill(part);
  context.strokeStyle = ink;
  context.lineWidth = Math.max(1.5, dojo.w * 0.0065) / dojo.w;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  for (const part of shapes.solids) context.stroke(part);
  context.stroke(shapes.lines);
  context.restore();
}

/**
 * Starts the show and hands back a way to stop it early. Does nothing when the
 * device asks for reduced motion: a stylesheet can still every CSS animation
 * for that, but a canvas is drawn by script and has to ask for itself.
 */
export function fireworks(options: FireworksOptions = {}): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return () => {};

  const width = window.innerWidth;
  const height = window.innerHeight;
  // Sharp on a phone's dense screen, without paying for more than twice over.
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.className = 'fireworks';
  canvas.setAttribute('aria-hidden', 'true');
  // Sized in CSS pixels, since its own pixels are the window's times the density.
  canvas.style.cssText = `position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:${options.zIndex ?? 60}`;
  context.scale(ratio, ratio);

  const tokens = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string): string => tokens.getPropertyValue(name).trim() || fallback;
  const colours = options.colours?.length
    ? options.colours
    : [
        token('--coral', '#f06951'),
        token('--accent', '#3979a8'),
        token('--met', '#3f6b46'),
        solid(token('--sel', 'rgb(190, 150, 60)')),
      ];
  const ink = token('--text', '#17273d');
  const paper = token('--panel', '#fffdfa');

  const scene = stage(width, height, options);
  const rockets = plan(scene, colours);
  const shapes = scene.dojo ? dojoShapes() : null;
  const sparks: Spark[] = [];
  document.body.append(canvas);

  let frame = 0;
  let deadline = 0;
  let fading: number | null = null;
  const start = performance.now();
  let last = start;

  const stop = (): void => {
    cancelAnimationFrame(frame);
    window.clearTimeout(deadline);
    canvas.remove();
  };

  const step = (now: number): void => {
    // A frame's timestamp can fall a moment before the show was started.
    const dt = Math.min(Math.max(now - last, 0), MAX_STEP_MS);
    last = now;
    const elapsed = now - start;
    context.clearRect(0, 0, width, height);

    // Rockets before the dojo, so they go up from behind it.
    let climbing = false;
    for (const rocket of rockets) {
      if (rocket.burst) continue;
      const t = (elapsed - rocket.at) / RISE_MS;
      if (t >= 1) {
        rocket.burst = true;
        burst(sparks, rocket, colours, scene.scale);
        continue;
      }
      climbing = true;
      if (t >= 0) drawRocket(context, rocket, t);
    }

    if (scene.dojo && shapes) {
      const shown = Math.min(1, Math.max(elapsed, 0) / DOJO_FADE_IN_MS);
      const going = fading === null ? 1 : Math.max(0, 1 - (now - fading) / DOJO_FADE_OUT_MS);
      drawDojo(context, scene.dojo, shapes, shown * going, ink, paper);
    }

    // Sparks after it, so the ones that fall come down in front.
    const keep = DRAG ** dt;
    const pull = GRAVITY * scene.scale * dt;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const spark = sparks[i];
      if (!spark) continue;
      spark.age += dt;
      if (spark.age >= spark.life) {
        sparks.splice(i, 1);
        continue;
      }
      spark.vx *= keep;
      spark.vy = spark.vy * keep + pull;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      const left = 1 - spark.age / spark.life;
      context.globalAlpha = Math.min(1, left * 1.6);
      context.fillStyle = spark.colour;
      context.beginPath();
      context.arc(spark.x, spark.y, spark.size * (0.5 + 0.5 * left), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;

    if (!climbing && sparks.length === 0) {
      // The fireworks are over; the dojo goes last.
      if (fading === null) fading = now;
      if (!scene.dojo || now - fading >= DOJO_FADE_OUT_MS) {
        stop();
        return;
      }
    }
    frame = requestAnimationFrame(step);
  };

  frame = requestAnimationFrame(step);
  deadline = window.setTimeout(stop, DEADLINE_MS);
  return stop;
}
