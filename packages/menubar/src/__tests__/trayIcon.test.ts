import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TrayIconController } from '../trayIcon';
import { nativeImage } from 'electron';
import type { Session } from '@claude-dashboard/shared';

// Mock zlib (Node built-in used by PNG encoder) — return a trivial buffer
vi.mock('zlib', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zlib')>();
  return {
    ...actual,
    deflateSync: vi.fn().mockReturnValue(Buffer.alloc(0)),
  };
});

vi.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: vi.fn().mockImplementation(() => ({
      setTemplateImage: vi.fn(),
    })),
  },
}));

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'sess-1',
    pid: 100,
    termSessionId: null,
    workingDir: '/tmp/test',
    dirName: 'test',
    branch: 'main',
    worktree: null,
    status: 'active',
    currentTool: null,
    lastTool: null,
    lastToolAt: null,
    lastToolSummary: null,
    lastPrompt: null,
    lastMessage: null,
    currentTask: null,
    tasks: [],
    subagents: [],
    completionPct: 0,
    changedFiles: null,
    costUsd: null,
    turns: null,
    toolCount: 0,
    totalTokens: null,
    model: null,
    contextPct: null,
    bashStartedAt: null,
    gitSummary: null,
    gitAhead: null,
    transcriptPath: null,
    partialResponse: null,
    errorState: false,
    startedAt: Date.now(),
    turnStartedAt: null,
    lastActivity: Date.now(),
    dismissed: false,
    loopTool: null,
    loopCount: 0,
    ...overrides,
  };
}

function makeTray() {
  return { setImage: vi.fn(), setTitle: vi.fn(), setToolTip: vi.fn() };
}

describe('TrayIconController', () => {
  beforeEach(() => {
    vi.mocked(nativeImage.createFromBuffer).mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates 9 NativeImages at construction (1 idle + 4 green + 4 orange)', () => {
    const ctrl = new TrayIconController(makeTray() as any);
    expect(vi.mocked(nativeImage.createFromBuffer)).toHaveBeenCalledTimes(9);
    ctrl.destroy();
  });

  it('marks first created image as template image (idle state)', () => {
    const ctrl = new TrayIconController(makeTray() as any);
    const idleImg = vi.mocked(nativeImage.createFromBuffer).mock.results[0].value;
    expect(idleImg.setTemplateImage).toHaveBeenCalledWith(true);
    ctrl.destroy();
  });

  it('sets idle image when update called with no sessions', () => {
    const tray = makeTray();
    const ctrl = new TrayIconController(tray as any);
    const idleImg = vi.mocked(nativeImage.createFromBuffer).mock.results[0].value;
    ctrl.update([], false);
    expect(tray.setImage).toHaveBeenCalledWith(idleImg);
    ctrl.destroy();
  });

  it('sets tooltip to "Claude Dashboard" with no sessions', () => {
    const tray = makeTray();
    const ctrl = new TrayIconController(tray as any);
    ctrl.update([], false);
    expect(tray.setToolTip).toHaveBeenCalledWith('Claude Dashboard');
    ctrl.destroy();
  });

  it('sets tooltip to session count when sessions present', () => {
    const tray = makeTray();
    const ctrl = new TrayIconController(tray as any);
    ctrl.update([makeSession()], false);
    expect(tray.setToolTip).toHaveBeenCalledWith('Claude Sessions: 1');
    ctrl.destroy();
  });

  it('starts animation with green frame for active sessions', () => {
    const tray = makeTray();
    const ctrl = new TrayIconController(tray as any);
    // results[0] = idle, results[1..4] = green frames
    const firstGreenFrame = vi.mocked(nativeImage.createFromBuffer).mock.results[1].value;
    ctrl.update([makeSession({ status: 'active' })], false);
    expect(tray.setImage).toHaveBeenCalledWith(firstGreenFrame);
    ctrl.destroy();
  });

  it('starts animation with orange frame for waiting_permission', () => {
    const tray = makeTray();
    const ctrl = new TrayIconController(tray as any);
    // results[5..8] = orange frames
    const firstOrangeFrame = vi.mocked(nativeImage.createFromBuffer).mock.results[5].value;
    ctrl.update([makeSession({ status: 'waiting_permission' })], false);
    expect(tray.setImage).toHaveBeenCalledWith(firstOrangeFrame);
    ctrl.destroy();
  });

  it('starts animation with orange frame for waiting_input', () => {
    const tray = makeTray();
    const ctrl = new TrayIconController(tray as any);
    const firstOrangeFrame = vi.mocked(nativeImage.createFromBuffer).mock.results[5].value;
    ctrl.update([makeSession({ status: 'waiting_input' })], false);
    expect(tray.setImage).toHaveBeenCalledWith(firstOrangeFrame);
    ctrl.destroy();
  });

  it('permission takes priority over active', () => {
    const tray = makeTray();
    const ctrl = new TrayIconController(tray as any);
    const firstOrangeFrame = vi.mocked(nativeImage.createFromBuffer).mock.results[5].value;
    ctrl.update([
      makeSession({ status: 'active' }),
      makeSession({ sessionId: 'sess-2', status: 'waiting_permission' }),
    ], false);
    expect(tray.setImage).toHaveBeenCalledWith(firstOrangeFrame);
    ctrl.destroy();
  });

  it('advances to next frame after 500ms', () => {
    const tray = makeTray();
    const ctrl = new TrayIconController(tray as any);
    const secondGreenFrame = vi.mocked(nativeImage.createFromBuffer).mock.results[2].value;
    ctrl.update([makeSession({ status: 'active' })], false);
    tray.setImage.mockClear();
    vi.advanceTimersByTime(500);
    expect(tray.setImage).toHaveBeenCalledWith(secondGreenFrame);
    ctrl.destroy();
  });

  it('does not restart animation when called again with the same state', () => {
    const tray = makeTray();
    const ctrl = new TrayIconController(tray as any);
    ctrl.update([makeSession({ status: 'active' })], false);
    tray.setImage.mockClear();
    ctrl.update([makeSession({ status: 'active' })], false);
    expect(tray.setImage).not.toHaveBeenCalled();
    ctrl.destroy();
  });

  it('cycles back to first frame after 4 advances', () => {
    const tray = makeTray();
    const ctrl = new TrayIconController(tray as any);
    const firstGreenFrame = vi.mocked(nativeImage.createFromBuffer).mock.results[1].value;
    ctrl.update([makeSession({ status: 'active' })], false);
    tray.setImage.mockClear();
    vi.advanceTimersByTime(2000);
    expect(tray.setImage).toHaveBeenLastCalledWith(firstGreenFrame);
    ctrl.destroy();
  });

  it('stops animation and shows idle on transition to idle', () => {
    const tray = makeTray();
    const ctrl = new TrayIconController(tray as any);
    const idleImg = vi.mocked(nativeImage.createFromBuffer).mock.results[0].value;
    ctrl.update([makeSession({ status: 'active' })], false);
    ctrl.update([], false);
    expect(tray.setImage).toHaveBeenCalledWith(idleImg);
    tray.setImage.mockClear();
    vi.advanceTimersByTime(2000);
    expect(tray.setImage).not.toHaveBeenCalled();
    ctrl.destroy();
  });

  describe('badge count (setTitle)', () => {
    it('sets title to count when showBadgeCount is true and sessions active', () => {
      const tray = makeTray();
      const ctrl = new TrayIconController(tray as any);
      ctrl.update([makeSession({ status: 'active' })], true);
      expect(tray.setTitle).toHaveBeenCalledWith('1');
      ctrl.destroy();
    });

    it('sets title to empty string when showBadgeCount is false', () => {
      const tray = makeTray();
      const ctrl = new TrayIconController(tray as any);
      ctrl.update([makeSession({ status: 'active' })], false);
      expect(tray.setTitle).toHaveBeenCalledWith('');
      ctrl.destroy();
    });

    it('sets title to empty string when no active sessions even with showBadgeCount true', () => {
      const tray = makeTray();
      const ctrl = new TrayIconController(tray as any);
      ctrl.update([], true);
      expect(tray.setTitle).toHaveBeenCalledWith('');
      ctrl.destroy();
    });

    it('counts active + waiting_permission + waiting_input in badge', () => {
      const tray = makeTray();
      const ctrl = new TrayIconController(tray as any);
      ctrl.update([
        makeSession({ status: 'active' }),
        makeSession({ sessionId: 'sess-2', status: 'waiting_permission' }),
        makeSession({ sessionId: 'sess-3', status: 'waiting_input' }),
      ], true);
      expect(tray.setTitle).toHaveBeenCalledWith('3');
      ctrl.destroy();
    });

    it('does not count done or idle sessions in badge', () => {
      const tray = makeTray();
      const ctrl = new TrayIconController(tray as any);
      ctrl.update([
        makeSession({ status: 'done' }),
        makeSession({ sessionId: 'sess-2', status: 'idle' }),
      ], true);
      expect(tray.setTitle).toHaveBeenCalledWith('');
      ctrl.destroy();
    });
  });
});
