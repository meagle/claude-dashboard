import { nativeImage } from 'electron';
import type { Tray, NativeImage } from 'electron';
import { deflateSync } from 'zlib';
import type { Session } from '@claude-dashboard/shared';

// BrandMark geometry (normalized 0–1, based on SVG viewBox 0 0 16 16)
const OUTER_R = 6 / 16;
const OUTER_HALF_STROKE = 0.75 / 16;
const CENTER_R = 2 / 16;
const ORBIT_CX = 12.6 / 16;
const ORBIT_CY = 3.7 / 16;
const ORBIT_R = 1.2 / 16;

const PULSE_FRAME_COUNT = 20;
// Cosine curve: starts at 1.0, dips to 0.4, returns to 1.0 over 2 seconds
const PULSE_OPACITIES = Array.from({ length: PULSE_FRAME_COUNT }, (_, i) =>
  0.7 + 0.3 * Math.cos((2 * Math.PI * i) / PULSE_FRAME_COUNT)
);
const GREEN = '#3fb950';
const ORANGE = '#f0883e';
const WHITE = '#ffffff';
const FRAME_MS = 100;

type TrayState = 'idle' | 'active' | 'permission';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function renderPixels(size: number, r: number, g: number, b: number, opacity: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const SAMPLES = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          const dx = x - 0.5, dy = y - 0.5;
          const d = Math.sqrt(dx * dx + dy * dy);
          const onRing = d >= OUTER_R - OUTER_HALF_STROKE && d <= OUTER_R + OUTER_HALF_STROKE;
          const inCenter = d <= CENTER_R;
          const ox = x - ORBIT_CX, oy = y - ORBIT_CY;
          const inOrbit = Math.sqrt(ox * ox + oy * oy) <= ORBIT_R;
          if (onRing || inCenter || inOrbit) hits++;
        }
      }
      const alpha = Math.round((hits / (SAMPLES * SAMPLES)) * opacity * 255);
      if (alpha > 0) {
        const i = (py * size + px) * 4;
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

function encodePng(size: number, pixels: Uint8Array): Buffer {
  const row = 1 + size * 4;
  const raw = Buffer.alloc(size * row);
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4;
      const d = y * row + 1 + x * 4;
      raw[d] = pixels[s]!; raw[d + 1] = pixels[s + 1]!;
      raw[d + 2] = pixels[s + 2]!; raw[d + 3] = pixels[s + 3]!;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
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
  const buf = encodePng(32, renderPixels(32, r, g, b, opacity));
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
