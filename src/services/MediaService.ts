import {
  launchCamera,
  launchImageLibrary,
  ImagePickerResponse,
  CameraOptions,
  ImageLibraryOptions,
  Asset,
} from 'react-native-image-picker';
import {Platform, TurboModuleRegistry} from 'react-native';
import type {CameraRoll as CameraRollT, PhotoIdentifier} from '@react-native-camera-roll/camera-roll';
import {
  ensureCameraPermission,
  ensureWritePhotoPermission,
  ensureReadPhotoPermission,
} from '../utils/permission';
import {writeCrashLog} from '../utils/crashLog';

const ALBUM_NAME = 'MWRecord';

function lazyCameraRoll(): typeof CameraRollT | null {
  try {
    // 避免顶层 import 触发 TurboModuleRegistry.getEnforcing('RNCCameraRoll') 抛红屏
    const {CameraRoll} = require('@react-native-camera-roll/camera-roll') as {
      CameraRoll: typeof CameraRollT;
    };
    return CameraRoll;
  } catch (err) {
    void writeCrashLog('WARN', 'Media:lazyCameraRoll:fail', err);
    return null;
  }
}

function isCameraRollNativeReady(): {ready: boolean; reason?: string} {
  try {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      const anyTurbo: any = TurboModuleRegistry;
      if (!anyTurbo || typeof anyTurbo.getEnforcing !== 'function') {
        return {ready: false, reason: 'TurboModuleRegistry unavailable'};
      }
      const mod: any = anyTurbo.getEnforcing('RNCCameraRoll');
      if (mod == null) {
        return {ready: false, reason: 'RNCCameraRoll null (native not registered. need react-native run-android?)'};
      }
      return {ready: true};
    }
    return {ready: false, reason: 'not android/ios'};
  } catch (err) {
    return {ready: false, reason: `getEnforcing(RNCCameraRoll) threw: ${(err as any)?.message ?? err}`};
  }
}

export interface AssetWithAlbum extends Asset {
  albumUri?: string;
}

const assetFromPhotoIdentifier = (
  src: Asset,
  ident: PhotoIdentifier,
): AssetWithAlbum => {
  let albumUri: string | undefined;
  try {
    const nodeAny: any = (ident as any).node;
    if (typeof (nodeAny?.image?.uri) === 'string') albumUri = nodeAny.image.uri;
    else if (typeof (nodeAny?.uri) === 'string') albumUri = nodeAny.uri;
  } catch (e) {
    void writeCrashLog('INFO', 'Media:assetFromPhotoIdentifier:parse', e);
  }
  return {...src, albumUri};
};

class MediaService {
  private async ensureWriteAsset(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        return await ensureWritePhotoPermission();
      }
      return true;
    } catch (e) {
      void writeCrashLog('WARN', 'Media:ensureWriteAsset:fail', e);
      return false;
    }
  }

  private async saveAssetToMWRecordAlbum(sourceUri: string): Promise<PhotoIdentifier | null> {
    if (!sourceUri) return null;
    try {
      const CameraRoll = lazyCameraRoll();
      if (!CameraRoll) {
        void writeCrashLog(
          'WARN',
          'Media:saveAsset:null-CameraRoll',
          'lazy require failed, skip MWRecord album (photo still saved to MWRecord directory)',
        );
        return null;
      }
      const {ready, reason} = isCameraRollNativeReady();
      if (!ready) {
        void writeCrashLog(
          'WARN',
          'Media:saveAsset:native-not-ready',
          reason || 'unknown',
        );
        return null;
      }
      const writeOk = await this.ensureWriteAsset();
      if (!writeOk) {
        void writeCrashLog(
          'WARN',
          'Media:saveAsset:perm-denied',
          'ensureWritePhotoPermission false, skip album save (MWRecord directory save still works)',
        );
        return null;
      }
      try {
        const id = await CameraRoll.saveAsset(sourceUri, {
          type: 'photo',
          album: ALBUM_NAME,
        });
        return id;
      } catch (err) {
        void writeCrashLog('WARN', 'Media:CameraRoll.saveAsset(album) fallback', err);
        try {
          const id = await CameraRoll.saveAsset(sourceUri, {type: 'photo'});
          return id;
        } catch (err2) {
          void writeCrashLog('WARN', 'Media:CameraRoll.saveAsset default also failed', err2);
          return null;
        }
      }
    } catch (err) {
      void writeCrashLog('WARN', 'Media:saveAssetToMWRecordAlbum:fatal', err);
      return null;
    }
  }

  async capturePhoto(): Promise<AssetWithAlbum | null> {
    try {
      const cameraOk = await ensureCameraPermission();
      if (!cameraOk && Platform.OS === 'android') {
        throw new Error('未獲取相機權限');
      }
      const options: CameraOptions = {
        mediaType: 'photo',
        quality: 0.8,
        saveToPhotos: Platform.OS !== 'android',
        includeExtra: false,
      };
      const res: ImagePickerResponse = await launchCamera(options);
      if (res.didCancel) {
        return null;
      }
      if (res.errorCode) {
        throw new Error(res.errorMessage || '拍照失敗');
      }
      const asset = res.assets && res.assets[0];
      if (!asset || !asset.uri) return null;
      const ident = await this.saveAssetToMWRecordAlbum(asset.uri);
      if (ident) return assetFromPhotoIdentifier(asset, ident);
      return asset;
    } catch (err) {
      void writeCrashLog('ERROR', 'Media:capturePhoto:fail', err);
      throw err;
    }
  }

  async pickFromLibrary(): Promise<AssetWithAlbum[] | null> {
    try {
      const {granted} = await ensureReadPhotoPermission();
      if (!granted && Platform.OS === 'android') {
        throw new Error('未獲取相冊權限');
      }
      const options: ImageLibraryOptions = {
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 9,
        includeExtra: false,
      };
      const res: ImagePickerResponse = await launchImageLibrary(options);
      if (res.didCancel) {
        return null;
      }
      if (res.errorCode) {
        throw new Error(res.errorMessage || '選擇圖片失敗');
      }
      return (res.assets || []) as AssetWithAlbum[];
    } catch (err) {
      void writeCrashLog('ERROR', 'Media:pickFromLibrary:fail', err);
      throw err;
    }
  }
}

export const mediaService = new MediaService();
