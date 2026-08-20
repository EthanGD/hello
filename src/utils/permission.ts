import {Linking, PermissionsAndroid, Platform} from 'react-native';
import {getLegacyPublicRootDir} from './path';
import {writeCrashLog} from './crashLog';

const PA = PermissionsAndroid as any;

const HARDCODED_FALLBACK: Record<string, string> = {
  MANAGE_EXTERNAL_STORAGE: 'android.permission.MANAGE_EXTERNAL_STORAGE',
  READ_MEDIA_IMAGES: 'android.permission.READ_MEDIA_IMAGES',
  READ_MEDIA_VISUAL_USER_SELECTED: 'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
  WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
  CAMERA: 'android.permission.CAMERA',
};

const safeGetPermission = (name: string): string | null => {
  try {
    const map = PA && PA.PERMISSIONS;
    const v = map ? map[name] : undefined;
    if (typeof v === 'string' && v.length > 0) return v;
    const fallback = HARDCODED_FALLBACK[name];
    if (typeof fallback === 'string' && fallback.length > 0) {
      void writeCrashLog(
        'INFO',
        'Perm:safeGetPermission:fallback',
        {name, fallback, missedBecause: v == null ? String(v) : `type:${typeof v}`},
      );
      return fallback;
    }
    void writeCrashLog(
      'WARN',
      'Perm:safeGetPermission:missing',
      {name, actualType: typeof v, actual: v == null ? String(v) : String(v).slice(0, 80)},
    );
    return null;
  } catch (e) {
    void writeCrashLog('WARN', 'Perm:safeGetPermission:catch', {name, err: e});
    const fallback2 = HARDCODED_FALLBACK[name];
    return fallback2 && fallback2.length > 0 ? fallback2 : null;
  }
};

const safeCheckPermission = async (permOrNull: string | null): Promise<boolean> => {
  if (!permOrNull) return false;
  try {
    const raw = await (PermissionsAndroid as any).check(permOrNull);
    if (raw == null) return false;
    if (typeof raw === 'boolean') return raw;
    return raw === PermissionsAndroid.RESULTS.GRANTED || String(raw).toLowerCase() === 'granted';
  } catch (e) {
    void writeCrashLog('WARN', 'Perm:safeCheckPermission:catch', {perm: permOrNull, err: e});
    return false;
  }
};

const safeRequestSinglePermission = async (
  permOrNull: string | null,
  rationale?: any,
): Promise<string> => {
  if (!permOrNull) return PermissionsAndroid.RESULTS.DENIED;
  try {
    const P = PermissionsAndroid as any;
    const res = rationale
      ? await P.request(permOrNull, rationale)
      : await P.request(permOrNull);
    return typeof res === 'string' ? res : PermissionsAndroid.RESULTS.DENIED;
  } catch (e) {
    void writeCrashLog('WARN', 'Perm:safeRequestSingle:catch', {perm: permOrNull, err: e});
    return PermissionsAndroid.RESULTS.DENIED;
  }
};

const safeRequestMultiplePermissions = async (
  perms: (string | null)[],
): Promise<Record<string, string>> => {
  const clean = perms.filter((p): p is string => !!p);
  if (clean.length === 0) return {};
  try {
    const P = PermissionsAndroid as any;
    const res = await P.requestMultiple(clean);
    const out: Record<string, string> = {};
    for (const p of clean) {
      const v = (res as any)?.[p];
      out[p] = typeof v === 'string' ? v : PermissionsAndroid.RESULTS.DENIED;
    }
    return out;
  } catch (e) {
    void writeCrashLog('WARN', 'Perm:safeRequestMultiple:catch', {perms: clean, err: e});
    const fallback: Record<string, string> = {};
    clean.forEach(p => { fallback[p] = PermissionsAndroid.RESULTS.DENIED; });
    return fallback;
  }
};

export const isAndroidAtLeast = (sdk: number): boolean => {
  if (Platform.OS !== 'android') return false;
  try {
    return (Platform.Version as number) >= sdk;
  } catch {
    return false;
  }
}

export async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const perm = safeGetPermission('CAMERA');
    const granted = await safeRequestSinglePermission(perm, {
      title: '相機權限',
      message: '需要使用相機拍照',
      buttonPositive: '允許',
      buttonNegative: '拒絕',
      buttonNeutral: '稍後',
    });
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    void writeCrashLog('WARN', 'Perm:ensureCameraPermission:catch', err);
    return false;
  }
}

export async function ensureReadPhotoPermission(): Promise<{
  granted: boolean;
  partial: boolean;
}> {
  if (Platform.OS !== 'android') return {granted: true, partial: false};
  try {
    if (isAndroidAtLeast(33)) {
      const permImages = safeGetPermission('READ_MEDIA_IMAGES');
      const permSelected = safeGetPermission('READ_MEDIA_VISUAL_USER_SELECTED');
      const res = await safeRequestMultiplePermissions([permImages, permSelected]);
      const imgGranted = permImages
        ? res[permImages] === PermissionsAndroid.RESULTS.GRANTED
        : false;
      const selGranted = permSelected
        ? res[permSelected] === PermissionsAndroid.RESULTS.GRANTED
        : false;
      return {granted: imgGranted || selGranted, partial: selGranted && !imgGranted};
    }
    const permRead = safeGetPermission('READ_EXTERNAL_STORAGE');
    const permWrite = safeGetPermission('WRITE_EXTERNAL_STORAGE');
    const res = await safeRequestMultiplePermissions([permRead, permWrite]);
    const rOk = permRead
      ? res[permRead] === PermissionsAndroid.RESULTS.GRANTED
      : true;
    const wOk = permWrite
      ? res[permWrite] === PermissionsAndroid.RESULTS.GRANTED
      : true;
    return {granted: rOk && wOk, partial: false};
  } catch (err) {
    void writeCrashLog('WARN', 'Perm:ensureReadPhotoPermission:catch', err);
    return {granted: false, partial: false};
  }
}

export async function ensureWritePhotoPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const rationale = {
      title: '相冊權限',
      message: '需要將拍照的照片保存到「MWRecord」相冊文件夾',
      buttonPositive: '允許',
      buttonNegative: '拒絕',
      buttonNeutral: '稍後',
    };
    if (isAndroidAtLeast(33)) {
      const perm = safeGetPermission('READ_MEDIA_IMAGES');
      const granted = await safeRequestSinglePermission(perm, rationale);
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    const perm = safeGetPermission('WRITE_EXTERNAL_STORAGE');
    const granted = await safeRequestSinglePermission(perm, rationale);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    void writeCrashLog('WARN', 'Perm:ensureWritePhotoPermission:catch', err);
    return false;
  }
}

export async function hasAllFilesAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const perm = safeGetPermission('MANAGE_EXTERNAL_STORAGE');
    if (!perm) {
      void writeCrashLog(
        'WARN',
        'Perm:hasAllFilesAccess:MANAGE_EXTERNAL_STORAGE-missing',
        'PermissionsAndroid.PERMISSIONS.MANAGE_EXTERNAL_STORAGE not defined on this RN version / device. Falling back to check via Environment / intent.',
      );
      return false;
    }
    const rawResult = await (PermissionsAndroid as any).check(perm).catch((e: any) => {
      void writeCrashLog('WARN', 'Perm:hasAllFilesAccess:check-catch', e);
      return null as any;
    });
    if (rawResult == null) {
      void writeCrashLog(
        'WARN',
        'Perm:hasAllFilesAccess:null',
        'PermissionsAndroid.check returned null/undefined (unknown). Treating as false.',
      );
      return false;
    }
    if (typeof rawResult === 'boolean') return rawResult;
    const normalized = rawResult === PermissionsAndroid.RESULTS.GRANTED ||
      rawResult === true ||
      String(rawResult).toLowerCase() === 'granted';
    void writeCrashLog(
      'INFO',
      'Perm:hasAllFilesAccess:non-bool',
      {rawResult, type: typeof rawResult, normalized},
    );
    return normalized;
  } catch (err) {
    void writeCrashLog('WARN', 'Perm:hasAllFilesAccess:error', err);
    return false;
  }
}

export async function openAllFilesAccessSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const pkgName = (Platform as any)?.constants?.bundleId || 'com.mwrecord';
    const intentAction = 'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION';
    await Linking.openURL(`package:${pkgName}`).catch(async () => {
      await Linking.openSettings();
    });
    await Linking.sendIntent(intentAction, [
      {key: 'android.intent.extra.PACKAGE_NAME', value: pkgName},
    ]).catch(async () => {
      await Linking.openSettings().catch(() => undefined);
    });
  } catch {
    await Linking.openSettings().catch(() => undefined);
  }
}

export async function ensureAllFilesAccess(
  explain?: string,
): Promise<{granted: boolean; publicDir: string | null}> {
  const publicDir = getLegacyPublicRootDir();
  const ok = await hasAllFilesAccess();
  return {granted: ok, publicDir};
}

export default {
  isAndroidAtLeast,
  ensureCameraPermission,
  ensureReadPhotoPermission,
  ensureWritePhotoPermission,
  hasAllFilesAccess,
  openAllFilesAccessSettings,
  ensureAllFilesAccess,
};
