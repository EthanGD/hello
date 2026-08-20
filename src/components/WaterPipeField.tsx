import React, {useCallback, useMemo, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useApp} from '../context/AppContext';
import {WATER_PIPE_QTY_MAX} from '../constants';

export interface WaterPipeFieldValue {
  spec: string;
  qty: number | null;
}

export interface WaterPipeFieldProps {
  value: WaterPipeFieldValue;
  onChange: (next: WaterPipeFieldValue) => void;
}

const filterChips = (list: string[], query: string, exclude: string): string[] => {
  const q = query.trim();
  return list
    .filter(v => v && v !== exclude)
    .filter(v => (q ? v.toLowerCase().includes(q.toLowerCase()) : true));
};

export const WaterPipeField: React.FC<WaterPipeFieldProps> = ({value, onChange}) => {
  const {
    state: {waterPipeSpecs},
    addWaterPipeSpec,
  } = useApp();

  const [search, setSearch] = useState('');

  const chips = useMemo(
    () => filterChips(waterPipeSpecs, search, value.spec),
    [waterPipeSpecs, search, value.spec],
  );

  const selectSpec = useCallback(
    (v: string) => {
      onChange({...value, spec: v});
      setSearch('');
    },
    [onChange, value],
  );

  const onSearchChange = useCallback(
    (text: string) => {
      setSearch(text);
      onChange({...value, spec: text});
    },
    [onChange, value],
  );

  const commitSpecFromSearch = useCallback(() => {
    const v = search.trim();
    if (!v) return;
    if (!waterPipeSpecs.includes(v)) addWaterPipeSpec(v);
    onChange({...value, spec: v});
  }, [search, waterPipeSpecs, addWaterPipeSpec, onChange, value]);

  const onChipPress = useCallback(
    (v: string) => {
      selectSpec(v);
      if (!waterPipeSpecs.includes(v)) addWaterPipeSpec(v);
    },
    [selectSpec, waterPipeSpecs, addWaterPipeSpec],
  );

  const onQtyChange = useCallback(
    (text: string) => {
      if (!text) {
        onChange({...value, qty: null});
        return;
      }
      const digits = text.replace(/\D+/g, '');
      if (!digits) {
        onChange({...value, qty: null});
        return;
      }
      let n = parseInt(digits, 10);
      if (Number.isNaN(n)) n = 0;
      if (n > WATER_PIPE_QTY_MAX) n = WATER_PIPE_QTY_MAX;
      onChange({...value, qty: n});
    },
    [onChange, value],
  );

  const clearSpec = useCallback(() => {
    onChange({...value, spec: ''});
    setSearch('');
  }, [onChange, value]);

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>水喉規格 · 數量</Text>
        {value.spec ? (
          <TouchableOpacity onPress={clearSpec}>
            <Text style={styles.clearBtn}>清除規格</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.row}>
        <View style={styles.specWrap}>
          <TextInput
            style={styles.specInput}
            placeholder="搜尋快捷輸入（例：沿水企身）"
            placeholderTextColor="#a8a8a8"
            value={search}
            onChangeText={onSearchChange}
            onSubmitEditing={commitSpecFromSearch}
            returnKeyType="done"
          />
        </View>
        <View style={styles.qtyWrap}>
          <TextInput
            style={styles.qtyInput}
            keyboardType="number-pad"
            placeholder="數量"
            placeholderTextColor="#a8a8a8"
            value={value.qty == null ? '' : String(value.qty)}
            onChangeText={onQtyChange}
            returnKeyType="done"
            maxLength={4}
          />
          <Text style={styles.qtyUnit}>條</Text>
        </View>
      </View>

      {value.spec ? (
        <View style={styles.selectedRow}>
          <Text style={styles.selectedLabel}>已選：</Text>
          <View style={styles.selectedChip}>
            <Text style={styles.selectedChipText}>{value.spec}</Text>
          </View>
          {value.qty != null ? (
            <Text style={styles.selectedQty}>× {value.qty} 條</Text>
          ) : null}
        </View>
      ) : null}

      {chips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}>
          {chips.map(a => (
            <TouchableOpacity
              key={a}
              style={styles.chip}
              onPress={() => onChipPress(a)}>
              <Text style={styles.chipText}>{a}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    width: '100%',
    padding: 12,
    backgroundColor: '#f6f9ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e1ebff',
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {fontSize: 14, fontWeight: '700', color: '#1677ff'},
  clearBtn: {fontSize: 12, color: '#8c8c8c'},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  specWrap: {flex: 1, marginRight: 10},
  specInput: {
    borderWidth: 1,
    borderColor: '#d9e1ea',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 42,
    fontSize: 14,
    color: '#222',
    backgroundColor: '#ffffff',
  },
  qtyWrap: {
    width: 118,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d9e1ea',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    minHeight: 42,
  },
  qtyInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#1677ff',
    textAlign: 'right',
    paddingVertical: 4,
  },
  qtyUnit: {fontSize: 13, color: '#555', marginLeft: 4},
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  selectedLabel: {fontSize: 12, color: '#666', marginRight: 4},
  selectedChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#e6f4ff',
    borderWidth: 1,
    borderColor: '#91caff',
  },
  selectedChipText: {fontSize: 13, fontWeight: '700', color: '#1677ff'},
  selectedQty: {fontSize: 13, color: '#333', marginLeft: 6},
  chipRow: {
    paddingTop: 10,
    paddingBottom: 2,
    paddingHorizontal: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cfd9e4',
    marginRight: 8,
  },
  chipText: {fontSize: 12, color: '#333'},
});
