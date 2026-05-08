import { nativeImage } from 'electron';
import type { Tray, NativeImage } from 'electron';
import type { Session } from '@claude-dashboard/shared';

const PULSE_OPACITIES = [1.0, 0.65, 0.4, 0.65] as const;
const GREEN = '#3fb950';
const ORANGE = '#f0883e';
const WHITE = '#ffffff';
const FRAME_MS = 500;

type TrayState = 'idle' | 'active' | 'permission';

function makeSvg(color: string, opacity: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">` +
    `<g opacity="${opacity}">` +
    `<circle cx="8" cy="8" r="6" stroke="${color}" stroke-width="1.5" fill="none"/>` +
    `<circle cx="8" cy="8" r="2" fill="${color}"/>` +
    `<circle cx="12.6" cy="3.7" r="1.2" fill="${color}"/>` +
    `</g></svg>`
  );
}

function buildFrame(color: string, opacity: number): NativeImage {
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(makeSvg(color, opacity))}`
  );
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
  private currentState: TrayState | null = null; // null forces state apply on first update()

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
