import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {Icon, Toast} from '@ant-design/react-native';
import {useApp} from '../context/AppContext';
import type {ImagePreviewScreenProps} from '../navigation/types';
import {ConfirmDialog} from '../components/ConfirmDialog';
import {LocationField} from '../components/LocationField';
import type {LocationParts} from '../components/LocationField';
import {WaterPipeField} from '../components/WaterPipeField';
import type {WaterPipeFieldValue} from '../components/WaterPipeField';
import {CommonRemarkChips} from '../components/CommonRemarkChips';
import {REMARK_MAX_LENGTH} from '../constants';
import {formatDate} from '../utils/date';

const COLOR_PRIMARY = '#1677ff';
const COLOR_DANGER = '#ff4d4f';
const COLOR_DANGER_BG = '#fff1f0';
const COLOR_DANGER_BORDER = '#ffccc7';
const COLOR_DISABLED_BG = '#f5f5f5';
const COLOR_DISABLED_BORDER = '#d9d9d9';
const COLOR_DISABLED_TEXT = '#bfbfbf';

export const ImagePreviewScreen: React.FC<ImagePreviewScreenProps> = ({
  route,
  navigation,
}) => {
  const {imageId, directoryId} = route.params;
  const {
    state,
    updateImageMeta,
    deleteImage,
    addLocationArea,
    addLocationParish,
    addLocationStreet,
    addWaterPipeSpec,
    addCommonRemark,
  } = useApp();

  const image = useMemo(
    () => (state.images[directoryId] || []).find(img => img.id === imageId),
    [state.images, directoryId, imageId],
  );

  const [remark, setRemark] = useState('');
  const [location, setLocation] = useState('');
  const [locationParts, setLocationParts] = useState<LocationParts>({
    area: '',
    parish: '',
    street: '',
    houseNumber: '',
  });
  const [waterPipe, setWaterPipe] = useState<WaterPipeFieldValue>({
    spec: '',
    qty: null,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imgReady, setImgReady] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (image) {
      setRemark(image.remark || '');
      setLocation(image.location || '');
      setWaterPipe({
        spec: image.waterPipeSpec || '',
        qty: typeof image.waterPipeQty === 'number' ? image.waterPipeQty : null,
      });
      setDirty(false);
    }
  }, [image]);

  const handleLocationChange = useCallback(
    (fullValue: string, parts: LocationParts) => {
      setLocation(fullValue);
      setLocationParts(parts);
      setDirty(true);
    },
    [],
  );

  const handleWaterPipeChange = useCallback(
    (next: WaterPipeFieldValue) => {
      setWaterPipe(next);
      setDirty(true);
    },
    [],
  );

  const appendRemark = useCallback((line: string) => {
    const v = line.trim();
    if (!v) return;
    setRemark(prev => {
      if (!prev) return v;
      if (prev.endsWith('\n')) return `${prev}${v}`;
      return `${prev}\n${v}`;
    });
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!image || saving) {
      return;
    }
    const trimmedArea = locationParts.area.trim();
    const trimmedParish = locationParts.parish.trim();
    const trimmedStreet = locationParts.street.trim();
    const trimmedHouse = locationParts.houseNumber.trim();
    const trimmedSpec = waterPipe.spec.trim();
    const trimmedRemark = remark.trim();

    setSaving(true);
    try {
      await updateImageMeta(directoryId, imageId, {
        remark: trimmedRemark || undefined,
        location: location.trim() || undefined,
        waterPipeSpec: trimmedSpec || undefined,
        waterPipeQty:
          typeof waterPipe.qty === 'number' && waterPipe.qty > 0
            ? waterPipe.qty
            : undefined,
      });
      if (trimmedArea) addLocationArea(trimmedArea);
      if (trimmedParish) addLocationParish(trimmedParish);
      if (trimmedStreet) addLocationStreet(trimmedStreet);
      if (trimmedHouse) {
        // 門牌號本身以獨特字串為主，直接追加到街道詞庫方便下次選
        addLocationStreet(trimmedHouse);
      }
      if (trimmedSpec) addWaterPipeSpec(trimmedSpec);
      if (trimmedRemark) {
        const lines = trimmedRemark
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean);
        lines.forEach(line => addCommonRemark(line));
      }
      setDirty(false);
      Toast.success('已保存');
    } catch (e: any) {
      Toast.fail(e?.message || '保存失敗');
    } finally {
      setSaving(false);
    }
  }, [
    image,
    saving,
    updateImageMeta,
    directoryId,
    imageId,
    remark,
    location,
    locationParts,
    waterPipe,
    addLocationArea,
    addLocationParish,
    addLocationStreet,
    addWaterPipeSpec,
    addCommonRemark,
  ]);

  const handleDelete = async () => {
    if (!image || deleting) {
      return;
    }
    setDeleting(true);
    try {
      await deleteImage(directoryId, imageId);
      setConfirmDelete(false);
      Toast.success('已刪除');
      navigation.goBack();
    } catch (e: any) {
      Toast.fail(e?.message || '刪除失敗');
    } finally {
      setDeleting(false);
    }
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: '圖片詳情',
      // eslint-disable-next-line react/no-unstable-nested-components
      headerRight: () => (
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.hBtnDanger}
            onPress={() => setConfirmDelete(true)}
            disabled={deleting}
            activeOpacity={0.8}>
            <View style={styles.hBtnInner}>
              <View style={styles.hBtnIconWrap}>
                <Icon name="delete" color={COLOR_DANGER} size={15} />
              </View>
              <Text style={styles.hBtnDangerText}>刪除</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.hBtnPrimary,
              (!dirty || saving || deleting) && styles.hBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={!dirty || saving || deleting}
            activeOpacity={0.85}>
            <View style={styles.hBtnInner}>
              {saving ? (
                <ActivityIndicator size="small" color={COLOR_PRIMARY} />
              ) : (
                <>
                  <View style={styles.hBtnIconWrap}>
                    <Icon name="check-circle" color={COLOR_PRIMARY} size={15} />
                  </View>
                  <Text
                    style={[
                      styles.hBtnPrimaryText,
                      (!dirty || saving || deleting) && styles.hBtnTextDisabled,
                    ]}>
                    保存
                  </Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, dirty, saving, deleting, handleSave, confirmDelete]);

  if (!image) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.notFoundText}>圖片不存在</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.imageWrap}>
          {!imgReady && !imgError ? (
            <View style={styles.imgLoading}>
              <ActivityIndicator size="small" color="#1677ff" />
            </View>
          ) : null}
          {imgError ? (
            <View style={styles.imgError}>
              <Icon name="exclamation-circle" size={48} color="#ff4d4f" />
              <Text style={styles.imgErrorText}>圖片加載失敗</Text>
            </View>
          ) : null}
          <Image
            source={{uri: `file://${image.filePath}`}}
            style={styles.image}
            resizeMode="contain"
            onLoad={() => setImgReady(true)}
            onError={() => setImgError(true)}
          />
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaTag}>
            <Icon name="clock-circle" size={12} color="#888" />
            <Text style={styles.metaText}>
              {' '}
              建立：{formatDate(image.createdAt)}
            </Text>
          </View>
          {image.updatedAt !== image.createdAt ? (
            <View style={styles.metaTag}>
              <Icon name="edit" size={12} color="#888" />
              <Text style={styles.metaText}>
                {' '}
                更新：{formatDate(image.updatedAt)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.field}>
          <WaterPipeField value={waterPipe} onChange={handleWaterPipeChange} />
        </View>

        <View style={styles.field}>
          <LocationField value={location} onChange={handleLocationChange} />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            <Icon name="form" size={14} color="#1677ff" /> 備註
          </Text>
          <CommonRemarkChips onAppend={appendRemark} />
          <TextInput
            style={styles.multiInput}
            placeholder="輸入備註信息（可多行）"
            placeholderTextColor="#bbb"
            value={remark}
            onChangeText={t => {
              setRemark(t);
              setDirty(true);
            }}
            multiline
            maxLength={REMARK_MAX_LENGTH}
            textAlignVertical="top"
          />
          <Text style={styles.counter}>
            {remark.length} / {REMARK_MAX_LENGTH}
          </Text>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirmDelete}
        title="確認刪除這張圖片？"
        message="圖片文件及其備註、位置信息都將被刪除，此操作無法撤銷。"
        danger
        confirmText="刪除"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#f5f6fa'},
  scrollContent: {paddingBottom: 40},
  loadingWrap: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  notFoundText: {color: '#666'},
  imageWrap: {
    width: '100%',
    height: 360,
    backgroundColor: '#1a1a1a',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {width: '100%', height: '100%'},
  imgLoading: {position: 'absolute', zIndex: 2},
  imgError: {
    position: 'absolute',
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgErrorText: {marginTop: 8, color: '#999'},
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 6,
  },
  hBtnDanger: {
    minHeight: 32,
    borderRadius: 8,
    backgroundColor: COLOR_DANGER_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR_DANGER_BORDER,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginRight: 8,
  },
  hBtnPrimary: {
    minWidth: 60,
    minHeight: 32,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLOR_PRIMARY,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hBtnIconWrap: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 3,
  },
  hBtnDangerText: {
    color: COLOR_DANGER,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  hBtnPrimaryText: {
    color: COLOR_PRIMARY,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  hBtnDisabled: {
    backgroundColor: COLOR_DISABLED_BG,
    borderColor: COLOR_DISABLED_BORDER,
  },
  hBtnTextDisabled: {
    color: COLOR_DISABLED_TEXT,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  metaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 18,
    marginTop: 2,
  },
  metaText: {fontSize: 12, color: '#666'},
  field: {
    marginTop: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fieldLabel: {fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 8},
  multiInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 120,
    maxHeight: 220,
    fontSize: 15,
    color: '#222',
    lineHeight: 22,
    backgroundColor: '#fafafa',
  },
  counter: {textAlign: 'right', color: '#aaa', fontSize: 12, marginTop: 6},
});
