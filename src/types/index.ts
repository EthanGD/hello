export interface DirectoryNode {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ImageMeta {
  id: string;
  directoryId: string;
  fileName: string;
  filePath: string;
  thumbnailPath?: string;
  remark?: string;
  location?: string;
  waterPipeSpec?: string;
  waterPipeQty?: number;
  hasWatermark?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ImageExportItem {
  id: string;
  relativePath: string;
  location: string;
  waterPipeSpec?: string;
  waterPipeQty?: number;
  waterPipeText?: string;
  remark: string;
  updatedAt: number;
  createdAt: number;
}

export interface AppState {
  directories: DirectoryNode[];
  images: Record<string, ImageMeta[]>;
  locationAreas: string[];
  locationParishes: string[];
  locationStreets: string[];
  waterPipeSpecs: string[];
  commonRemarks: string[];
  loading: boolean;
}

export type AppAction =
  | {
      type: 'LOAD_DATA';
      payload: {
        directories: DirectoryNode[];
        images: Record<string, ImageMeta[]>;
        locationAreas: string[];
        locationParishes: string[];
        locationStreets: string[];
        waterPipeSpecs: string[];
        commonRemarks: string[];
      };
    }
  | {type: 'SET_LOADING'; payload: boolean}
  | {type: 'CREATE_DIR'; payload: DirectoryNode}
  | {
      type: 'RENAME_DIR';
      payload: {id: string; name: string; path: string; updatedAt: number};
    }
  | {type: 'DELETE_DIR'; payload: {id: string; childIds: string[]}}
  | {type: 'ADD_IMAGE'; payload: ImageMeta}
  | {
      type: 'UPDATE_IMAGE';
      payload: {id: string; directoryId: string; changes: Partial<ImageMeta>};
    }
  | {
      type: 'REPLACE_IMAGE_FILE_PATH';
      payload: {id: string; directoryId: string; filePath: string};
    }
  | {type: 'DELETE_IMAGE'; payload: {id: string; directoryId: string}}
  | {type: 'ADD_LOCATION_AREA'; payload: string}
  | {type: 'ADD_LOCATION_PARISH'; payload: string}
  | {type: 'ADD_LOCATION_STREET'; payload: string}
  | {type: 'ADD_WATER_PIPE_SPEC'; payload: string}
  | {type: 'ADD_COMMON_REMARK'; payload: string};

export type RootStackParamList = {
  Directory: {directoryId?: string | null};
  ImagePreview: {imageId: string; directoryId: string};
};
