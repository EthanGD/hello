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

export interface CommonRemarkChipsProps {
  onAppend: (remarkLine: string) => void;
}

export const CommonRemarkChips: React.FC<CommonRemarkChipsProps> = ({
  onAppend,
}) => {
  const {
    state: {commonRemarks},
    addCommonRemark,
  } = useApp();

  const [search, setSearch] = useState('');

  const chips = useMemo(() => {
    const q = search.trim();
    if (!q) return commonRemarks;
    return commonRemarks.filter(v =>
      v.toLowerCase().includes(q.toLowerCase()),
    );
  }, [commonRemarks, search]);

  const pressChip = useCallback(
    (v: string) => {
      onAppend(v);
      setSearch('');
    },
    [onAppend],
  );

  const commitCustom = useCallback(() => {
    const v = search.trim();
    if (!v) return;
    if (!commonRemarks.includes(v)) addCommonRemark(v);
    onAppend(v);
    setSearch('');
  }, [search, commonRemarks, addCommonRemark, onAppend]);

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>常用備註 · 點擊追加一行</Text>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="輸入快速追加的自訂常用備註"
        placeholderTextColor="#a8a8a8"
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={commitCustom}
        returnKeyType="done"
      />
      {chips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}>
          {chips.map(a => (
            <TouchableOpacity
              key={a}
              style={styles.chip}
              onPress={() => pressChip(a)}>
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
    marginBottom: 8,
  },
  titleRow: {
    marginBottom: 8,
  },
  title: {fontSize: 13, fontWeight: '700', color: '#555'},
  searchInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 38,
    fontSize: 13,
    color: '#222',
    backgroundColor: '#fff',
  },
  chipRow: {
    paddingTop: 10,
    paddingBottom: 2,
    paddingHorizontal: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#fff2e8',
    borderWidth: 1,
    borderColor: '#ffd591',
    marginRight: 8,
  },
  chipText: {fontSize: 12, color: '#873800'},
});
