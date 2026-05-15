import { nativeImage } from 'electron';
import type { Tray, NativeImage } from 'electron';
import { deflateSync } from 'zlib';
import type { Session } from '@claude-dashboard/shared';

// Canvas: 44×44 buffer @2x → 22×22pt effective in the menubar (standard macOS tray size)
const W = 44;
const H = 44;

// Session-card geometry (in buffer pixels) — wide card within square canvas
const CARD_X1 = 3, CARD_Y1 = 7, CARD_X2 = 41, CARD_Y2 = 37, CARD_R = 4;
const BAR_X2 = CARD_X1 + 8;        // left accent bar
const DOT_CX = 36, DOT_CY = 13, DOT_R = 5;  // status dot
const CARD_DIM = 0.22;              // card body opacity relative to bar/dot

const PULSE_FRAME_COUNT = 20;
// Cosine curve: starts at 1.0, dips to 0.4, returns to 1.0 over 2 seconds
const PULSE_OPACITIES = Array.from({ length: PULSE_FRAME_COUNT }, (_, i) =>
  0.7 + 0.3 * Math.cos((2 * Math.PI * i) / PULSE_FRAME_COUNT)
);
const GREEN = '#00e676';
const ORANGE = '#ff6d00';
const WHITE = '#ffffff';
const FRAME_MS = 100;

type TrayState = 'idle' | 'active' | 'permission';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function inRR(px: number, py: number, x1: number, y1: number, x2: number, y2: number, r: number): boolean {
  if (px < x1 || px > x2 || py < y1 || py > y2) return false;
  if (px < x1 + r && py < y1 + r) return Math.hypot(px - x1 - r, py - y1 - r) <= r;
  if (px > x2 - r && py < y1 + r) return Math.hypot(px - x2 + r, py - y1 - r) <= r;
  if (px < x1 + r && py > y2 - r) return Math.hypot(px - x1 - r, py - y2 + r) <= r;
  if (px > x2 - r && py > y2 - r) return Math.hypot(px - x2 + r, py - y2 + r) <= r;
  return true;
}

// opacity applies to the whole icon so all elements pulse together.
function renderPixels(r: number, g: number, b: number, opacity: number): Uint8Array {
  const pixels = new Uint8Array(W * H * 4);
  const SAMPLES = 4;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      let cardHits = 0, barHits = 0, dotHits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = px + (sx + 0.5) / SAMPLES;
          const y = py + (sy + 0.5) / SAMPLES;
          if (inRR(x, y, CARD_X1, CARD_Y1, CARD_X2, CARD_Y2, CARD_R)) cardHits++;
          if (inRR(x, y, CARD_X1, CARD_Y1, BAR_X2, CARD_Y2, CARD_R)) barHits++;
          const dx = x - DOT_CX, dy = y - DOT_CY;
          if (Math.sqrt(dx * dx + dy * dy) <= DOT_R) dotHits++;
        }
      }
      const total = SAMPLES * SAMPLES;
      const layerAlpha = Math.max(
        (cardHits / total) * CARD_DIM,
        barHits / total,
        dotHits / total,
      ) * opacity;
      const alpha = Math.round(layerAlpha * 255);
      if (alpha > 0) {
        const i = (py * W + px) * 4;
        pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = alpha;
      }
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xFF]! ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([t, data]);
  const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

function encodePng(pixels: Uint8Array): Buffer {
  const row = 1 + W * 4;
  const raw = Buffer.alloc(H * row);
  for (let y = 0; y < H; y++) {
    raw[y * row] = 0; // filter: None
    for (let x = 0; x < W; x++) {
      const s = (y * W + x) * 4;
      const d = y * row + 1 + x * 4;
      raw[d] = pixels[s]!; raw[d + 1] = pixels[s + 1]!;
      raw[d + 2] = pixels[s + 2]!; raw[d + 3] = pixels[s + 3]!;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit depth, RGBA color type
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildFrame(color: string, opacity: number): NativeImage {
  const [r, g, b] = hexToRgb(color);
  const buf = encodePng(renderPixels(r, g, b, opacity));
  return nativeImage.createFromBuffer(buf, { scaleFactor: 2.0 });
}

function buildFrames(color: string): NativeImage[] {
  return PULSE_OPACITIES.map((opacity) => buildFrame(color, opacity));
}

export class TrayIconController {
  private readonly tray: Tray;
  private readonly idleImage: NativeImage;
  private readonly greenFrames: NativeImage[];
  private readonly orangeFrames: NativeImage[];
  private frameIndex = 0;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private currentState: TrayState | null = null;

  constructor(tray: Tray) {
    this.tray = tray;
    this.idleImage = buildFrame(WHITE, 1.0);
    this.idleImage.setTemplateImage(true);
    this.greenFrames = buildFrames(GREEN);
    this.orangeFrames = buildFrames(ORANGE);
  }

  update(sessions: Session[], showBadgeCount: boolean): void {
    const hasPermission = sessions.some(
      (s) => s.status === 'waiting_permission' || s.status === 'waiting_input'
    );
    const hasActive = sessions.some((s) => s.status === 'active');
    const nextState: TrayState = hasPermission ? 'permission' : hasActive ? 'active' : 'idle';

    if (nextState !== this.currentState) {
      this.currentState = nextState;
      this.frameIndex = 0;
      this.stopAnimation();
      if (nextState === 'idle') {
        this.tray.setImage(this.idleImage);
      } else {
        this.startAnimation();
      }
    }

    const activeCount = sessions.filter(
      (s) =>
        s.status === 'active' ||
        s.status === 'waiting_permission' ||
        s.status === 'waiting_input'
    ).length;
    this.tray.setTitle(showBadgeCount && activeCount > 0 ? String(activeCount) : '');
    this.tray.setToolTip(
      sessions.length > 0
        ? `Claude Sessions: ${sessions.length}`
        : 'Claude Dashboard'
    );
  }

  private startAnimation(): void {
    const frames =
      this.currentState === 'permission' ? this.orangeFrames : this.greenFrames;
    this.tray.setImage(frames[this.frameIndex]);
    this.intervalHandle = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % frames.length;
      this.tray.setImage(frames[this.frameIndex]);
    }, FRAME_MS);
  }

  private stopAnimation(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  destroy(): void {
    this.stopAnimation();
  }
}
