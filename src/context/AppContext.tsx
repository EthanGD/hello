import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import type {ReactNode} from 'react';
import {fileSystemService} from '../services/FileSystemService';
import {storageService} from '../services/StorageService';
import {mediaService} from '../services/MediaService';
import type {AppState, AppAction, DirectoryNode, ImageMeta} from '../types';
import {generateId, nowTimestamp} from '../utils/id';
import {getAppRootDir} from '../utils/path';
import {
  DEFAULT_LOCATION_AREAS,
  DEFAULT_LOCATION_PARISHES,
  DEFAULT_LOCATION_STREETS,
  DEFAULT_WATER_PIPE_SPECS,
  DEFAULT_COMMON_REMARKS,
} from '../constants';
import type {Asset} from 'react-native-image-picker';
import {writeCrashLog} from '../utils/crashLog';

const INIT_TIMEOUT_MS = 8000;
let _initSingletonPromise: Promise<void> | null = null;

const initialState: AppState = {
  directories: [],
  images: {},
  locationAreas: [...DEFAULT_LOCATION_AREAS],
  locationParishes: [...DEFAULT_LOCATION_PARISHES],
  locationStreets: [...DEFAULT_LOCATION_STREETS],
  waterPipeSpecs: [...DEFAULT_WATER_PIPE_SPECS],
  commonRemarks: [...DEFAULT_COMMON_REMARKS],
  loading: true,
};

const collectChildIds = (
  dirs: DirectoryNode[],
  parentId: string,
  acc: string[] = [],
): string[] => {
  for (const d of dirs) {
    if (d.parentId === parentId) {
      acc.push(d.id);
      collectChildIds(dirs, d.id, acc);
    }
  }
  return acc;
};

const reducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'LOAD_DATA':
      return {
        ...state,
        directories: action.payload.directories,
        images: action.payload.images,
        locationAreas: action.payload.locationAreas,
        locationParishes: action.payload.locationParishes,
        locationStreets: action.payload.locationStreets,
        waterPipeSpecs: action.payload.waterPipeSpecs,
        commonRemarks: action.payload.commonRemarks,
        loading: false,
      };
    case 'SET_LOADING':
      return {...state, loading: action.payload};
    case 'CREATE_DIR':
      return {...state, directories: [...state.directories, action.payload]};
    case 'RENAME_DIR': {
      const {id, name, path: newParentPath, updatedAt} = action.payload;
      const idToNewPath: Record<string, string> = {[id]: newParentPath};
      const queue: string[] = [id];
      while (queue.length > 0) {
        const curId = queue.shift() as string;
        const children = state.directories.filter(d => d.parentId === curId);
        for (const c of children) {
          const parentNewPath = idToNewPath[curId];
          if (parentNewPath) {
            const newChildPath = `${parentNewPath}/${c.name}`;
            idToNewPath[c.id] = newChildPath;
            queue.push(c.id);
          }
        }
      }
      const newDirs = state.directories.map(d => {
        if (d.id === id) {
          return {...d, name, path: newParentPath, updatedAt};
        }
        if (idToNewPath[d.id] && idToNewPath[d.id] !== d.path) {
          return {...d, path: idToNewPath[d.id], updatedAt};
        }
        return d;
      });
      return {...state, directories: newDirs};
    }
    case 'DELETE_DIR': {
      const removeIds = new Set([
        action.payload.id,
        ...action.payload.childIds,
      ]);
      const newDirs = state.directories.filter(d => !removeIds.has(d.id));
      const newImages: Record<string, ImageMeta[]> = {...state.images};
      removeIds.forEach(rid => {
        delete newImages[rid];
      });
      return {...state, directories: newDirs, images: newImages};
    }
    case 'ADD_IMAGE': {
      const prev = state.images[action.payload.directoryId] || [];
      return {
        ...state,
        images: {
          ...state.images,
          [action.payload.directoryId]: [...prev, action.payload],
        },
      };
    }
    case 'UPDATE_IMAGE': {
      const list = state.images[action.payload.directoryId] || [];
      const updated = list.map(img =>
        img.id === action.payload.id
          ? {...img, ...action.payload.changes, updatedAt: nowTimestamp()}
          : img,
      );
      return {
        ...state,
        images: {...state.images, [action.payload.directoryId]: updated},
      };
    }
    case 'REPLACE_IMAGE_FILE_PATH': {
      const list = state.images[action.payload.directoryId] || [];
      const updated = list.map(img =>
        img.id === action.payload.id
          ? {
              ...img,
              filePath: action.payload.filePath,
              fileName:
                action.payload.filePath.split(/[\\/]/).pop() || img.fileName,
              hasWatermark: true,
              updatedAt: nowTimestamp(),
            }
          : img,
      );
      return {
        ...state,
        images: {...state.images, [action.payload.directoryId]: updated},
      };
    }
    case 'DELETE_IMAGE': {
      const list = state.images[action.payload.directoryId] || [];
      const filtered = list.filter(img => img.id !== action.payload.id);
      return {
        ...state,
        images: {...state.images, [action.payload.directoryId]: filtered},
      };
    }
    case 'ADD_LOCATION_AREA': {
      const v = action.payload.trim();
      if (!v || state.locationAreas.includes(v)) return state;
      return {...state, locationAreas: [...state.locationAreas, v]};
    }
    case 'ADD_LOCATION_PARISH': {
      const v = action.payload.trim();
      if (!v || state.locationParishes.includes(v)) return state;
      return {...state, locationParishes: [...state.locationParishes, v]};
    }
    case 'ADD_LOCATION_STREET': {
      const v = action.payload.trim();
      if (!v || state.locationStreets.includes(v)) return state;
      return {...state, locationStreets: [...state.locationStreets, v]};
    }
    case 'ADD_WATER_PIPE_SPEC': {
      const v = action.payload.trim();
      if (!v || state.waterPipeSpecs.includes(v)) return state;
      return {...state, waterPipeSpecs: [...state.waterPipeSpecs, v]};
    }
    case 'ADD_COMMON_REMARK': {
      const v = action.payload.trim();
      if (!v || state.commonRemarks.includes(v)) return state;
      return {...state, commonRemarks: [...state.commonRemarks, v]};
    }
    default:
      return state;
  }
};

interface AppContextValue {
  state: AppState;
  initialize: () => Promise<void>;
  createDirectory: (
    parentId: string | null,
    name: string,
  ) => Promise<DirectoryNode>;
  renameDirectory: (id: string, newName: string) => Promise<void>;
  deleteDirectory: (id: string) => Promise<void>;
  addImageFromCamera: (directoryId: string) => Promise<ImageMeta | null>;
  addImagesFromLibrary: (directoryId: string) => Promise<ImageMeta[]>;
  updateImageMeta: (
    directoryId: string,
    imageId: string,
    changes: Partial<ImageMeta>,
  ) => Promise<void>;
  replaceImageFilePath: (
    directoryId: string,
    imageId: string,
    newFilePath: string,
    overrides?: Partial<ImageMeta>,
  ) => Promise<void>;
  deleteImage: (directoryId: string, imageId: string) => Promise<void>;
  getPathBreadcrumb: (directoryId: string | null) => DirectoryNode[];
  addLocationArea: (value: string) => void;
  addLocationParish: (value: string) => void;
  addLocationStreet: (value: string) => void;
  addWaterPipeSpec: (value: string) => void;
  addCommonRemark: (value: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{children: ReactNode}> = ({children}) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const initialize = useCallback(async () => {
    if (_initSingletonPromise) {
      return _initSingletonPromise;
    }
    const runner = async () => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        dispatch({type: 'SET_LOADING', payload: true});

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            void writeCrashLog(
              'ERROR',
              'AppContext:initialize:timeout',
              `exceeded ${INIT_TIMEOUT_MS}ms, fallback to defaults`,
            );
            reject(new Error(`initialize timeout after ${INIT_TIMEOUT_MS}ms`));
          }, INIT_TIMEOUT_MS);
        });

        const mainPromise = (async () => {
          await fileSystemService.initialize();
          const directories = await storageService.loadDirectories();
          const imagesMap = await storageService.loadAllImagesMap();
          const locationAreas = await storageService.loadLocationAreas();
          const locationParishes = await storageService.loadLocationParishes();
          const locationStreets = await storageService.loadLocationStreets();
          const waterPipeSpecs = await storageService.loadWaterPipeSpecs();
          const commonRemarks = await storageService.loadCommonRemarks();
          return {
            directories,
            images: imagesMap,
            locationAreas,
            locationParishes,
            locationStreets,
            waterPipeSpecs,
            commonRemarks,
          };
        })();

        const payload = await Promise.race([mainPromise, timeoutPromise]);
        dispatch({type: 'LOAD_DATA', payload});
      } catch (err) {
        void writeCrashLog('ERROR', 'AppContext:initialize:failed', err);
        dispatch({
          type: 'LOAD_DATA',
          payload: {
            directories: [],
            images: {},
            locationAreas: [...DEFAULT_LOCATION_AREAS],
            locationParishes: [...DEFAULT_LOCATION_PARISHES],
            locationStreets: [...DEFAULT_LOCATION_STREETS],
            waterPipeSpecs: [...DEFAULT_WATER_PIPE_SPECS],
            commonRemarks: [...DEFAULT_COMMON_REMARKS],
          },
        });
      } finally {
        if (timeoutId != null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
    };
    _initSingletonPromise = runner();
    try {
      await _initSingletonPromise;
    } finally {
      _initSingletonPromise = null;
    }
  }, []);

  useEffect(() => {
    initialize().catch(() => undefined);
  }, [initialize]);

  useEffect(() => {
    if (state.loading) {
      return;
    }
    storageService.saveDirectories(state.directories).catch(() => undefined);
  }, [state.directories, state.loading]);

  useEffect(() => {
    if (state.loading) {
      return;
    }
    Object.keys(state.images).forEach(dirId => {
      storageService
        .saveImages(dirId, state.images[dirId] || [])
        .catch(() => undefined);
    });
  }, [state.images, state.loading]);

  useEffect(() => {
    if (state.loading) return;
    storageService.saveLocationAreas(state.locationAreas).catch(() => undefined);
  }, [state.locationAreas, state.loading]);

  useEffect(() => {
    if (state.loading) return;
    storageService
      .saveLocationParishes(state.locationParishes)
      .catch(() => undefined);
  }, [state.locationParishes, state.loading]);

  useEffect(() => {
    if (state.loading) return;
    storageService
      .saveLocationStreets(state.locationStreets)
      .catch(() => undefined);
  }, [state.locationStreets, state.loading]);

  useEffect(() => {
    if (state.loading) return;
    storageService
      .saveWaterPipeSpecs(state.waterPipeSpecs)
      .catch(() => undefined);
  }, [state.waterPipeSpecs, state.loading]);

  useEffect(() => {
    if (state.loading) return;
    storageService
      .saveCommonRemarks(state.commonRemarks)
      .catch(() => undefined);
  }, [state.commonRemarks, state.loading]);

  const createDirectory = useCallback(
    async (parentId: string | null, name: string): Promise<DirectoryNode> => {
      let parentPath: string | null = getAppRootDir();
      if (parentId) {
        const parent = state.directories.find(d => d.id === parentId);
        if (!parent) {
          throw new Error('上級目錄不存在');
        }
        parentPath = parent.path;
      } else {
        parentPath = getAppRootDir();
      }
      const {node} = await fileSystemService.createDirectory(parentPath, name);
      const finalNode: DirectoryNode = {...node, parentId};
      dispatch({type: 'CREATE_DIR', payload: finalNode});
      return finalNode;
    },
    [state.directories],
  );

  const renameDirectory = useCallback(
    async (id: string, newName: string) => {
      const target = state.directories.find(d => d.id === id);
      if (!target) {
        throw new Error('目錄不存在');
      }
      const {newPath} = await fileSystemService.renameDirectory(
        target.path,
        newName,
      );
      dispatch({
        type: 'RENAME_DIR',
        payload: {
          id,
          name: newName.split(/[\\/]/).pop() || newName,
          path: newPath,
          updatedAt: nowTimestamp(),
        },
      });
    },
    [state.directories],
  );

  const deleteDirectory = useCallback(
    async (id: string) => {
      const target = state.directories.find(d => d.id === id);
      if (!target) {
        throw new Error('目錄不存在');
      }
      const childIds = collectChildIds(state.directories, id);
      await fileSystemService.deleteDirectory(target.path);
      childIds.forEach(cid =>
        storageService.deleteImagesKey(cid).catch(() => undefined),
      );
      storageService.deleteImagesKey(id).catch(() => undefined);
      dispatch({type: 'DELETE_DIR', payload: {id, childIds}});
    },
    [state.directories],
  );

  const addImageFromAsset = useCallback(
    async (directoryId: string, asset: Asset): Promise<ImageMeta | null> => {
      const uri = asset.uri;
      if (!uri) {
        return null;
      }
      const dir = state.directories.find(d => d.id === directoryId);
      if (!dir) {
        throw new Error('目錄不存在');
      }
      const {fileName, filePath} = await fileSystemService.saveImageToDirectory(
        uri,
        dir.path,
      );
      const now = nowTimestamp();
      const meta: ImageMeta = {
        id: generateId(),
        directoryId,
        fileName,
        filePath,
        originFilePath: filePath,
        originFileName: fileName,
        remark: '',
        location: '',
        locationArea: '',
        locationParish: '',
        locationStreet: '',
        locationHouseNumber: '',
        waterPipeSpec: undefined,
        waterPipeQty: undefined,
        hasWatermark: false,
        createdAt: now,
        updatedAt: now,
      };
      dispatch({type: 'ADD_IMAGE', payload: meta});
      try {
        await fileSystemService.upsertImageExportItem(meta);
      } catch (err) {
        writeCrashLog('ERROR', 'APP:addImageFromAsset:upsert:fail', err);
      }
      return meta;
    },
    [state.directories],
  );

  const addImageFromCamera = useCallback(
    async (directoryId: string): Promise<ImageMeta | null> => {
      const asset = await mediaService.capturePhoto();
      if (!asset) {
        return null;
      }
      return addImageFromAsset(directoryId, asset);
    },
    [addImageFromAsset],
  );

  const addImagesFromLibrary = useCallback(
    async (directoryId: string): Promise<ImageMeta[]> => {
      const assets = await mediaService.pickFromLibrary();
      if (!assets || assets.length === 0) {
        return [];
      }
      const result: ImageMeta[] = [];
      for (const a of assets) {
        const m = await addImageFromAsset(directoryId, a);
        if (m) {
          result.push(m);
        }
      }
      return result;
    },
    [addImageFromAsset],
  );

  const updateImageMeta = useCallback(
    async (
      directoryId: string,
      imageId: string,
      changes: Partial<ImageMeta>,
    ) => {
      const list = state.images[directoryId] || [];
      const current = list.find(img => img.id === imageId);
      const merged: ImageMeta | null = current
        ? {
            ...current,
            ...changes,
            updatedAt: nowTimestamp(),
          }
        : null;
      dispatch({
        type: 'UPDATE_IMAGE',
        payload: {id: imageId, directoryId, changes},
      });
      if (merged) {
        try {
          await fileSystemService.upsertImageExportItem(merged);
        } catch (err) {
          writeCrashLog('ERROR', 'APP:updateImageMeta:upsert:fail', err);
        }
      }
    },
    [state.images],
  );

  const replaceImageFilePath = useCallback(
    async (
      directoryId: string,
      imageId: string,
      newFilePath: string,
      overrides?: Partial<ImageMeta>,
    ) => {
      const list = state.images[directoryId] || [];
      const current = list.find(img => img.id === imageId);
      const merged: ImageMeta | null = current
        ? {
            ...current,
            ...(overrides || {}),
            filePath: newFilePath,
            fileName:
              newFilePath.split(/[\\/]/).pop() || current.fileName,
            hasWatermark: true,
            updatedAt: nowTimestamp(),
          }
        : null;
      dispatch({
        type: 'REPLACE_IMAGE_FILE_PATH',
        payload: {id: imageId, directoryId, filePath: newFilePath},
      });
      if (merged) {
        try {
          await fileSystemService.upsertImageExportItem(merged);
        } catch (err) {
          writeCrashLog('ERROR', 'APP:replaceImageFilePath:upsert:fail', err);
        }
      }
    },
    [state.images],
  );

  const deleteImage = useCallback(
    async (directoryId: string, imageId: string) => {
      const list = state.images[directoryId] || [];
      const img = list.find(x => x.id === imageId);
      if (img) {
        await fileSystemService.deleteImage(img.filePath);
      }
      dispatch({type: 'DELETE_IMAGE', payload: {id: imageId, directoryId}});
      fileSystemService.removeImageExportItem(imageId).catch(() => undefined);
    },
    [state.images],
  );

  const getPathBreadcrumb = useCallback(
    (directoryId: string | null): DirectoryNode[] => {
      const result: DirectoryNode[] = [];
      let currentId: string | null = directoryId;
      const visited = new Set<string>();
      while (currentId) {
        if (visited.has(currentId)) {
          break;
        }
        visited.add(currentId);
        const node = state.directories.find(d => d.id === currentId);
        if (!node) {
          break;
        }
        result.unshift(node);
        currentId = node.parentId;
      }
      return result;
    },
    [state.directories],
  );

  const addLocationArea = useCallback((value: string) => {
    dispatch({type: 'ADD_LOCATION_AREA', payload: value});
  }, []);

  const addLocationParish = useCallback((value: string) => {
    dispatch({type: 'ADD_LOCATION_PARISH', payload: value});
  }, []);

  const addLocationStreet = useCallback((value: string) => {
    dispatch({type: 'ADD_LOCATION_STREET', payload: value});
  }, []);

  const addWaterPipeSpec = useCallback((value: string) => {
    dispatch({type: 'ADD_WATER_PIPE_SPEC', payload: value});
  }, []);

  const addCommonRemark = useCallback((value: string) => {
    dispatch({type: 'ADD_COMMON_REMARK', payload: value});
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      initialize,
      createDirectory,
      renameDirectory,
      deleteDirectory,
      addImageFromCamera,
      addImagesFromLibrary,
      updateImageMeta,
      replaceImageFilePath,
      deleteImage,
      getPathBreadcrumb,
      addLocationArea,
      addLocationParish,
      addLocationStreet,
      addWaterPipeSpec,
      addCommonRemark,
    }),
    [
      state,
      initialize,
      createDirectory,
      renameDirectory,
      deleteDirectory,
      addImageFromCamera,
      addImagesFromLibrary,
      updateImageMeta,
      replaceImageFilePath,
      deleteImage,
      getPathBreadcrumb,
      addLocationArea,
      addLocationParish,
      addLocationStreet,
      addWaterPipeSpec,
      addCommonRemark,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within AppProvider');
  }
  return ctx;
};
