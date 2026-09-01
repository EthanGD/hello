import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {ActionSheet, Button, Toast} from '@ant-design/react-native';
import RNFS from 'react-native-fs';
import {useApp} from '../context/AppContext';
import type {DirectoryScreenProps} from '../navigation/types';
import {DirectoryCard} from '../components/DirectoryCard';
import {ImageCard} from '../components/ImageCard';
import {EmptyState} from '../components/EmptyState';
import {InputModal} from '../components/InputModal';
import {ConfirmDialog} from '../components/ConfirmDialog';
import type {DirectoryNode} from '../types';
import {
  APP_DIR_NAME,
  DIR_NAME_MAX_LENGTH,
  IMAGE_LIST_NUM_COLUMNS,
  ROOT_DIRECTORY_ID,
} from '../constants';
import {
  getAppRootDir,
  getLegacyPublicRootDir,
  joinPath,
  toUiFriendlyPath,
} from '../utils/path';
import {
  hasAllFilesAccess,
  openAllFilesAccessSettings,
} from '../utils/permission';
import {fileSystemService} from '../services/FileSystemService';

export const DirectoryScreen: React.FC<DirectoryScreenProps> = ({
  navigation,
  route,
}) => {
  const currentDirectoryId: string | null =
    route.params?.directoryId ?? ROOT_DIRECTORY_ID;
  const isRoot = currentDirectoryId === ROOT_DIRECTORY_ID;
  const {
    state,
    initialize,
    createDirectory,
    renameDirectory,
    deleteDirectory,
    addImageFromCamera,
    addImagesFromLibrary,
    getPathBreadcrumb,
  } = useApp();

  const storagePrivateAbs = useMemo(() => {
    const root = getAppRootDir();
    if (isRoot) {
      return root;
    }
    const crumbs = getPathBreadcrumb(currentDirectoryId);
    return joinPath(root, ...crumbs.map(c => c.name));
  }, [isRoot, currentDirectoryId, getPathBreadcrumb]);

  const storagePublicAbs = useMemo(() => {
    if (Platform.OS !== 'android') return null;
    const pub = getLegacyPublicRootDir();
    if (!pub) return null;
    if (isRoot) return pub;
    const crumbs = getPathBreadcrumb(currentDirectoryId);
    return joinPath(pub, ...crumbs.map(c => c.name));
  }, [isRoot, currentDirectoryId, getPathBreadcrumb]);

  const storagePrimaryFriendly = useMemo(
    () => toUiFriendlyPath(storagePrivateAbs),
    [storagePrivateAbs],
  );

  const storageSecondaryFriendly = useMemo(
    () => (storagePublicAbs ? toUiFriendlyPath(storagePublicAbs) : null),
    [storagePublicAbs],
  );

  const [publicAccessGranted, setPublicAccessGranted] = useState<boolean | null>(null);
  const prevGrantedRef = useRef<boolean | null>(null);
  const refreshPublicAccess = useCallback(async () => {
    try {
      const v = await hasAllFilesAccess();
      setPublicAccessGranted(prev => {
        const wasGranted = prevGrantedRef.current;
        prevGrantedRef.current = v;
        if (v === true && wasGranted !== true && Platform.OS === 'android') {
          const ToastAny: any = Toast;
          try {
            if (typeof ToastAny.loading === 'function') {
              ToastAny.loading('正在同步舊圖到內部存儲 › MWRecord…', 0);
            }
          } catch {
            /* ignore */
          }
          void Promise.resolve().then(async () => {
            try {
              const r = await fileSystemService.mirrorAllRootToPublicDir();
              try {
                if (typeof ToastAny.hide === 'function') ToastAny.hide();
              } catch {
                /* ignore */
              }
              Toast.success(
                `同步完成：複製 ${r.copiedFiles} 個檔案 / ${r.copiedDirs} 個目錄` +
                  (r.errors ? `（失敗 ${r.errors}）` : ''),
              );
            } catch {
              try {
                if (typeof ToastAny.hide === 'function') ToastAny.hide();
              } catch {
                /* ignore */
              }
              Toast.fail('同步公共目錄失敗');
            }
          });
        }
        return v;
      });
    } catch {
      prevGrantedRef.current = false;
      setPublicAccessGranted(false);
    }
  }, []);
  useEffect(() => {
    if (Platform.OS === 'android') void refreshPublicAccess();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const sub =
      Platform.OS === 'android'
        ? () => {
            // 用户从设置页返回 app，立即刷新「所有文件访问」状态
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
              void refreshPublicAccess();
            }, 800);
          }
        : null;
    if (Platform.OS === 'android') {
      try {
        const {AppState} = require('react-native') as typeof import('react-native');
        const listener = (s: string) => {
          if (s === 'active') sub && sub();
        };
        AppState.addEventListener('change', listener);
        const appSub0: any = AppState;
        const rmListener = (): void => {
          try {
            appSub0 && typeof appSub0.removeEventListener === 'function' &&
              appSub0.removeEventListener('change', listener);
          } catch {
            /* ignore */
          }
        };
        return () => {
          if (timeoutId) clearTimeout(timeoutId);
          rmListener();
        };
      } catch {
        /* ignore */
      }
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [refreshPublicAccess]);

  const openStorageLocation = useCallback(async () => {
    try {
      if (Platform.OS !== 'android') {
        Toast.info('当前平台暂不支持跳转文件管理器');
        return;
      }
      if (!storagePrivateAbs) {
        Toast.info('暂无可浏览目录');
        return;
      }
      try {
        const PA = PermissionsAndroid as any;
        const tryGet = (name: string): string | null => {
          const v = PA && PA.PERMISSIONS ? PA.PERMISSIONS[name] : null;
          return typeof v === 'string' && v.length > 0 ? v : null;
        };
        const list: string[] = [];
        const r = tryGet('READ_EXTERNAL_STORAGE'); if (r) list.push(r);
        const w = tryGet('WRITE_EXTERNAL_STORAGE'); if (w) list.push(w);
        const img = tryGet('READ_MEDIA_IMAGES'); if (img) list.push(img);
        if (list.length > 0) {
          await (PermissionsAndroid as any).requestMultiple(list).catch(() => ({}));
        }
      } catch {
        // ignore permission flow
      }
      const granted = await hasAllFilesAccess();
      setPublicAccessGranted(granted);
      let absPath = storagePrivateAbs;
      let hasPublic = false;
      if (storagePublicAbs) {
        const exists = await (RNFS as any).exists(storagePublicAbs).catch(() => false);
        if (granted && exists) {
          absPath = storagePublicAbs;
          hasPublic = true;
        }
      }
      if (!granted) {
        await openAllFilesAccessSettings();
        Toast.info(
          `請打開「所有文件訪問」後，在「我的文件」查看：${storagePrimaryFriendly.primary}`,
        );
        return;
      }
      try {
        const action = 'android.intent.action.VIEW';
        const extras = [
          {
            key: 'android.provider.extra.INITIAL_URI',
            value: `file://${absPath}`,
          },
          {key: 'org.openintents.extra.ABSOLUTE_PATH', value: absPath},
          {key: 'browser_fallback_url', value: absPath},
        ];
        try {
          await Linking.sendIntent(action, extras);
          Toast.success(hasPublic ? '已跳轉公共可見目錄' : '已调起文件浏览器');
          return;
        } catch (sendErr) {
          console.warn('[Dir] Linking.sendIntent VIEW failed:', sendErr);
        }
        try {
          await Linking.openSettings();
          Toast.success('请允许「所有文件访问」后，在「我的文件」查看：/MWRecord');
          return;
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
      Toast.info('请手动打开文件管理器查看：' + absPath);
    } catch (err) {
      Toast.fail('无法打开目录：' + String((err as any)?.message ?? err));
    }
  }, [
    storagePrivateAbs,
    storagePublicAbs,
    storagePrimaryFriendly,
    openAllFilesAccessSettings,
    hasAllFilesAccess,
  ]);

  const goToAllFilesAccess = useCallback(async () => {
    await openAllFilesAccessSettings();
    Toast.info('請將「所有文件訪問」打開');
    setTimeout(() => refreshPublicAccess(), 1500);
  }, [openAllFilesAccessSettings, refreshPublicAccess]);

  const [refreshing, setRefreshing] = useState(false);
  const [showCreateDir, setShowCreateDir] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DirectoryNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DirectoryNode | null>(null);
  const [busy, setBusy] = useState(false);

  const breadcrumb = useMemo(
    () => getPathBreadcrumb(currentDirectoryId),
    [currentDirectoryId, getPathBreadcrumb],
  );
  const currentDirName = currentDirectoryId
    ? breadcrumb[breadcrumb.length - 1]?.name || 'MWRecord'
    : 'MWRecord';

  const childDirectories = useMemo(
    () => state.directories.filter(d => d.parentId === currentDirectoryId),
    [state.directories, currentDirectoryId],
  );

  const imagesInDir = useMemo(
    () => (currentDirectoryId ? state.images[currentDirectoryId] || [] : []),
    [state.images, currentDirectoryId],
  );

  const listData = useMemo(() => {
    const parts: Array<{
      key: string;
      type: 'section-title' | 'dir' | 'image';
      data?: any;
      index?: number;
    }> = [];
    if (childDirectories.length > 0) {
      parts.push({key: 't-dir', type: 'section-title', data: '目錄'});
      childDirectories.forEach((d, i) => {
        parts.push({key: `d-${d.id}`, type: 'dir', data: d, index: i});
      });
    }
    if (imagesInDir.length > 0) {
      parts.push({key: 't-img', type: 'section-title', data: '圖片'});
      imagesInDir.forEach((img, i) => {
        parts.push({key: `i-${img.id}`, type: 'image', data: img, index: i});
      });
    }
    return parts;
  }, [childDirectories, imagesInDir]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await initialize();
    } finally {
      setRefreshing(false);
    }
  };

  const onCreateDir = async (name: string) => {
    try {
      await createDirectory(currentDirectoryId, name);
      setShowCreateDir(false);
      Toast.success('新建成功');
    } catch (e: any) {
      Toast.fail(e?.message || '新建失敗');
      throw e;
    }
  };

  const onRenameDir = async (name: string) => {
    if (!renameTarget) {
      return;
    }
    try {
      await renameDirectory(renameTarget.id, name);
      setRenameTarget(null);
      Toast.success('重命名成功');
    } catch (e: any) {
      Toast.fail(e?.message || '重命名失敗');
      throw e;
    }
  };

  const onDeleteDir = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      setBusy(true);
      await deleteDirectory(deleteTarget.id);
      setDeleteTarget(null);
      Toast.success('已刪除');
    } catch (e: any) {
      Toast.fail(e?.message || '刪除失敗');
    } finally {
      setBusy(false);
    }
  };

  const handleDirLongPress = (dir: DirectoryNode) => {
    ActionSheet.showActionSheetWithOptions(
      {
        title: `操作：${dir.name}`,
        options: ['重命名', '刪除', '取消'],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
      },
      buttonIndex => {
        if (buttonIndex === 0) {
          setRenameTarget(dir);
        } else if (buttonIndex === 1) {
          setDeleteTarget(dir);
        }
      },
    );
  };

  const handlePressAdd = () => {
    if (!currentDirectoryId) {
      Toast.info('根目錄不可添加圖片，請先進入子目錄');
      return;
    }
    ActionSheet.showActionSheetWithOptions(
      {
        options: ['拍照', '從相冊選擇', '取消'],
        cancelButtonIndex: 2,
      },
      async buttonIndex => {
        try {
          setBusy(true);
          if (buttonIndex === 0) {
            const meta = await addImageFromCamera(currentDirectoryId);
            if (meta) {
              Toast.success('拍照成功');
            }
          } else if (buttonIndex === 1) {
            const list = await addImagesFromLibrary(currentDirectoryId);
            if (list.length > 0) {
              Toast.success(`已添加 ${list.length} 張`);
            }
          }
        } catch (e: any) {
          Toast.fail(e?.message || '操作失敗');
        } finally {
          setBusy(false);
        }
      },
    );
  };

  const navigateIntoDir = (dir: DirectoryNode) => {
    navigation.push('Directory', {directoryId: dir.id});
  };

  const renderSectionTitle = (title: string) => (
    <View style={styles.sectionTitleWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  const renderDirectoryGrid = () => {
    if (childDirectories.length === 0) {
      return null;
    }
    return (
      <View style={styles.gridWrap}>
        <FlatList
          data={childDirectories}
          keyExtractor={d => d.id}
          numColumns={3}
          scrollEnabled={false}
          columnWrapperStyle={styles.columnWrap}
          renderItem={({item}) => {
            const count = (state.images[item.id] || []).length;
            return (
              <View style={styles.gridCell}>
                <DirectoryCard
                  directory={item}
                  imageCount={count}
                  onPress={() => navigateIntoDir(item)}
                  onLongPress={() => handleDirLongPress(item)}
                />
              </View>
            );
          }}
        />
      </View>
    );
  };

  const renderImageGrid = () => {
    if (!currentDirectoryId) {
      return null;
    }
    if (imagesInDir.length === 0) {
      return null;
    }
    return (
      <View style={styles.gridWrap}>
        <FlatList
          data={imagesInDir}
          keyExtractor={img => img.id}
          numColumns={IMAGE_LIST_NUM_COLUMNS}
          scrollEnabled={false}
          columnWrapperStyle={styles.imageColumnWrap}
          renderItem={({item}) => (
            <View style={styles.imageCell}>
              <ImageCard
                image={item}
                onPress={() =>
                  navigation.navigate('ImagePreview', {
                    imageId: item.id,
                    directoryId: currentDirectoryId as string,
                  })
                }
              />
            </View>
          )}
        />
      </View>
    );
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: currentDirName || 'MWRecord',
    });
  }, [navigation, currentDirName]);

  if (state.loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#1677ff" />
      </View>
    );
  }

  const isEmpty = listData.length === 0;

  return (
    <View style={styles.screen}>
      {breadcrumb.length > 0 ? (
        <View style={styles.breadcrumbWrap}>
          <TouchableOpacity
            onPress={() => navigation.pop(breadcrumb.length)}
            style={styles.breadcrumbItem}>
            <Text style={styles.breadcrumbText}>首頁</Text>
          </TouchableOpacity>
          {breadcrumb.map((n, i) => (
            <View key={n.id} style={styles.breadcrumbRow}>
              <Text style={styles.breadcrumbSep}> / </Text>
              <TouchableOpacity
                onPress={() => navigation.pop(breadcrumb.length - i)}
                style={styles.breadcrumbItem}>
                <Text
                  style={[
                    styles.breadcrumbText,
                    i === breadcrumb.length - 1 && styles.breadcrumbCurrent,
                  ]}>
                  {n.name}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.storageBar}
        activeOpacity={0.65}
        onPress={openStorageLocation}>
        <View style={styles.storageHeaderRow}>
          <Text style={styles.storageLabel}>存儲位置：</Text>
          <Text style={styles.storageChevron}>查看</Text>
        </View>
        <View style={styles.storagePaths}>
          <Text style={styles.storagePathBadge}>用戶可見</Text>
          <Text
            style={[
              styles.storagePath,
              styles.storagePathPrimaryUi,
            ]}
            numberOfLines={0}
            ellipsizeMode="tail">
            {storagePrimaryFriendly.primary}
          </Text>
        </View>
        <View style={[styles.storagePaths, styles.storagePathSecondary]}>
          <Text
            style={[
              styles.storagePathBadge,
              styles.storagePathBadgeTech,
            ]}>
            技術路徑
          </Text>
          <Text
            style={[styles.storagePath, styles.storagePathTech]}
            numberOfLines={0}
            ellipsizeMode="tail">
            {storagePrimaryFriendly.secondary}
          </Text>
        </View>
        {storageSecondaryFriendly ? (
          <View style={[styles.storagePaths, styles.storagePathSecondary]}>
            <Text style={[styles.storagePathBadge, styles.storagePathBadgePub]}>
              公共根目錄
            </Text>
            <Text
              style={[styles.storagePath, styles.storagePathPub]}
              numberOfLines={0}
              ellipsizeMode="tail">
              {storageSecondaryFriendly.primary}
              {'\n'}
              <Text style={{color: '#8c8c8c', fontWeight: '400'}}>
                {publicAccessGranted === true
                  ? '（已授權，自動同步所有圖片到此文件夾副本）'
                  : publicAccessGranted === false
                    ? '（未授權，點擊右側開啟即可看到此文件夾）'
                    : '（點擊右側開啟後才能看見此文件夾）'}
              </Text>
            </Text>
            <TouchableOpacity onPress={goToAllFilesAccess}>
              <Text style={styles.storageLinkBtn}>
                {publicAccessGranted === true
                  ? '已開啟 ✔'
                  : publicAccessGranted === null
                    ? '點我開啟'
                    : '點我重新開啟'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </TouchableOpacity>

      {isEmpty ? (
        <EmptyState
          title={isRoot ? '還沒有任何目錄' : '此目錄暫無內容'}
          description={
            isRoot
              ? '點擊下方按鈕，新建第一個目錄開始使用'
              : '點擊下方按鈕，添加圖片或新建子目錄'
          }
        />
      ) : (
        <FlatList
          data={[{key: 'all'}]}
          keyExtractor={x => x.key}
          renderItem={() => (
            <View>
              {childDirectories.length > 0 ? renderSectionTitle('目錄') : null}
              {renderDirectoryGrid()}
              {!isRoot && imagesInDir.length > 0
                ? renderSectionTitle('圖片')
                : null}
              {renderImageGrid()}
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      <View style={styles.fabRow}>
        <View style={styles.fabBtnSingleWrap}>
          {isRoot ? (
            <Button
              type="primary"
              onPress={() => setShowCreateDir(true)}
              disabled={busy}
              style={styles.fabBtnFull}>
              <View style={styles.fabBtnContent}>
                <Text style={styles.fabBtnTextPrimary}>新建目錄（長按目錄可重命名）</Text>
              </View>
            </Button>
          ) : (
            <Button
              type="primary"
              onPress={handlePressAdd}
              disabled={busy}
              style={styles.fabBtnFull}>
              <View style={styles.fabBtnContent}>
                <Text style={styles.fabBtnTextPrimary}>添加圖片（點擊圖片編輯詳情）</Text>
              </View>
            </Button>
          )}
        </View>
      </View>

      <InputModal
        visible={showCreateDir}
        title="新建目錄（長按目錄可重命名）"
        placeholder="請輸入目錄名稱"
        maxLength={DIR_NAME_MAX_LENGTH}
        onConfirm={onCreateDir}
        onCancel={() => setShowCreateDir(false)}
      />
      <InputModal
        visible={!!renameTarget}
        title="重命名目錄"
        placeholder="請輸入新的目錄名稱"
        initialValue={renameTarget?.name || ''}
        maxLength={DIR_NAME_MAX_LENGTH}
        onConfirm={onRenameDir}
        onCancel={() => setRenameTarget(null)}
      />
      <ConfirmDialog
        visible={!!deleteTarget}
        title="確認刪除？"
        message={`將刪除「${
          deleteTarget?.name || ''
        }」及其包含的所有子目錄和圖片，此操作無法撤銷。`}
        danger
        confirmText="刪除"
        onConfirm={onDeleteDir}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#f5f6fa'},
  loadingWrap: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  breadcrumbWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ececec',
    flexWrap: 'wrap',
  },
  breadcrumbItem: {paddingVertical: 4, paddingHorizontal: 2},
  breadcrumbText: {fontSize: 13, color: '#555'},
  breadcrumbCurrent: {color: '#1677ff', fontWeight: '600'},
  breadcrumbSep: {color: '#bbb', fontSize: 13},
  breadcrumbRow: {flexDirection: 'row', alignItems: 'center'},
  storageBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#e6f4ff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#bae0ff',
  },
  storageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  storageLabel: {
    fontSize: 12,
    color: '#1677ff',
    fontWeight: '600',
    flex: 1,
  },
  storagePaths: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  storagePathSecondary: {marginTop: 6},
  storagePathBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#1677ff',
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
    alignSelf: 'flex-start',
    marginRight: 8,
  },
  storagePathBadgePub: {backgroundColor: '#d46b08'},
  storagePathBadgeTech: {backgroundColor: '#595959'},
  storagePath: {
    flex: 1,
    flexShrink: 1,
    fontSize: 12,
    color: '#262626',
    lineHeight: 18,
  },
  storagePathPrimaryUi: {
    color: '#1677ff',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 19,
    textDecorationLine: 'underline',
  },
  storagePathTech: {
    color: '#8c8c8c',
    fontSize: 10,
    lineHeight: 14,
    fontFamily: Platform.OS === 'android' ? 'monospace' : undefined,
  },
  storagePathPub: {color: '#5c2b00'},
  storageLinkBtn: {
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d46b08',
    color: '#d46b08',
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    marginLeft: 8,
  },
  storageChevron: {
    marginLeft: 6,
    fontSize: 12,
    color: '#8c8c8c',
  },
  listContent: {paddingBottom: 140, paddingTop: 8},
  sectionTitleWrap: {paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6},
  sectionTitle: {fontSize: 14, fontWeight: '600', color: '#333'},
  gridWrap: {paddingHorizontal: 10},
  columnWrap: {marginHorizontal: -3},
  imageColumnWrap: {marginHorizontal: -3},
  gridCell: {flex: 1 / 3, padding: 6},
  imageCell: {flex: 1 / 3, padding: 4},
  fabRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderTopWidth: 1,
    borderTopColor: '#ececec',
  },
  fabBtnSingleWrap: {flex: 1, maxWidth: 520, alignSelf: 'center'},
  fabBtnFull: {width: '100%'},
  fabBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  fabBtnTextPrimary: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
