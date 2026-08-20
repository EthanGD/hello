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
