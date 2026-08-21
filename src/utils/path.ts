import {Platform} from 'react-native';
import RNFS from 'react-native-fs';
import {APP_DIR_NAME} from '../constants';

export const joinPath = (...parts: string[]): string => {
  const cleaned = parts.filter(p => p && p.length > 0);
  if (cleaned.length === 0) {
    return '';
  }
  const separator = Platform.OS === 'windows' ? '\\' : '/';
  let result = cleaned.join(separator);
  result = result.replace(/[\\/]+/g, separator);
  return result;
};

export const getOldAppRootDir = (): string => {
  const base = RNFS.DocumentDirectoryPath;
  return joinPath(base, APP_DIR_NAME);
};

export const getLegacyPublicRootDir = (): string | null => {
  if (Platform.OS !== 'android') return null;
  if (!RNFS.ExternalStorageDirectoryPath) return null;
  return joinPath(RNFS.ExternalStorageDirectoryPath, APP_DIR_NAME);
};

export const getAppRootDir = (): string => {
  if (Platform.OS === 'android') {
    if (RNFS.ExternalDirectoryPath) {
      return joinPath(RNFS.ExternalDirectoryPath, APP_DIR_NAME);
    }
    if (RNFS.ExternalStorageDirectoryPath) {
      return joinPath(RNFS.ExternalStorageDirectoryPath, APP_DIR_NAME);
    }
    return joinPath(RNFS.DocumentDirectoryPath, APP_DIR_NAME);
  }
  if (Platform.OS === 'ios' && RNFS.LibraryDirectoryPath) {
    return joinPath(RNFS.LibraryDirectoryPath, APP_DIR_NAME);
  }
  return joinPath(RNFS.DocumentDirectoryPath, APP_DIR_NAME);
};

export const getSafeFileName = (name: string): string => {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || `unnamed_${Date.now()}`;
};

export const getFileExtension = (uri: string): string => {
  const clean = uri.split('?')[0];
  const match = clean.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : 'jpg';
};

export interface UiFriendlyPath {
  primary: string;
  secondary: string;
  storageLabel: string;
}

const EXTERNAL_STORAGE_ROOT = '/storage/emulated/0';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const toUiFriendlyPath = (absolutePath: string): UiFriendlyPath => {
  const abs = (absolutePath || '').trim();
  const storageLabel = '內部存儲';
  if (!abs) {
    return {primary: '-', secondary: '-', storageLabel};
  }
  const isExtRoot =
    abs === EXTERNAL_STORAGE_ROOT ||
    abs.startsWith(EXTERNAL_STORAGE_ROOT + '/') ||
    abs.startsWith(EXTERNAL_STORAGE_ROOT + '\\');
  if (!isExtRoot) {
    return {primary: abs, secondary: abs, storageLabel};
  }
  const suffix = abs
    .slice(EXTERNAL_STORAGE_ROOT.length)
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, '/');
  if (!suffix) {
    return {primary: storageLabel, secondary: abs, storageLabel};
  }
  const parts = suffix.split('/').filter(Boolean);
  const visibleParts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    visibleParts.push(p);
  }
  const friendlyTail = visibleParts.join(' › ');
  const primary = friendlyTail
    ? `${storageLabel} › ${friendlyTail}`
    : storageLabel;
  return {primary, secondary: abs, storageLabel};
};

export const highlightSubDirInFriendly = (
  friendly: string,
  subDirName: string | null | undefined,
): string => {
  if (!subDirName) return friendly;
  const needle = ` › ${subDirName}`;
  if (friendly.endsWith(needle)) return friendly;
  const sub = String(subDirName).trim();
  if (!sub) return friendly;
  return `${friendly} › ${sub}`;
};

export const tryLocateExternalStoragePrefixLabel = (abs: string): string => {
  const a = (abs || '').replace(/\\/g, '/');
  if (a.startsWith('/storage/emulated/0')) return '內部存儲';
  if (a.startsWith('/sdcard')) return 'SD 卡 (已模擬)';
  return '存儲';
};

export {escapeRegex as _escapeRegexForPath};
