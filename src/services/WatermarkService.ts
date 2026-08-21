import {Platform} from 'react-native';
import Marker, {
  ImageFormat,
  Position,
  TextBackgroundType,
} from 'react-native-image-marker';
import RNFS from 'react-native-fs';
import type {ImageMeta} from '../types';
import {
  getAppRootDir,
  getFileExtension,
  getLegacyPublicRootDir,
  getSafeFileName,
  joinPath,
} from '../utils/path';
import {writeCrashLog} from '../utils/crashLog';
import {hasAllFilesAccess} from '../utils/permission';

const WATERMARK_MAX_WIDTH_RATIO = 0.82;
const WATERMARK_PADDING_X_RATIO = 0.025;
const WATERMARK_PADDING_Y_RATIO = 0.022;
const WATERMARK_FONT_SIZE_MAX = 120;
const WATERMARK_LINE_HEIGHT_RATIO = 1.45;
const WATERMARK_CORNER_RADIUS = 20;

const COLOR_BG = '#80808099';
const COLOR_TEXT = '#ffffff';
const OUTPUT_QUALITY = 92;

function buildWaterPipeTextLocal(spec?: string, qty?: number): string {
  const cleanSpec = (spec || '').trim();
  if (!cleanSpec) return '';
  if (qty != null && !Number.isNaN(qty) && qty > 0) {
    return `${cleanSpec} × ${qty} 條`;
  }
  return cleanSpec;
}

function buildWatermarkLines(meta: ImageMeta): string[] {
  const lines: string[] = [];
  const area = (meta.locationArea || '').trim();
  const parish = (meta.locationParish || '').trim();
  const street = (meta.locationStreet || '').trim();
  const houseNumber = (meta.locationHouseNumber || '').trim();
  if (area || parish || street || houseNumber) {
    if (area) lines.push(area);
    if (parish) lines.push(parish);
    if (street) lines.push(street);
    if (houseNumber) lines.push(`門牌號${houseNumber}`);
  } else {
    const location = (meta.location || '').trim();
    if (location) lines.push(location);
  }
  const wp = buildWaterPipeTextLocal(meta.waterPipeSpec, meta.waterPipeQty);
  if (wp) lines.push(wp);
  const remarkRaw = (meta.remark || '').trim();
  if (remarkRaw) {
    const remarkLines = remarkRaw
      .split(/\r?\n/)
      .map(line => line.trimEnd())
      .filter(line => line.length > 0);
    lines.push(...remarkLines);
  }
  return lines;
}

function normalizeLocalPath(pathOrUri: string): string {
  return pathOrUri.startsWith('file://') ? pathOrUri.slice(7) : pathOrUri;
}

function toMarkerSrc(pathOrUri: string): string {
  if (!pathOrUri) return pathOrUri;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(pathOrUri)) {
    return pathOrUri;
  }
  return `file://${pathOrUri}`;
}

function splitRelativePath(rel?: string): {folderName: string; fileName: string} {
  const clean = (rel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!clean) {
    return {folderName: '', fileName: ''};
  }
  const parts = clean.split('/').filter(Boolean);
  return {
    folderName: parts.length > 1 ? parts[parts.length - 2] : '',
    fileName: parts[parts.length - 1] || '',
  };
}

function buildRemarkSegment(remark?: string): string {
  return (remark || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join('.');
}

function buildOutputFileName(meta: ImageMeta, srcClean: string, outExt: string): string {
  const srcName = srcClean.split(/[\\/]/).pop() || `img_${Date.now()}.${outExt}`;
  const originRelativePath = (meta.originFilePath || meta.filePath || '').trim();
  const originRelativeLike = meta.originFilePath
    ? originRelativePath.split(/[\\/]/).slice(-2).join('/')
    : '';
  const fromOriginPath = splitRelativePath(
    meta.originFilePath
      ? meta.originFilePath.replace(/\\/g, '/').split('/MWRecord/').pop()
      : meta.originFilePath,
  );
  const fromOriginRelative = splitRelativePath((meta as any).originRelativePath);
  const fallback = splitRelativePath(originRelativeLike);
  const folderName =
    fromOriginRelative.folderName ||
    fromOriginPath.folderName ||
    fallback.folderName ||
    srcClean.split(/[\\/]/).slice(-2, -1)[0] ||
    '';
  const originFileNameRaw =
    fromOriginRelative.fileName ||
    fromOriginPath.fileName ||
    fallback.fileName ||
    srcName;
  const originFileName = originFileNameRaw || `img_${Date.now()}.${outExt}`;
  const remarkSegment = buildRemarkSegment(meta.remark);
  const houseAndSpec = `${(meta.locationHouseNumber || '').trim()}${(meta.waterPipeSpec || '').trim()}`.trim();
  const nameParts = [
    folderName.trim(),
    remarkSegment,
    houseAndSpec,
    originFileName,
  ].filter(part => part.length > 0);
  const rawName = nameParts.join('-');
  return getSafeFileName(rawName || originFileName);
}

function buildOutputPath(meta: ImageMeta, srcClean: string) {
  const ext = (getFileExtension(srcClean) || 'jpg').toLowerCase();
  const dir = srcClean.split(/[\\/]/).slice(0, -1).join('/');
  const isPng = ext === 'png';
  const outExt = isPng ? 'png' : 'jpg';
  const outName = buildOutputFileName(meta, srcClean, outExt);
  const outPath = dir
    ? joinPath(dir, outName)
    : joinPath(RNFS.DocumentDirectoryPath, outName);
  const saveFormat = isPng ? ImageFormat.png : ImageFormat.jpg;
  return {outPath, outName, saveFormat};
}

async function syncToPublicMirror(outPath: string) {
  try {
    const ok = await hasAllFilesAccess();
    if (!ok) return;
    const pub = getLegacyPublicRootDir();
    if (!pub) return;
    const root = getAppRootDir();
    const rel = outPath.startsWith(root)
      ? outPath.slice(root.length).replace(/^[\\/]/, '')
      : outPath.split(/[\\/]/).pop() || outPath;
    const to = joinPath(pub, rel);
    const toDir = to.split(/[\\/]/).slice(0, -1).join('/');
    if (toDir) {
      const de = await RNFS.exists(toDir).catch(() => false);
      if (!de) await RNFS.mkdir(toDir);
    }
    const exists = await RNFS.exists(to).catch(() => false);
    if (!exists) {
      await RNFS.copyFile(outPath, to);
    }
  } catch (err) {
    void writeCrashLog('WARN', 'WM:sync-public:fail', err);
  }
}

class WatermarkService {
  isSkiaAvailableSync(): boolean {
    return true;
  }

  hasWatermarkPayload(meta: ImageMeta): boolean {
    return buildWatermarkLines(meta).length > 0;
  }

  async applyWatermarkToImage(meta: ImageMeta): Promise<string | null> {
    try {
      const raw =
        (meta.originFilePath && meta.originFilePath.trim()) ||
        meta.filePath ||
        '';
      const srcClean = normalizeLocalPath(raw);
      const markerSrc = toMarkerSrc(srcClean);
      if (!srcClean) return null;

      const lines = buildWatermarkLines(meta);
      if (lines.length === 0) return null;

      const info = await Marker.getImageInfo(markerSrc);
      const iw = info.width;
      const ih = info.height;
      const base = Math.max(iw, ih);
      const fontSize = Math.min(120, Math.max(24, Math.round(base * 0.028)));
      const lineHeight = Math.round(fontSize * WATERMARK_LINE_HEIGHT_RATIO);
      const padX = Math.round(iw * WATERMARK_PADDING_X_RATIO);
      const padY = Math.round(ih * WATERMARK_PADDING_Y_RATIO);
      const maxTextWidth = Math.floor(iw * WATERMARK_MAX_WIDTH_RATIO);
      const text = lines.join('\n');

      const {outPath, outName, saveFormat} = buildOutputPath(meta, srcClean);

      void writeCrashLog('INFO', 'WM:apply:marker:start', {
        metaId: meta.id,
        iw,
        ih,
        fontSize,
        lineHeight,
        padX,
        padY,
        maxTextWidth,
        linesCount: lines.length,
        sampleLines: lines.slice(0, 6),
        markerSrc,
      });

      const result = await Marker.markText({
        backgroundImage: {
          src: markerSrc,
        },
        watermarkTexts: [
          {
            text,
            position: {
              position: Position.bottomLeft,
              X: padX,
              Y: padY,
            },
            style: {
              color: COLOR_TEXT,
              fontSize,
              lineHeight,
              maxWidth: maxTextWidth,
              wrap: 'character',
              overflow: 'clip',
              textAlign: 'left',
              fontFallbacks:
                Platform.OS === 'android'
                  ? [
                      'Noto Sans CJK TC',
                      'Noto Sans CJK HK',
                      'Noto Sans CJK SC',
                      'Noto Sans TC',
                      'Noto Sans HK',
                      'Source Han Sans TC',
                      'Droid Sans Fallback',
                      'sans-serif',
                    ]
                  : ['PingFang HK', 'PingFang TC', 'PingFang SC'],
              textBackgroundStyle: {
                color: COLOR_BG,
                type: TextBackgroundType.stretchX,
                paddingX: padX,
                paddingY: padY,
                cornerRadius: {
                  all: {
                    x: WATERMARK_CORNER_RADIUS,
                    y: WATERMARK_CORNER_RADIUS,
                  },
                },
              },
            },
          },
        ],
        filename: outName.replace(/\.[^.]+$/, ''),
        saveFormat,
        quality: OUTPUT_QUALITY,
      });

      const markerOut = normalizeLocalPath(result.uri);
      try {
        const exists = await RNFS.exists(outPath).catch(() => false);
        if (exists) {
          await RNFS.unlink(outPath).catch(() => undefined);
        }
      } catch {}

      try {
        const currentPath = normalizeLocalPath(meta.filePath || '');
        const originPath = normalizeLocalPath(meta.originFilePath || srcClean);
        if (
          currentPath &&
          currentPath !== outPath &&
          currentPath !== originPath
        ) {
          const currentExists = await RNFS.exists(currentPath).catch(() => false);
          if (currentExists) {
            await RNFS.unlink(currentPath).catch(() => undefined);
          }
        }
      } catch {}

      if (markerOut !== outPath) {
        await RNFS.copyFile(markerOut, outPath);
      }

      void writeCrashLog('INFO', 'WM:apply:marker:done', {
        metaId: meta.id,
        outPath,
        markerUri: result.uri,
        durationMs: result.durationMs,
      });

      void Promise.resolve().then(async () => {
        await syncToPublicMirror(outPath);
      });

      return outPath;
    } catch (err) {
      void writeCrashLog('ERROR', 'WM:apply:failed', err);
      return null;
    }
  }
}

export const watermarkService = new WatermarkService();
