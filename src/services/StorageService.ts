import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  STORAGE_KEY_DIRECTORIES,
  STORAGE_KEY_IMAGES_PREFIX,
  STORAGE_KEY_LOCATION_AREAS,
  STORAGE_KEY_LOCATION_PARISHES,
  STORAGE_KEY_LOCATION_STREETS,
  STORAGE_KEY_WATER_PIPE_SPECS,
  STORAGE_KEY_COMMON_REMARKS,
  DEFAULT_LOCATION_AREAS,
  DEFAULT_LOCATION_PARISHES,
  DEFAULT_LOCATION_STREETS,
  DEFAULT_WATER_PIPE_SPECS,
  DEFAULT_COMMON_REMARKS,
} from '../constants';
import type {DirectoryNode, ImageMeta} from '../types';

class StorageService {
  private safeParse<T>(value: string | null, fallback: T): T {
    if (!value) {
      return fallback;
    }
    try {
      return JSON.parse(value) as T;
    } catch (err) {
      console.error('[Storage] parse failed', err);
      return fallback;
    }
  }

  async loadDirectories(): Promise<DirectoryNode[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_DIRECTORIES);
      return this.safeParse<DirectoryNode[]>(raw, []);
    } catch (err) {
      console.error('[Storage] loadDirectories failed', err);
      return [];
    }
  }

  async saveDirectories(dirs: DirectoryNode[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_DIRECTORIES, JSON.stringify(dirs));
    } catch (err) {
      console.error('[Storage] saveDirectories failed', err);
      throw err;
    }
  }

  private imagesKey(directoryId: string): string {
    return `${STORAGE_KEY_IMAGES_PREFIX}${directoryId}`;
  }

  async loadImages(directoryId: string): Promise<ImageMeta[]> {
    try {
      const raw = await AsyncStorage.getItem(this.imagesKey(directoryId));
      return this.safeParse<ImageMeta[]>(raw, []);
    } catch (err) {
      console.error('[Storage] loadImages failed', err);
      return [];
    }
  }

  async saveImages(directoryId: string, images: ImageMeta[]): Promise<void> {
    try {
      await AsyncStorage.setItem(
        this.imagesKey(directoryId),
        JSON.stringify(images),
      );
    } catch (err) {
      console.error('[Storage] saveImages failed', err);
      throw err;
    }
  }

  async deleteImagesKey(directoryId: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.imagesKey(directoryId));
    } catch (err) {
      console.error('[Storage] deleteImagesKey failed', err);
    }
  }

  async loadAllImagesMap(): Promise<Record<string, ImageMeta[]>> {
    try {
      const dirs = await this.loadDirectories();
      const result: Record<string, ImageMeta[]> = {};
      for (const d of dirs) {
        result[d.id] = await this.loadImages(d.id);
      }
      return result;
    } catch (err) {
      console.error('[Storage] loadAllImagesMap failed', err);
      return {};
    }
  }

  async loadLocationAreas(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_LOCATION_AREAS);
      const stored = this.safeParse<string[]>(raw, []);
      if (stored.length === 0) return [...DEFAULT_LOCATION_AREAS];
      const unique = new Set([...DEFAULT_LOCATION_AREAS, ...stored]);
      return Array.from(unique);
    } catch (err) {
      console.error('[Storage] loadLocationAreas failed', err);
      return [...DEFAULT_LOCATION_AREAS];
    }
  }

  async saveLocationAreas(areas: string[]): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY_LOCATION_AREAS,
        JSON.stringify(areas),
      );
    } catch (err) {
      console.error('[Storage] saveLocationAreas failed', err);
    }
  }

  async loadLocationParishes(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_LOCATION_PARISHES);
      const stored = this.safeParse<string[]>(raw, []);
      if (stored.length === 0) return [...DEFAULT_LOCATION_PARISHES];
      const unique = new Set([...DEFAULT_LOCATION_PARISHES, ...stored]);
      return Array.from(unique);
    } catch (err) {
      console.error('[Storage] loadLocationParishes failed', err);
      return [...DEFAULT_LOCATION_PARISHES];
    }
  }

  async saveLocationParishes(parishes: string[]): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY_LOCATION_PARISHES,
        JSON.stringify(parishes),
      );
    } catch (err) {
      console.error('[Storage] saveLocationParishes failed', err);
    }
  }

  async loadLocationStreets(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_LOCATION_STREETS);
      const stored = this.safeParse<string[]>(raw, []);
      if (stored.length === 0) return [...DEFAULT_LOCATION_STREETS];
      const unique = new Set([...DEFAULT_LOCATION_STREETS, ...stored]);
      return Array.from(unique);
    } catch (err) {
      console.error('[Storage] loadLocationStreets failed', err);
      return [...DEFAULT_LOCATION_STREETS];
    }
  }

  async saveLocationStreets(streets: string[]): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY_LOCATION_STREETS,
        JSON.stringify(streets),
      );
    } catch (err) {
      console.error('[Storage] saveLocationStreets failed', err);
    }
  }

  async loadWaterPipeSpecs(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_WATER_PIPE_SPECS);
      const stored = this.safeParse<string[]>(raw, []);
      if (stored.length === 0) return [...DEFAULT_WATER_PIPE_SPECS];
      const unique = new Set([...DEFAULT_WATER_PIPE_SPECS, ...stored]);
      return Array.from(unique);
    } catch (err) {
      console.error('[Storage] loadWaterPipeSpecs failed', err);
      return [...DEFAULT_WATER_PIPE_SPECS];
    }
  }

  async saveWaterPipeSpecs(specs: string[]): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY_WATER_PIPE_SPECS,
        JSON.stringify(specs),
      );
    } catch (err) {
      console.error('[Storage] saveWaterPipeSpecs failed', err);
    }
  }

  async loadCommonRemarks(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_COMMON_REMARKS);
      const stored = this.safeParse<string[]>(raw, []);
      if (stored.length === 0) return [...DEFAULT_COMMON_REMARKS];
      const unique = new Set([...DEFAULT_COMMON_REMARKS, ...stored]);
      return Array.from(unique);
    } catch (err) {
      console.error('[Storage] loadCommonRemarks failed', err);
      return [...DEFAULT_COMMON_REMARKS];
    }
  }

  async saveCommonRemarks(remarks: string[]): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY_COMMON_REMARKS,
        JSON.stringify(remarks),
      );
    } catch (err) {
      console.error('[Storage] saveCommonRemarks failed', err);
    }
  }
}

export const storageService = new StorageService();
