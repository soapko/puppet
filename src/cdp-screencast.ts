/**
 * CDP Screencast Video Recorder
 *
 * Records video from CDP-connected browsers using Page.startScreencast.
 * Frames are piped to ffmpeg to produce a WebM video file.
 *
 * This bypasses Playwright's recordVideo limitation (requires context creation)
 * by using the same CDP protocol that Puppeteer uses internally.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { CDPSessionLike } from './direct-cdp-session.js';

const log = {
  info: (msg: string, ...args: unknown[]) => console.error(`[puppet:screencast] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[puppet:screencast] ${msg}`, ...args),
  debug: (msg: string, ...args: unknown[]) => {
    if (process.env.PUPPET_DEBUG) console.error(`[puppet:screencast] ${msg}`, ...args);
  },
};

export interface ScreencastOptions {
  /** Output video file path */
  outputPath: string;
  /** Frame rate for output video. Default: 25 */
  fps?: number;
  /** JPEG quality for screencast frames (0-100). Default: 80 */
  quality?: number;
  /** Max frame width (Chrome downscales). Defaults to viewport width */
  maxWidth?: number;
  /** Max frame height (Chrome downscales). Defaults to viewport height */
  maxHeight?: number;
}

interface ScreencastFrame {
  data: string;
  metadata: { timestamp?: number };
  sessionId: number;
}

/**
 * Check if ffmpeg is available on the system PATH
 */
async function checkFfmpeg(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'pipe' });
    proc.on('error', () => {
      reject(
        new Error(
          'ffmpeg not found. Video recording requires ffmpeg.\n' +
            '  macOS:  brew install ffmpeg\n' +
            '  Linux:  apt install ffmpeg\n' +
            '  Windows: choco install ffmpeg'
        )
      );
    });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg check failed with code ${code}`));
    });
  });
}

/**
 * Records video from a CDP-connected browser page using Page.startScreencast.
 *
 * Frames arrive at variable intervals from Chrome. To produce a constant-FPS
 * video for ffmpeg, each frame is duplicated to fill the time gap since the
 * previous frame (same strategy Puppeteer uses internally).
 */
export class CDPScreenRecorder {
  private cdpSession: CDPSessionLike;
  private ffmpeg: ChildProcess | null = null;
  private lastFrame: { buffer: Buffer; timestamp: number } | null = null;
  private fps: number;
  private started = false;
  private stopped = false;
  private frameCount = 0;
  readonly outputPath: string;

  constructor(
    cdpSession: CDPSessionLike,
    private options: ScreencastOptions
  ) {
    this.fps = options.fps ?? 25;
    this.cdpSession = cdpSession;
    this.outputPath = options.outputPath;
  }

  async start(): Promise<void> {
    // Check ffmpeg is available
    await checkFfmpeg();

    // Ensure output directory exists
    await mkdir(dirname(this.options.outputPath), { recursive: true });

    log.info(`Starting screencast recording → ${this.options.outputPath}`);
    log.debug(
      `fps=${this.fps}, quality=${this.options.quality ?? 80}, ` +
        `maxWidth=${this.options.maxWidth}, maxHeight=${this.options.maxHeight}`
    );

    // Spawn ffmpeg — JPEG input via stdin, VP9/WebM output
    this.ffmpeg = spawn(
      'ffmpeg',
      [
        '-loglevel',
        'error',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        '-framerate',
        String(this.fps),
        '-i',
        'pipe:0',
        '-vcodec',
        'vp9',
        '-crf',
        '30',
        '-deadline',
        'realtime',
        '-b:v',
        '0',
        '-an',
        '-threads',
        '1',
        '-y',
        this.options.outputPath,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );

    // Swallow EPIPE on stdin — can happen if ffmpeg exits while writes are buffered
    this.ffmpeg.stdin?.on('error', () => {});

    // Log ffmpeg errors
    this.ffmpeg.stderr?.on('data', (data: Buffer) => {
      log.error('ffmpeg:', data.toString().trim());
    });

    this.ffmpeg.on('error', err => {
      log.error('ffmpeg process error:', err.message);
    });

    // Listen for screencast frames
    this.cdpSession.on('Page.screencastFrame', this.onFrame);

    // Start screencast
    await this.cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality: this.options.quality ?? 80,
      maxWidth: this.options.maxWidth,
      maxHeight: this.options.maxHeight,
      everyNthFrame: 1,
    });

    this.started = true;
    log.info('Screencast started (waiting for frames from CDP...)');

    // Diagnostic: warn if no frames received after a few seconds
    setTimeout(() => {
      if (this.started && !this.stopped && this.rawFrameCount === 0) {
        log.error(
          'WARNING: No screencast frames received after 3s. ' +
            'CDP Page.screencastFrame events may not be forwarded by the proxy.'
        );
      }
    }, 3000);
  }

  private rawFrameCount = 0;

  private onFrame = (event: ScreencastFrame) => {
    this.rawFrameCount++;
    if (this.rawFrameCount <= 3 || this.rawFrameCount % 100 === 0) {
      log.debug(
        `Frame received #${this.rawFrameCount}: sessionId=${event.sessionId}, ` +
          `dataLen=${event.data?.length ?? 0}, timestamp=${event.metadata.timestamp}`
      );
    }

    // Ack immediately — Chrome flow control won't send new frames without this
    void this.cdpSession
      .send('Page.screencastFrameAck', {
        sessionId: event.sessionId,
      })
      .catch(() => {
        // Session may be closing
      });

    if (this.stopped || !this.ffmpeg?.stdin?.writable) {
      log.debug(
        `Frame #${this.rawFrameCount} dropped: stopped=${this.stopped}, writable=${this.ffmpeg?.stdin?.writable}`
      );
      return;
    }

    // Skip frames without timestamps (can't compute duration)
    const timestamp = event.metadata.timestamp;
    if (timestamp === undefined) {
      log.debug(`Frame #${this.rawFrameCount} skipped: no timestamp`);
      return;
    }

    const buffer = Buffer.from(event.data, 'base64');

    // Duplicate previous frame to fill time gap (constant FPS for ffmpeg)
    if (this.lastFrame) {
      const duration = timestamp - this.lastFrame.timestamp;
      const copies = Math.max(1, Math.round(this.fps * Math.max(duration, 0)));
      for (let i = 0; i < copies; i++) {
        this.ffmpeg.stdin.write(this.lastFrame.buffer);
        this.frameCount++;
      }
    }

    this.lastFrame = { buffer, timestamp };
  };

  async stop(): Promise<string> {
    if (!this.started || this.stopped) return this.options.outputPath;
    this.stopped = true;

    log.info('Stopping screencast...');

    // 1. Stop screencast
    try {
      await this.cdpSession.send('Page.stopScreencast');
    } catch {
      // Session may already be closed
    }

    // 2. Remove listener
    this.cdpSession.off('Page.screencastFrame', this.onFrame);

    // 3. Write final frame(s) — pad with last frame for ~0.5s tail
    if (this.lastFrame && this.ffmpeg?.stdin?.writable) {
      const copies = Math.max(1, Math.round(this.fps * 0.5));
      for (let i = 0; i < copies; i++) {
        this.ffmpeg.stdin.write(this.lastFrame.buffer);
        this.frameCount++;
      }
    }

    // 4. Close ffmpeg stdin and wait for it to finish encoding
    if (this.ffmpeg) {
      // End stdin first — signals EOF to ffmpeg so it can finalize the container
      this.ffmpeg.stdin?.end();

      const ffmpegRef = this.ffmpeg;
      const exitPromise = new Promise<void>(resolve => {
        // SIGINT lets ffmpeg finalize the WebM container (duration, seek index)
        const sigintTimeout = setTimeout(() => {
          log.info('ffmpeg did not exit within 5s after stdin close, sending SIGINT');
          ffmpegRef.kill('SIGINT');
        }, 5000);

        // SIGKILL as last resort
        const killTimeout = setTimeout(() => {
          log.error('ffmpeg did not exit within 10s, killing');
          ffmpegRef.kill('SIGKILL');
        }, 10000);

        ffmpegRef.once('close', () => {
          clearTimeout(sigintTimeout);
          clearTimeout(killTimeout);
          resolve();
        });

        ffmpegRef.once('error', () => {
          clearTimeout(sigintTimeout);
          clearTimeout(killTimeout);
          resolve();
        });
      });

      await exitPromise;
      this.ffmpeg = null;
    }

    // Note: we do NOT detach the CDP session here — the caller manages session lifecycle.
    // Detaching a DirectCDPSession (closing its WS) can cause Electron to close the page target,
    // triggering "Tab closed unexpectedly" in the session handler.

    log.info(
      `Recording saved: ${this.options.outputPath} ` +
        `(${this.frameCount} encoded frames from ${this.rawFrameCount} raw CDP frames)`
    );
    return this.options.outputPath;
  }
}
