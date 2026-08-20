import {Platform} from 'react-native';
import RNFS from 'react-native-fs';
import {getAppRootDir, joinPath} from './path';

const CRASH_LOG_FILENAME = 'crashes.log';
const MAX_FILE_SIZE = 1024 * 256;

const getLogPath = (): string => joinPath(getAppRootDir(), CRASH_LOG_FILENAME);

const ts = (): string => {
  try {
    const d = new Date();
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(
        d.getMilliseconds(),
        3,
      )}`
    );
  } catch {
    return '0000-00-00 00:00:00';
  }
};

const safeStr = (v: any, depth = 3): string => {
  try {
    if (v == null) return String(v);
    if (typeof v === 'string') return v;
    if (v instanceof Error) {
      const stack = v.stack ? `\n${v.stack}` : '';
      return `${v.name}: ${v.message}${stack}`;
    }
    if (typeof v === 'object') {
      let s = '';
      try {
        s = JSON.stringify(v);
      } catch {
        try {
          s = Object.prototype.toString.call(v);
        } catch {
          s = String(v);
        }
      }
      if (s.length > 4096) s = s.slice(0, 4096) + '…';
      return s;
    }
    return String(v);
  } catch {
    try {
      return String(v);
    } catch {
      return '[unreadable]';
    }
  }
  void depth;
};

async function trimIfBig(): Promise<void> {
  try {
    const p = getLogPath();
    const stat = await RNFS.stat(p).catch(() => null);
    if (!stat) return;
    const size = typeof (stat as any).size === 'number' ? (stat as any).size : 0;
    if (size < MAX_FILE_SIZE) return;
    const raw = await RNFS.readFile(p, 'utf8').catch(() => '');
    const lines = raw.split(/\n/).filter(Boolean);
    const keep = lines.slice(Math.max(0, lines.length - 1200));
    await RNFS.writeFile(p, keep.join('\n') + (keep.length ? '\n' : ''), 'utf8');
  } catch {
    // ignore
  }
}

export async function writeCrashLog(
  level: 'FATAL' | 'ERROR' | 'WARN' | 'INFO',
  tag: string,
  ...args: any[]
): Promise<void> {
  try {
    const line =
      `[${ts()}] [${Platform.OS}/${Platform.Version}] [${level}] [${tag}] ` +
      args.map(a => safeStr(a)).join(' | ') +
      '\n';
    try {
      if (level === 'FATAL' || level === 'ERROR') {
        (console as any).error(`[CRASH:${tag}]`, ...args);
      } else if (level === 'WARN') {
        (console as any).warn(`[WARN:${tag}]`, ...args);
      } else {
        (console as any).info(`[INFO:${tag}]`, ...args);
      }
    } catch (_e) {
      // ignore
    }
    try {
      const p = getLogPath();
      const dir = getAppRootDir();
      const de = await RNFS.exists(dir);
      if (!de) {
        await RNFS.mkdir(dir).catch((mkErr: any) => {
          console.warn('[crashLog] mkdir fail', dir, mkErr && mkErr.message || mkErr);
        });
      }
      await RNFS.appendFile(p, line, 'utf8');
      await trimIfBig();
    } catch (writeErr: any) {
      console.warn(
        '[crashLog] writeFile fail',
        getLogPath(),
        writeErr && writeErr.message || writeErr,
      );
    }
  } catch (outerErr: any) {
    try {
      console.warn(
        '[crashLog] outer guard fail',
        outerErr && outerErr.message || outerErr,
      );
    } catch {
      // ignore double guard
    }
  }
}

export async function readCrashLog(limit = 80): Promise<string> {
  try {
    const p = getLogPath();
    const exists = await RNFS.exists(p);
    if (!exists) return '';
    const raw = await RNFS.readFile(p, 'utf8');
    if (!raw) return '';
    const lines = raw.split(/\n/).filter(Boolean);
    return lines.slice(Math.max(0, lines.length - limit)).join('\n');
  } catch {
    return '';
  }
}

export const crashLogPath = (): string => getLogPath();
