import {
  launchCamera,
  launchImageLibrary,
  ImagePickerResponse,
  CameraOptions,
  ImageLibraryOptions,
  Asset,
} from 'react-native-image-picker';
import {Platform} from 'react-native';
import {
  ensureCameraPermission,
  ensureReadPhotoPermission,
} from '../utils/permission';
import {writeCrashLog} from '../utils/crashLog';

const SAVE_TO_SYSTEM_ALBUM = false;

export interface AssetWithAlbum extends Asset {
  albumUri?: string;
}

class MediaService {
  async capturePhoto(): Promise<AssetWithAlbum | null> {
    try {
      const cameraOk = await ensureCameraPermission();
      if (!cameraOk && Platform.OS === 'android') {
        throw new Error('未獲取相機權限');
      }
      const options: CameraOptions = {
        mediaType: 'photo',
        quality: 0.8,
        saveToPhotos: SAVE_TO_SYSTEM_ALBUM && Platform.OS !== 'android',
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
