import {Platform} from 'react-native';
import RNFS from 'react-native-fs';
import type {ImageMeta} from '../types';
import {fileSystemService} from './FileSystemService';
import {joinPath, getFileExtension} from '../utils/path';

const WATERMARK_MAX_WIDTH_RATIO = 0.88;
const WATERMARK_PADDING_X = 24;
const WATERMARK_PADDING_Y = 28;
const WATERMARK_FONT_SIZE_BASE = 36;
const WATERMARK_LINE_HEIGHT_RATIO = 1.45;
const WATERMARK_CORNER_RADIUS = 20;

const COLOR_BG = 'rgba(0,0,0,0.6)';
const COLOR_STROKE = 'rgba(255,255,255,0.35)';
const COLOR_TEXT = '#ffffff';

type SkiaNS = {
  Skia: any;
  matchFont: any;
  ImageFormat: {JPEG: any; PNG: any; WEBP: any};
  FontStyle: {Normal: any; Bold: any; Italic: any};
  PaintStyle: {Fill: any; Stroke: any};
};

let _skiaCache: SkiaNS | null | 0 = 0; // 0 = not tried

function tryLoadSkia(): SkiaNS | null {
  if (_skiaCache !== 0) return _skiaCache as SkiaNS | null;
  try {
    const mod = require('@shopify/react-native-skia');
    _skiaCache = mod as SkiaNS;
    return _skiaCache;
  } catch (err) {
    console.warn('[WM] @shopify/react-native-skia not available (skip watermark):', (err as any)?.message ?? err);
    _skiaCache = null;
    return null;
  }
}

function wrapText(
  text: string,
  maxWidthPx: number,
  font: any,
  S: SkiaNS,
): string[] {
  void S;
  if (!text) return [];
  const paragraphs = text.split(/\r?\n/);
  const out: string[] = [];
  for (const para of paragraphs) {
    if (!para) {
      out.push('');
      continue;
    }
    let cur = '';
    for (const ch of Array.from(para)) {
      const trial = cur + ch;
      const rect = font.measureText(trial);
      const w = (rect as any).width ?? 0;
      if (w > maxWidthPx && cur) {
        out.push(cur);
        cur = ch;
      } else {
        cur = trial;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

function drawRoundRect(
  canvas: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  paint: any,
  S: SkiaNS,
) {
  const host = S.Skia.XYWHRect(x, y, w, h);
  const rr = S.Skia.RRectXY(host, r, r);
  canvas.drawRRect(rr, paint);
}

function buildWatermarkLines(meta: ImageMeta): string[] {
  const lines: string[] = [];
  const location = (meta.location || '').trim();
  if (location) lines.push(location);
  const wp = fileSystemService.buildWaterPipeText(
    meta.waterPipeSpec,
    meta.waterPipeQty,
  );
  if (wp) lines.push(wp);
  const remark = (meta.remark || '').trim();
  if (remark) lines.push(remark);
  return lines;
}

class WatermarkService {
  isSkiaAvailableSync(): boolean {
    return tryLoadSkia() != null;
  }

  hasWatermarkPayload(meta: ImageMeta): boolean {
    return buildWatermarkLines(meta).length > 0;
  }

  private getFont(S: SkiaNS, sizePx: number): any {
    try {
      const fontMgr = S.Skia.FontMgr.System();
      const fontFamily =
        Platform.OS === 'android' ? 'sans-serif' : 'PingFang SC';
      const boldStyle = S.FontStyle.Bold;
      let tf: any = null;
      try {
        tf = fontMgr.matchFamilyStyle(fontFamily, boldStyle);
      } catch {}
      if (!tf) {
        try {
          tf = fontMgr.matchFamilyStyle('sans-serif', boldStyle);
        } catch {}
      }
      if (!tf) {
        return S.matchFont({fontWeight: '700', fontFamily: 'sans-serif'});
      }
      return S.Skia.Font(tf, sizePx);
    } catch (err) {
      console.warn('[WM] getFont fallback', err);
      return S.matchFont({fontWeight: '600', fontFamily: 'sans-serif'});
    }
  }

  private async _loadSourceImage(S: SkiaNS, filePath: string): Promise<any> {
    const cleanPath = filePath.startsWith('file://')
      ? filePath.slice(7)
      : filePath;
    try {
      const b64 = await RNFS.readFile(cleanPath, 'base64');
      const data = S.Skia.Data.fromBase64(b64);
      const img = S.Skia.Image.MakeImageFromEncoded(data);
      if (img) return img;
    } catch (err) {
      console.warn('[WM] MakeImageFromEncoded b64 failed, try uri', err);
    }
    try {
      const uri = cleanPath.startsWith('file://')
        ? cleanPath
        : `file://${cleanPath}`;
      const data = await S.Skia.Data.fromURI(uri);
      const img = S.Skia.Image.MakeImageFromEncoded(data);
      if (img) return img;
    } catch (err) {
      console.warn('[WM] fromURI also failed', err);
    }
    throw new Error('加载原始图片失败');
  }

  async applyWatermarkToImage(meta: ImageMeta): Promise<{
    success: boolean;
    outPath: string;
    skippedReason?: string;
  }> {
    const S = tryLoadSkia();
    if (!S) {
      return {
        success: false,
        outPath: meta.filePath,
        skippedReason: 'RNSkiaModule native not loaded (rebuild Android required)',
      };
    }
    try {
      const srcClean = meta.filePath.startsWith('file://')
        ? meta.filePath.slice(7)
        : meta.filePath;
      const lines = buildWatermarkLines(meta);
      if (lines.length === 0) {
        return {success: false, outPath: meta.filePath, skippedReason: 'no content'};
      }
      const srcImage = await this._loadSourceImage(S, srcClean);
      const iw = srcImage.width();
      const ih = srcImage.height();
      const base = Math.max(iw, ih);
      const scale = base / 1080;
      const fontSize = Math.round(
        WATERMARK_FONT_SIZE_BASE * Math.max(1, scale),
      );
      const lineHeight = Math.round(fontSize * WATERMARK_LINE_HEIGHT_RATIO);
      const font = this.getFont(S, fontSize);
      const maxTextWidth = Math.floor(iw * WATERMARK_MAX_WIDTH_RATIO);
      const wrapped = lines.flatMap(l => wrapText(l, maxTextWidth, font, S));
      if (wrapped.length === 0) {
        return {success: false, outPath: meta.filePath};
      }
      const innerH = wrapped.length * lineHeight;
      const boxH = innerH + WATERMARK_PADDING_Y * 2;
      const boxW = Math.floor(iw * WATERMARK_MAX_WIDTH_RATIO);
      const boxX = WATERMARK_PADDING_X;
      const boxY = ih - boxH - WATERMARK_PADDING_Y;

      const surface = S.Skia.Surface.Make(iw, ih);
      if (!surface) {
        throw new Error('创建 Skia Surface 失败');
      }
      const canvas: any = surface.getCanvas();
      canvas.clear(S.Skia.Color(0x00000000));
      canvas.drawImage(srcImage, 0, 0);

      const bgPaint = S.Skia.Paint();
      bgPaint.setAntiAlias(true);
      bgPaint.setColor(S.Skia.Color(COLOR_BG));
      bgPaint.setStyle(S.PaintStyle.Fill);
      drawRoundRect(
        canvas,
        boxX,
        boxY,
        boxW,
        boxH,
        WATERMARK_CORNER_RADIUS,
        bgPaint,
        S,
      );

      const strokePaint = S.Skia.Paint();
      strokePaint.setAntiAlias(true);
      strokePaint.setColor(S.Skia.Color(COLOR_STROKE));
      strokePaint.setStyle(S.PaintStyle.Stroke);
      strokePaint.setStrokeWidth(2);
      drawRoundRect(
        canvas,
        boxX,
        boxY,
        boxW,
        boxH,
        WATERMARK_CORNER_RADIUS,
        strokePaint,
        S,
      );

      const textPaint = S.Skia.Paint();
      textPaint.setAntiAlias(true);
      textPaint.setColor(S.Skia.Color(COLOR_TEXT));
      const baselineOffset = Math.max(2, Math.floor(fontSize * 0.2));
      wrapped.forEach((line, idx) => {
        const tx = boxX + WATERMARK_PADDING_X;
        const ty =
          boxY +
          WATERMARK_PADDING_Y +
          (idx + 1) * lineHeight -
          baselineOffset;
        canvas.drawText(line || ' ', tx, ty, textPaint, font);
      });

      const snapshot = surface.makeImageSnapshot();
      const ext = (getFileExtension(srcClean) || 'jpg').toLowerCase();
      const srcName =
        srcClean.split(/[\\/]/).pop() || `img_${Date.now()}`;
      const dir = srcClean.split(/[\\/]/).slice(0, -1).join('/');
      const nameNoExt = srcName.replace(/\.[^.]+$/, '');
      const isPng = ext === 'png';
      const outExt = isPng ? 'png' : 'jpg';
      const outName = `${nameNoExt}_mark.${outExt}`;
      const outPath = dir
        ? joinPath(dir, outName)
        : joinPath(RNFS.DocumentDirectoryPath, outName);
      const fmt = isPng ? S.ImageFormat.PNG : S.ImageFormat.JPEG;
      const quality = 92;
      const b64 = snapshot.encodeToBase64(fmt, quality);
      void Platform;
      await RNFS.writeFile(outPath, b64, 'base64');
      return {success: true, outPath};
    } catch (err) {
      console.error('[WM] applyWatermark failed', err);
      return {
        success: false,
        outPath: meta.filePath,
        skippedReason: (err as any)?.message ?? String(err),
      };
    }
  }
}

export const watermarkService = new WatermarkService();
