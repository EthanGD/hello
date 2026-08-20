import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useApp} from '../context/AppContext';
import {
  LOCATION_MAX_LENGTH,
  HOUSE_NUMBER_MAX_LENGTH,
  DEFAULT_LOCATION_PARISHES,
  DEFAULT_LOCATION_AREAS,
} from '../constants';

export interface LocationParts {
  area: string;
  parish: string;
  street: string;
  houseNumber: string;
}

export interface LocationFieldProps {
  value: string;
  onChange: (fullValue: string, parts: LocationParts) => void;
}

const HOUSE_SPLIT_REGEX =
  /^(.*?)((?:\d+(?:[-–—~到至]\d+)?(?:號|號地下|號\S*)|地下\S*|樓\S*|舖\S*|閣\S*|座\S*)$)/u;

const splitStreetAndHouse = (input: string): {street: string; house: string} => {
  const s = input || '';
  if (!s) return {street: '', house: ''};
  const m = s.match(HOUSE_SPLIT_REGEX);
  if (!m) return {street: s, house: ''};
  return {street: m[1] || '', house: m[2] || ''};
};

const splitFullLocationToParts = (
  full: string,
  areaCandidates: string[],
  parishCandidates: string[],
): LocationParts => {
  const s = full || '';
  let rest = s;

  let area = '';
  const sortedAreas = [...areaCandidates].sort((a, b) => b.length - a.length);
  for (const a of sortedAreas) {
    if (a && s.startsWith(a)) {
      area = a;
      rest = s.slice(a.length);
      break;
    }
  }

  let parish = '';
  const sortedParishes = [...parishCandidates].sort(
    (a, b) => b.length - a.length,
  );
  for (const p of sortedParishes) {
    if (p && rest.startsWith(p)) {
      parish = p;
      rest = rest.slice(p.length);
      break;
    }
  }

  const {street, house} = splitStreetAndHouse(rest);
  return {area, parish, street, houseNumber: house};
};

const filterChips = (
  list: string[],
  query: string,
  exclude: string,
): string[] => {
  const q = query.trim();
  return list
    .filter(v => v && v !== exclude)
    .filter(v => (q ? v.toLowerCase().includes(q.toLowerCase()) : true));
};

const SECTION_LABELS: Array<{
  key: 'area' | 'parish' | 'street';
  idx: number;
  label: string;
  placeholder: string;
}> = [
  {
    key: 'area',
    idx: 1,
    label: '第一段 · 區域',
    placeholder: '搜尋快捷輸入（例：澳門半島）',
  },
  {
    key: 'parish',
    idx: 2,
    label: '第二段 · 堂區',
    placeholder: '搜尋快捷輸入（例：花地瑪堂區）',
  },
  {
    key: 'street',
    idx: 3,
    label: '第三段 · 街道',
    placeholder: '搜尋快捷輸入（例：騎士馬路）',
  },
];

export const LocationField: React.FC<LocationFieldProps> = ({value, onChange}) => {
  const {
    state: {locationAreas, locationParishes, locationStreets},
    addLocationArea,
    addLocationParish,
    addLocationStreet,
  } = useApp();

  const [parts, setParts] = useState<LocationParts>({
    area: '',
    parish: '',
    street: '',
    houseNumber: '',
  });
  const [queries, setQueries] = useState({
    area: '',
    parish: '',
    street: '',
    houseNumber: '',
  });
  const [editingKey, setEditingKey] = useState<
    'area' | 'parish' | 'street' | 'houseNumber' | null
  >(null);

  useEffect(() => {
    const candidates = {
      areas: [...DEFAULT_LOCATION_AREAS, ...locationAreas],
      parishes: [...DEFAULT_LOCATION_PARISHES, ...locationParishes],
    };
    const next = splitFullLocationToParts(value, candidates.areas, candidates.parishes);
    setParts(prev => {
      const merged: LocationParts = {...next};
      if (editingKey === 'area') merged.area = prev.area;
      if (editingKey === 'parish') merged.parish = prev.parish;
      if (editingKey === 'street') merged.street = prev.street;
      if (editingKey === 'houseNumber') merged.houseNumber = prev.houseNumber;
      if (
        prev.area === merged.area &&
        prev.parish === merged.parish &&
        prev.street === merged.street &&
        prev.houseNumber === merged.houseNumber
      ) {
        return prev;
      }
      return merged;
    });
  }, [value, locationAreas, locationParishes, editingKey]);

  const displayParts = useMemo<LocationParts>(() => {
    const firstNonNull = (a: string, b: string): string => (a && a.trim().length > 0 ? a : b);
    return {
      area: firstNonNull(parts.area, queries.area),
      parish: firstNonNull(parts.parish, queries.parish),
      street: firstNonNull(parts.street, queries.street),
      houseNumber: firstNonNull(parts.houseNumber, queries.houseNumber),
    };
  }, [parts, queries]);

  const displayFullValue = useMemo(
    () =>
      displayParts.area +
      displayParts.parish +
      displayParts.street +
      displayParts.houseNumber,
    [displayParts],
  );

  const remainingForStreet = useMemo(() => {
    const used = parts.area.length + parts.parish.length;
    return Math.max(LOCATION_MAX_LENGTH - used - HOUSE_NUMBER_MAX_LENGTH, 20);
  }, [parts.area, parts.parish]);

  const emitChange = useCallback(
    (next: LocationParts) => {
      const full = next.area + next.parish + next.street + next.houseNumber;
      onChange(full, next);
    },
    [onChange],
  );

  const updatePart = useCallback(
    (key: keyof LocationParts, raw: string) => {
      setParts(prev => {
        const next: LocationParts = {...prev, [key]: raw};
        emitChange(next);
        return next;
      });
    },
    [emitChange],
  );

  const setQuery = useCallback(
    (key: 'area' | 'parish' | 'street', v: string) => {
      setQueries(prev => ({...prev, [key]: v}));
      updatePart(key, v);
    },
    [updatePart],
  );

  const selectAndCommit = useCallback(
    (
      key: 'area' | 'parish' | 'street',
      v: string,
      list: string[],
      adder: (s: string) => void,
    ) => {
      const value = v.trim();
      if (!value) return;
      if (!list.includes(value)) adder(value);
      setQueries(prev => ({...prev, [key]: ''}));
      updatePart(key, value);
    },
    [updatePart],
  );

  const clearSection = useCallback(
    (key: keyof LocationParts) => {
      setQueries(prev => ({...prev, [key]: ''}));
      updatePart(key, '');
    },
    [updatePart],
  );

  const commitFromInput = useCallback(
    (key: 'area' | 'parish' | 'street') => {
      const q = queries[key].trim();
      if (!q) return;
      if (key === 'area') selectAndCommit('area', q, locationAreas, addLocationArea);
      if (key === 'parish') selectAndCommit('parish', q, locationParishes, addLocationParish);
      if (key === 'street') selectAndCommit('street', q, locationStreets, addLocationStreet);
    },
    [queries, locationAreas, locationParishes, locationStreets, addLocationArea, addLocationParish, addLocationStreet, selectAndCommit],
  );

  const selectedChip = (text: string) => (
    <View style={styles.selectedChip}>
      <Text style={styles.selectedChipText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );

  const overLength = displayFullValue.length > LOCATION_MAX_LENGTH;
  const hasAny =
    displayParts.area ||
    displayParts.parish ||
    displayParts.street ||
    displayParts.houseNumber;

  return (
    <View style={styles.root}>
      <View style={[styles.titleRow, overLength && styles.titleRowError]}>
        <Text style={[styles.title, overLength && styles.titleError]}>
          位置（四段級聯）
        </Text>
        <Text
          style={[
            styles.counter,
            overLength && styles.counterError,
          ]}>{`${displayFullValue.length} / ${LOCATION_MAX_LENGTH}`}</Text>
      </View>

      <View style={styles.summaryWrap}>
        <Text style={styles.summaryLabel}>組合匯總：</Text>
        {hasAny ? (
          <Text style={styles.summaryText}>
            <Text>{displayParts.area}</Text>
            <Text>{displayParts.parish}</Text>
            <Text>{displayParts.street}</Text>
            {displayParts.houseNumber ? (
              <Text>
                <Text style={styles.summaryHighlight}>門牌號</Text>
                <Text>{displayParts.houseNumber}</Text>
              </Text>
            ) : null}
          </Text>
        ) : (
          <Text style={styles.summaryPlaceholder}>
            完成輸入後組合結果將顯示在這裏
          </Text>
        )}
      </View>

      {SECTION_LABELS.map(sec => {
        const selected = parts[sec.key];
        const query = queries[sec.key];
        let list: string[] = locationAreas;
        let adder: (s: string) => void = addLocationArea;
        if (sec.key === 'parish') {
          list = locationParishes;
          adder = addLocationParish;
        }
        if (sec.key === 'street') {
          list = locationStreets;
          adder = addLocationStreet;
        }
        const chips = filterChips(list, query, selected);
        const maxLen =
          sec.key === 'street'
            ? remainingForStreet
            : Math.max(LOCATION_MAX_LENGTH, 40);
        const sectionOver = selected.length > maxLen;
        return (
          <View key={sec.key} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{sec.label}</Text>
              {selected ? (
                <TouchableOpacity onPress={() => clearSection(sec.key)}>
                  <Text style={styles.clearBtn}>清除</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {selected ? (
              editingKey !== sec.key ? (
                <View style={styles.selectedRow}>
                  <View style={styles.selectedChipWrapper}>
                    {selectedChip(selected)}
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingKey(sec.key);
                      setQueries(prev => ({...prev, [sec.key]: selected}));
                    }}
                    style={styles.editBtn}>
                    <Text style={styles.editBtnText}>編輯</Text>
                  </TouchableOpacity>
                </View>
              ) : null
            ) : null}
            <TextInput
              style={[styles.searchInput, sectionOver && styles.inputError]}
              placeholder={sec.placeholder}
              placeholderTextColor="#a8a8a8"
              value={query}
              onChangeText={t => setQuery(sec.key, t)}
              onFocus={() => setEditingKey(sec.key)}
              onBlur={() => {
                if (!query) setEditingKey(prev => (prev === sec.key ? null : prev));
              }}
              onSubmitEditing={() => commitFromInput(sec.key)}
              returnKeyType="done"
              maxLength={maxLen}
            />
            {sectionOver ? (
              <Text style={styles.hintError}>輸入太長</Text>
            ) : null}
            {chips.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}>
                {chips.map(a => (
                  <TouchableOpacity
                    key={a}
                    style={styles.chip}
                    onPress={() => selectAndCommit(sec.key, a, list, adder)}>
                    <Text style={styles.chipText}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}
          </View>
        );
      })}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>第四段 · 門牌號</Text>
          {parts.houseNumber ? (
            <TouchableOpacity onPress={() => clearSection('houseNumber')}>
              <Text style={styles.clearBtn}>清除</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {parts.houseNumber && editingKey !== 'houseNumber' ? (
          <View style={styles.selectedRow}>
            <View style={styles.selectedChipWrapper}>
              {selectedChip(parts.houseNumber)}
            </View>
            <TouchableOpacity
              onPress={() => {
                setQueries(prev => ({...prev, houseNumber: parts.houseNumber}));
                setEditingKey('houseNumber');
              }}
              style={styles.editBtn}>
              <Text style={styles.editBtnText}>編輯</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {(editingKey === 'houseNumber' || !parts.houseNumber) ? (
          <TextInput
            style={styles.searchInput}
            placeholder="輸入門牌號（例：123-125號 地下A座）"
            placeholderTextColor="#a8a8a8"
            value={queries.houseNumber}
            onChangeText={t => setQueries(prev => ({...prev, houseNumber: t}))}
            onFocus={() => setEditingKey('houseNumber')}
            onBlur={() => {
              updatePart('houseNumber', queries.houseNumber);
              setEditingKey(prev => (prev === 'houseNumber' ? null : prev));
            }}
            onSubmitEditing={() => {
              updatePart('houseNumber', queries.houseNumber);
              setEditingKey(null);
            }}
            returnKeyType="done"
            maxLength={HOUSE_NUMBER_MAX_LENGTH}
          />
        ) : null}
        <Text style={styles.hintMuted}>
          支援自動拆分：輸入「佑漢第一街123號」可自動把「123號」分到這裏
        </Text>
      </View>
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
  titleRowError: {
    backgroundColor: '#fff1f0',
    marginHorizontal: -12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffccc7',
  },
  title: {fontSize: 14, fontWeight: '700', color: '#1677ff'},
  titleError: {color: '#cf1322'},
  counter: {fontSize: 12, color: '#8c8c8c'},
  counterError: {color: '#cf1322', fontWeight: '700'},
  summaryWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae0ff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0958d9',
    marginRight: 6,
  },
  summaryText: {
    flex: 1,
    fontSize: 14,
    color: '#222',
    lineHeight: 20,
  },
  summaryHighlight: {
    color: '#1677ff',
    fontWeight: '800',
    backgroundColor: '#e6f4ff',
    paddingHorizontal: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
  summaryPlaceholder: {
    fontSize: 13,
    color: '#a8a8a8',
    fontStyle: 'italic',
  },
  section: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e4eaf3',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionLabel: {fontSize: 13, fontWeight: '600', color: '#262626'},
  clearBtn: {fontSize: 12, color: '#8c8c8c'},
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  selectedChipWrapper: {flexShrink: 1, marginRight: 10},
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1677ff',
    backgroundColor: '#ffffff',
  },
  editBtnText: {fontSize: 12, fontWeight: '700', color: '#1677ff'},
  selectedChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#e6f4ff',
    borderWidth: 1,
    borderColor: '#91caff',
  },
  selectedChipText: {fontSize: 13, fontWeight: '700', color: '#1677ff'},
  searchInput: {
    borderWidth: 1,
    borderColor: '#d9e1ea',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    fontSize: 14,
    color: '#222',
    backgroundColor: '#ffffff',
  },
  inputError: {
    borderColor: '#ff7875',
    backgroundColor: '#fff1f0',
  },
  hintMuted: {fontSize: 11, color: '#8c8c8c', marginTop: 6},
  hintError: {fontSize: 11, color: '#cf1322', marginTop: 4},
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
