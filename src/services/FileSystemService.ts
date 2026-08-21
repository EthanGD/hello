import {Platform} from 'react-native';
import RNFS from 'react-native-fs';
import {
  getAppRootDir,
  getOldAppRootDir,
  getLegacyPublicRootDir,
  joinPath,
  getSafeFileName,
  getFileExtension,
} from '../utils/path';
import {generateId, nowTimestamp} from '../utils/id';
import {EXPORT_IMAGES_JSON_NAME} from '../constants';
import type {DirectoryNode, ImageMeta, ImageExportItem} from '../types';
import {
  ensureAllFilesAccess,
  hasAllFilesAccess,
} from '../utils/permission';
import {writeCrashLog} from '../utils/crashLog';

class FileSystemService {
  private static readonly MIGRATION_FLAG_NAME = '.migration_done_v2';
  private static _migrationDoneGlobal = false;
  private _migrationDone = false;
  private _migrationPromise: Promise<void> | null = null;

  private async _migrationFlagPath(): Promise<string> {
    return joinPath(getAppRootDir(), FileSystemService.MIGRATION_FLAG_NAME);
  }

  private async _readMigrationFlagAndCheckContents(): Promise<boolean> {
    try {
      const root = getAppRootDir();
      const flagP = await this._migrationFlagPath();
      const flagExists = await RNFS.exists(flagP);
      if (flagExists) return true;
      try {
        const de = await RNFS.readDir(root).catch(() => [] as any[]);
        const hasRealContent = (de || []).some(e => {
          if (!e || !e.name) return false;
          const n = e.name;
          if (n.startsWith('.')) return false;
          if (n === 'crashes.log') return false;
          if (e.isFile() && n === EXPORT_IMAGES_JSON_NAME) return true;
          if (e.isDirectory()) return true;
          if (e.isFile() && /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(n)) return true;
          return false;
        });
        return hasRealContent;
      } catch (e) {
        void writeCrashLog('WARN', 'FS:_readMigrationFlag:readDir', e);
        return false;
      }
    } catch (err) {
      void writeCrashLog('WARN', 'FS:_readMigrationFlag:error', err);
      return false;
    }
  }

  private async _writeMigrationFlag(): Promise<void> {
    try {
      await this.ensureAppRoot();
      const p = await this._migrationFlagPath();
      const ex = await RNFS.exists(p);
      if (ex) return;
      await RNFS.writeFile(p, String(Date.now()), 'utf8');
    } catch (err) {
      void writeCrashLog('WARN', 'FS:_writeMigrationFlag:failed', err);
    }
  }

  private async ensureAppRoot(): Promise<void> {
    try {
      const root = getAppRootDir();
      const exists = await RNFS.exists(root);
      if (!exists) {
        await RNFS.mkdir(root);
      }
      await this._ensureImagesJsonFileIfMissing();
      const legacy = getLegacyPublicRootDir();
      if (Platform.OS === 'android' && legacy) {
        RNFS.exists(legacy)
          .then(async legExists => {
            if (!legExists) {
              try {
                const has = await hasAllFilesAccess();
                if (has) await RNFS.mkdir(legacy);
              } catch (e) {
                void writeCrashLog('INFO', 'FS:ensureAppRoot:legacy-mkdir-skip', e);
              }
            }
          })
          .catch(() => undefined);
      }
    } catch (err) {
      void writeCrashLog('ERROR', 'FS:ensureAppRoot:failed', err);
      throw err;
    }
  }

  private async _ensureImagesJsonFileIfMissing(): Promise<void> {
    try {
      const jsonPath = this.getExportImagesJsonPath();
      const exists = await RNFS.exists(jsonPath);
      if (exists) {
        const stats = await RNFS.stat(jsonPath).catch(() => null as any);
        if (stats && typeof (stats as any).size === 'number' && (stats as any).size > 0) {
          return;
        }
      }
      await RNFS.writeFile(jsonPath, JSON.stringify([], null, 2), 'utf8');
    } catch (err) {
      void writeCrashLog('WARN', 'FS:ensureImagesJson:write-default', err);
    }
  }

  private async _copyIfPossible(from: string, to: string): Promise<boolean> {
    try {
      if (!from || !to) return false;
      const toExists = await RNFS.exists(to);
      if (toExists) return true;
      const fromExists = await RNFS.exists(from);
      if (!fromExists) return false;
      const toDir = to.split(/[\\/]/).slice(0, -1).join('/');
      if (toDir) {
        const d = await RNFS.exists(toDir);
        if (!d) await RNFS.mkdir(toDir);
      }
      await RNFS.copyFile(from, to);
      return true;
    } catch (e) {
      return false;
    }
  }

  async mirrorAllRootToPublicDir(): Promise<{
    copiedDirs: number;
    copiedFiles: number;
    skippedFiles: number;
    errors: number;
  }> {
    const result = {
      copiedDirs: 0,
      copiedFiles: 0,
      skippedFiles: 0,
      errors: 0,
    };
    if (Platform.OS !== 'android') return result;
    const pub = getLegacyPublicRootDir();
    if (!pub) return result;
    const has = await hasAllFilesAccess();
    if (!has) return result;
    const root = getAppRootDir();
    try {
      const pubExists = await RNFS.exists(pub);
      if (!pubExists) {
        try {
          await RNFS.mkdir(pub);
          result.copiedDirs++;
        } catch (e) {
          void writeCrashLog('ERROR', 'FS:mirror:mkdir-pub', e);
          result.errors++;
          return result;
        }
      }
      const rootExists = await RNFS.exists(root);
      if (!rootExists) return result;
      const list = await RNFS.readDir(root).catch(() => [] as any[]);
      if (!list) return result;
      const queue: Array<{from: string; to: string; rel: string; isDir: boolean}> = [];
      for (const e of list) {
        if (String(e.name).startsWith('.')) continue;
        const rel = e.name;
        const from = e.path;
        const to = joinPath(pub, rel);
        queue.push({from, to, rel, isDir: !!e.isDirectory()});
      }
      while (queue.length > 0) {
        const item = queue.shift()!;
        try {
          if (item.isDir) {
            const destExist = await RNFS.exists(item.to);
            if (!destExist) {
              await RNFS.mkdir(item.to);
              result.copiedDirs++;
            }
            const subList = await RNFS.readDir(item.from).catch(() => [] as any[]);
            for (const se of subList || []) {
              const sRel = `${item.rel}/${se.name}`;
              const sFrom = se.path;
              const sTo = joinPath(pub, sRel);
              queue.push({from: sFrom, to: sTo, rel: sRel, isDir: !!se.isDirectory()});
            }
          } else {
            const destExist = await RNFS.exists(item.to);
            if (destExist) {
              result.skippedFiles++;
              continue;
            }
            await RNFS.copyFile(item.from, item.to);
            result.copiedFiles++;
          }
        } catch (err) {
          result.errors++;
          void writeCrashLog('WARN', 'FS:mirror:item-fail', {rel: item.rel, err: (err as any)?.message ?? err});
        }
      }
      try {
        const jsonFrom = this.getExportImagesJsonPath();
        const jFromExist = await RNFS.exists(jsonFrom);
        if (jFromExist) {
          const jsonRel = this.getRelativePath(jsonFrom);
          const jsonTo = joinPath(pub, jsonRel);
          const done = await this._copyIfPossible(jsonFrom, jsonTo);
          if (done) result.copiedFiles++;
          else result.skippedFiles++;
        }
      } catch {
        // ignore - images.json 非致命
      }
      try {
        const {crashLogPath} = require('../utils/crashLog') as typeof import('../utils/crashLog');
        const cf = crashLogPath();
        const cfExists = await RNFS.exists(cf);
        if (cfExists) {
          const cfRel = cf.startsWith(root) ? cf.slice(root.length).replace(/^[\\/]/, '') : 'crashes.log';
          const cfTo = joinPath(pub, cfRel);
          const dir = cfTo.split(/[\\/]/).slice(0, -1).join('/');
          if (dir && !(await RNFS.exists(dir))) await RNFS.mkdir(dir);
          await RNFS.copyFile(cf, cfTo);
          result.copiedFiles++;
        }
      } catch {
        // ignore
      }
      return result;
    } catch (err) {
      void writeCrashLog('ERROR', 'FS:mirrorAll:fatal', err);
      return result;
    }
  }

  private async maybeSyncToPublicDir(srcPath: string, relSubPath: string): Promise<void> {
    if (Platform.OS !== 'android') return;
    const pub = getLegacyPublicRootDir();
    if (!pub) return;
    try {
      const has = await hasAllFilesAccess();
      if (!has) return;
      const dest = joinPath(pub, relSubPath);
      await this._copyIfPossible(srcPath, dest);
    } catch (e) {
      // public sync 非致命
    }
  }

  private async maybeSyncDirTreeToPublic(srcDir: string, relSub: string): Promise<void> {
    if (Platform.OS !== 'android') return;
    const pub = getLegacyPublicRootDir();
    if (!pub) return;
    try {
      const has = await hasAllFilesAccess();
      if (!has) return;
      const list = await RNFS.readDir(srcDir).catch(() => []);
      for (const e of list) {
        const rel = relSub ? `${relSub}/${e.name}` : e.name;
        if (e.isDirectory()) {
          await this.maybeSyncDirTreeToPublic(e.path, rel);
        } else if (e.isFile()) {
          await this.maybeSyncToPublicDir(e.path, rel);
        }
      }
    } catch {
      // ignore
    }
  }

  private async migrateFromPrivateToPublic(): Promise<void> {
    if (FileSystemService._migrationDoneGlobal) return;
    if (this._migrationDone) return;
    if (this._migrationPromise) {
      await this._migrationPromise;
      return;
    }
    const runner = async () => {
      try {
        const newRoot = getAppRootDir();
        await this.ensureAppRoot();
        // 用磁盘 flag 持久化：Metro reload / 进程重建也不会重新跑
        const alreadyDone = await this._readMigrationFlagAndCheckContents();
        if (alreadyDone) {
          return;
        }
        const migrationCandidates = [getOldAppRootDir(), getLegacyPublicRootDir()].filter(
          Boolean,
        ) as string[];

        let logged = false;
        for (const oldRoot of migrationCandidates) {
          if (!oldRoot || oldRoot === newRoot) continue;
          const oldExists = await RNFS.exists(oldRoot);
          if (!oldExists) continue;
          const de = await RNFS.readDir(oldRoot).catch(() => [] as any[]);
          const hasSomething = (de || []).some(e => e && !String(e.name).startsWith('.'));
          if (!hasSomething) continue;
          if (!logged) {
            void writeCrashLog(
              'INFO',
              'FS:migrate:start',
              newRoot,
            );
            logged = true;
          }
          void writeCrashLog(
            'INFO',
            'FS:migrate:from',
            oldRoot,
          );
          try {
            const readDir = de;
            for (const entry of readDir) {
              const from = entry.path;
              const to = joinPath(newRoot, entry.name);
              try {
                if (entry.isFile()) {
                  await this._copyIfPossible(from, to);
                } else if (entry.isDirectory()) {
                  await this._copyDirRecursive(from, to);
                }
              } catch (e) {
                void writeCrashLog(
                  'WARN',
                  'FS:migrate:item-skip',
                  {name: (entry as any)?.name, err: e},
                );
              }
            }
          } catch (e) {
            void writeCrashLog('WARN', 'FS:migrate:source-skip', {oldRoot, err: e});
          }
        }

        // 尝试公共目录镜像（失败不致命）
        try {
          const {granted} = await ensureAllFilesAccess();
          if (granted) {
            await this.maybeSyncDirTreeToPublic(newRoot, '').catch(() => undefined);
          }
        } catch (e) {
          void writeCrashLog('INFO', 'FS:migrate:sync-public-skip', e);
        }

        // 最后写 flag（即使上面某个 candidate 失败，也不再重复跑）
        await this._writeMigrationFlag();
      } catch (err) {
        void writeCrashLog('WARN', 'FS:migrateFromPrivateToPublic:failed-nonfatal', err);
      } finally {
        this._migrationDone = true;
        FileSystemService._migrationDoneGlobal = true;
      }
    };
    this._migrationPromise = runner();
    await this._migrationPromise;
  }

  private async _copyDirRecursive(from: string, to: string): Promise<void> {
    const exists = await RNFS.exists(to);
    if (!exists) await RNFS.mkdir(to);
    const list = await RNFS.readDir(from);
    for (const e of list) {
      const s = e.path;
      const d = joinPath(to, e.name);
      if (e.isDirectory()) {
        await this._copyDirRecursive(s, d);
      } else if (e.isFile()) {
        const dExists = await RNFS.exists(d);
        if (!dExists) await RNFS.copyFile(s, d);
      }
    }
  }

  getRelativePath(filePath: string): string {
    const root = getAppRootDir();
    const sep = filePath.includes('\\') && !root.includes('/') ? '\\' : '/';
    const norm = (p: string) => p.replace(/[\\/]+/g, sep).replace(/[\\/]$/, '');
    const nRoot = norm(root);
    const nPath = norm(filePath);
    if (nPath.startsWith(nRoot)) {
      const rest = nPath.slice(nRoot.length);
      return rest.replace(/^[\\/]/, '');
    }
    return nPath.split(sep).pop() || filePath;
  }

  getExportImagesJsonPath(): string {
    return joinPath(getAppRootDir(), EXPORT_IMAGES_JSON_NAME);
  }

  buildWaterPipeText(spec?: string, qty?: number): string {
    const cleanSpec = (spec || '').trim();
    if (!cleanSpec) {
      return '';
    }
    if (qty != null && !Number.isNaN(qty) && qty > 0) {
      return `${cleanSpec} × ${qty} 條`;
    }
    return cleanSpec;
  }

  buildImageExportItem(meta: ImageMeta): ImageExportItem {
    const location = meta.location || '';
    const remark = meta.remark || '';
    const waterPipeText = this.buildWaterPipeText(
      meta.waterPipeSpec,
      meta.waterPipeQty,
    );
    const filePathForOrigin = meta.originFilePath || meta.filePath;
    const originRelativePath =
      filePathForOrigin && filePathForOrigin !== meta.filePath
        ? this.getRelativePath(filePathForOrigin)
        : undefined;
    return {
      id: meta.id,
      relativePath: this.getRelativePath(meta.filePath),
      originRelativePath,
      location,
      locationArea: meta.locationArea,
      locationParish: meta.locationParish,
      locationStreet: meta.locationStreet,
      locationHouseNumber: meta.locationHouseNumber,
      waterPipeSpec: meta.waterPipeSpec,
      waterPipeQty: meta.waterPipeQty,
      waterPipeText,
      remark,
      updatedAt: meta.updatedAt,
      createdAt: meta.createdAt,
    };
  }

  async loadImageExportIndex(): Promise<ImageExportItem[]> {
    try {
      await this.ensureAppRoot();
      const jsonPath = this.getExportImagesJsonPath();
      const exists = await RNFS.exists(jsonPath);
      if (!exists) {
        return [];
      }
      const raw = await RNFS.readFile(jsonPath, 'utf8');
      if (!raw.trim()) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        void writeCrashLog('WARN', 'FS:loadImageExportIndex:not-array', {jsonPath, type: typeof parsed});
        return [];
      }
      return parsed as ImageExportItem[];
    } catch (err) {
      void writeCrashLog('ERROR', 'FS:loadImageExportIndex:failed', err);
      return [];
    }
  }

  private async writeImageExportIndex(
    items: ImageExportItem[],
  ): Promise<void> {
    try {
      await this.ensureAppRoot();
      const jsonPath = this.getExportImagesJsonPath();
      const payload = JSON.stringify(items, null, 2);
      await RNFS.writeFile(jsonPath, payload, 'utf8');
      void Promise.resolve().then(async () => {
        const rel = this.getRelativePath(jsonPath);
        await this.maybeSyncToPublicDir(jsonPath, rel).catch(() => undefined);
      });
    } catch (err) {
      void writeCrashLog('ERROR', 'FS:writeImageExportIndex:failed', err);
      throw err;
    }
  }

  async upsertImageExportItem(meta: ImageMeta): Promise<void> {
    try {
      const existing = await this.loadImageExportIndex();
      const next = this.buildImageExportItem(meta);
      const found = existing.findIndex(it => it.id === meta.id);
      if (found >= 0) {
        existing[found] = next;
      } else {
        existing.push(next);
      }
      existing.sort((a, b) => b.updatedAt - a.updatedAt);
      await this.writeImageExportIndex(existing);
    } catch (err) {
      void writeCrashLog('ERROR', 'FS:upsertImageExportItem:failed', err);
    }
  }

  async removeImageExportItem(id: string): Promise<void> {
    try {
      const existing = await this.loadImageExportIndex();
      const next = existing.filter(it => it.id !== id);
      if (next.length !== existing.length) {
        await this.writeImageExportIndex(next);
      }
    } catch (err) {
      void writeCrashLog('ERROR', 'FS:removeImageExportItem:failed', err);
    }
  }

  async createDirectory(
    parentPath: string | null,
    name: string,
  ): Promise<{path: string; node: DirectoryNode}> {
    try {
      await this.ensureAppRoot();
      const safeName = getSafeFileName(name);
      const base = parentPath || getAppRootDir();
      const fullPath = joinPath(base, safeName);
      const exists = await RNFS.exists(fullPath);
      if (exists) {
        throw new Error('目錄已存在');
      }
      await RNFS.mkdir(fullPath);
      const now = nowTimestamp();
      const node: DirectoryNode = {
        id: generateId(),
        name: safeName,
        path: fullPath,
        parentId: null,
        createdAt: now,
        updatedAt: now,
      };
      // 公共目录镜像：授权了才做，不阻塞主流程
      this.maybeSyncDirTreeToPublic(fullPath, safeName).catch(() => undefined);
      return {path: fullPath, node};
    } catch (err) {
      void writeCrashLog('ERROR', 'FS:createDirectory:failed', err);
      throw err;
    }
  }

  async renameDirectory(
    oldPath: string,
    newName: string,
  ): Promise<{newPath: string}> {
    try {
      const parts = oldPath.split(/[\\/]/);
      parts.pop();
      const base = parts.join('/');
      const safeName = getSafeFileName(newName);
      const newPath = joinPath(base, safeName);
      if (oldPath === newPath) {
        return {newPath};
      }
      const exists = await RNFS.exists(newPath);
      if (exists) {
        throw new Error('同名目錄已存在');
      }
      await RNFS.moveFile(oldPath, newPath);
      // 公共目录（仅提示授权了已会异步 mirror）
      Promise.resolve().then(async () => {
        if (Platform.OS !== 'android') return;
        const root = getAppRootDir();
        const rel = this.getRelativePath(newPath);
        const pub = getLegacyPublicRootDir();
        if (!pub) return;
        const has = await hasAllFilesAccess();
        if (has) {
          const oldRel =
            rel && newPath.startsWith(root)
              ? newPath.slice(root.length).replace(/^[\\/]/, '')
              : '';
          const oldPub = oldPath.startsWith(root)
            ? joinPath(pub, oldPath.slice(root.length).replace(/^[\\/]/, ''))
            : null;
          const newPub = rel ? joinPath(pub, rel) : null;
          if (oldPub && newPub && oldPub !== newPub) {
            const e = await RNFS.exists(oldPub).catch(() => false);
            if (e) {
              await RNFS.exists(newPub)
                .then(async ne => {
                  if (!ne) {
                    const nd = newPub.split(/[\\/]/).slice(0, -1).join('/');
                    if (nd) {
                      const de = await RNFS.exists(nd);
                      if (!de) await RNFS.mkdir(nd);
                    }
                    await RNFS.moveFile(oldPub, newPub);
                  }
                })
                .catch(() => undefined);
            }
          }
        }
      }).catch(() => undefined);
      return {newPath};
    } catch (err) {
      void writeCrashLog('ERROR', 'FS:renameDirectory:failed', err);
      throw err;
    }
  }

  async deleteDirectory(path: string): Promise<void> {
    try {
      const exists = await RNFS.exists(path);
      if (!exists) {
        return;
      }
      await RNFS.unlink(path);
      Promise.resolve().then(async () => {
        if (Platform.OS !== 'android') return;
        const pub = getLegacyPublicRootDir();
        if (!pub) return;
        const has = await hasAllFilesAccess();
        if (!has) return;
        const root = getAppRootDir();
        if (!path.startsWith(root)) return;
        const rel = path.slice(root.length).replace(/^[\\/]/, '');
        const pubPath = joinPath(pub, rel);
        const pe = await RNFS.exists(pubPath).catch(() => false);
        if (pe) await RNFS.unlink(pubPath).catch(() => undefined);
      }).catch(() => undefined);
    } catch (err) {
      void writeCrashLog('ERROR', 'FS:deleteDirectory:failed', err);
      throw err;
    }
  }

  async saveImageToDirectory(
    sourceUri: string,
    dirPath: string,
  ): Promise<{fileName: string; filePath: string}> {
    try {
      await this.ensureAppRoot();
      const ext = getFileExtension(sourceUri);
      const fileName = `IMG_${Date.now()}_${Math.floor(
        Math.random() * 10000,
      )}.${ext}`;
      const filePath = joinPath(dirPath, fileName);
      let src = sourceUri;
      if (src.startsWith('file://')) {
        src = src.slice(7);
      }
      const root = getAppRootDir();
      const rel =
        filePath.startsWith(root) ?
          filePath.slice(root.length).replace(/^[\\/]/, '')
        : fileName;

      const copyInNew = async () => {
        const srcExists = await RNFS.exists(src);
        if (srcExists) {
          await RNFS.copyFile(src, filePath);
        } else {
          await RNFS.downloadFile({fromUrl: sourceUri, toFile: filePath}).promise;
        }
      };

      try {
        await copyInNew();
      } catch (err: any) {
        // 老数据 EPERM 兜底：如果 dirPath 其实是公共老目录（没有权限），
        // 就把文件改写到 getAppRootDir + 对应相对子目录下，避免丢失
        const publicRoot = getLegacyPublicRootDir();
        const dirFallback =
          publicRoot && dirPath.startsWith(publicRoot)
            ? joinPath(root, dirPath.slice(publicRoot.length).replace(/^[\\/]/, ''))
            : null;
        if (dirFallback && dirFallback !== dirPath) {
          const de = await RNFS.exists(dirFallback).catch(() => false);
          if (!de) await RNFS.mkdir(dirFallback);
          const nPath = joinPath(dirFallback, fileName);
          const srcExists = await RNFS.exists(src);
          if (srcExists) await RNFS.copyFile(src, nPath);
          else
            await RNFS.downloadFile({fromUrl: sourceUri, toFile: nPath}).promise;
          const nRel =
            nPath.startsWith(root) ?
              nPath.slice(root.length).replace(/^[\\/]/, '')
            : fileName;
          await this.maybeSyncToPublicDir(nPath, nRel);
          return {fileName, filePath: nPath};
        }
        throw err;
      }
      await this.maybeSyncToPublicDir(filePath, rel);
      return {fileName, filePath};
    } catch (err) {
      void writeCrashLog('ERROR', 'FS:saveImageToDirectory:failed', err);
      throw err;
    }
  }

  async deleteImage(filePath: string): Promise<void> {
    try {
      const exists = await RNFS.exists(filePath);
      if (!exists) {
        return;
      }
      await RNFS.unlink(filePath);
      Promise.resolve().then(async () => {
        if (Platform.OS !== 'android') return;
        const pub = getLegacyPublicRootDir();
        if (!pub) return;
        const has = await hasAllFilesAccess();
        if (!has) return;
        const root = getAppRootDir();
        if (!filePath.startsWith(root)) return;
        const rel = filePath.slice(root.length).replace(/^[\\/]/, '');
        const pubPath = joinPath(pub, rel);
        const pe = await RNFS.exists(pubPath).catch(() => false);
        if (pe) await RNFS.unlink(pubPath).catch(() => undefined);
      }).catch(() => undefined);
    } catch (err) {
      void writeCrashLog('ERROR', 'FS:deleteImage:failed', err);
      throw err;
    }
  }

  async initialize(): Promise<void> {
    await this.ensureAppRoot();
    await this.migrateFromPrivateToPublic();
  }
}

export const fileSystemService = new FileSystemService();

export type {DirectoryNode, ImageMeta, ImageExportItem};
