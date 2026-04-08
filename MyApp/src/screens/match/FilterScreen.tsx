import React, {useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {HOBBY_TAGS} from '../../utils/constants';
import useMatchStore, {DEFAULT_FILTER, FilterSettings} from '../../store/matchStore';

const DISTANCE_OPTIONS = [5, 10, 30, 50, 0] as const; // 0 = 전체
const DISTANCE_LABELS: Record<number, string> = {
  5: '5km',
  10: '10km',
  30: '30km',
  50: '50km',
  0: '전체',
};

const AGE_MIN_LIMIT = 18;
const AGE_MAX_LIMIT = 80;

export default function FilterScreen() {
  const navigation = useNavigation();
  const {filter, setFilter, resetFilter} = useMatchStore();

  // 로컬 임시 상태 (적용 버튼 눌렀을 때만 store 반영)
  const [minAge, setMinAge] = useState(filter.minAge);
  const [maxAge, setMaxAge] = useState(filter.maxAge);
  const [maxDistance, setMaxDistance] = useState(filter.maxDistance);
  const [hobbyTags, setHobbyTags] = useState<string[]>(filter.hobbyTags);
  const [editingMin, setEditingMin] = useState(false);
  const [editingMax, setEditingMax] = useState(false);
  const [minInput, setMinInput] = useState('');
  const [maxInput, setMaxInput] = useState('');

  const commitMin = () => {
    const v = parseInt(minInput, 10);
    if (!isNaN(v)) {
      setMinAge(Math.max(AGE_MIN_LIMIT, Math.min(v, maxAge - 1)));
    }
    setEditingMin(false);
  };

  const commitMax = () => {
    const v = parseInt(maxInput, 10);
    if (!isNaN(v)) {
      setMaxAge(Math.min(AGE_MAX_LIMIT, Math.max(v, minAge + 1)));
    }
    setEditingMax(false);
  };

  const adjustMinAge = (delta: number) => {
    setMinAge(prev => {
      const next = prev + delta;
      if (next < AGE_MIN_LIMIT) {return AGE_MIN_LIMIT;}
      if (next > maxAge - 1) {return maxAge - 1;}
      return next;
    });
  };

  const adjustMaxAge = (delta: number) => {
    setMaxAge(prev => {
      const next = prev + delta;
      if (next > AGE_MAX_LIMIT) {return AGE_MAX_LIMIT;}
      if (next < minAge + 1) {return minAge + 1;}
      return next;
    });
  };

  const toggleTag = (tag: string) => {
    setHobbyTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  };

  const handleApply = () => {
    const newFilter: FilterSettings = {minAge, maxAge, maxDistance, hobbyTags};
    setFilter(newFilter);
    navigation.goBack();
  };

  const handleReset = () => {
    setMinAge(DEFAULT_FILTER.minAge);
    setMaxAge(DEFAULT_FILTER.maxAge);
    setMaxDistance(DEFAULT_FILTER.maxDistance);
    setHobbyTags(DEFAULT_FILTER.hobbyTags);
  };

  const isActive =
    minAge !== DEFAULT_FILTER.minAge ||
    maxAge !== DEFAULT_FILTER.maxAge ||
    maxDistance !== DEFAULT_FILTER.maxDistance ||
    hobbyTags.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>

      {/* 나이 범위 */}
      <Text style={styles.sectionTitle}>나이 범위</Text>
      <View style={styles.card}>
        <View style={styles.ageRow}>
          <View style={styles.ageSide}>
            <Text style={styles.ageLabel}>최소</Text>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => adjustMinAge(-1)}>
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              {editingMin ? (
                <TextInput
                  style={styles.ageInput}
                  value={minInput}
                  onChangeText={setMinInput}
                  keyboardType="number-pad"
                  autoFocus
                  onBlur={commitMin}
                  onSubmitEditing={commitMin}
                  maxLength={2}
                />
              ) : (
                <TouchableOpacity onPress={() => { setMinInput(String(minAge)); setEditingMin(true); }}>
                  <Text style={styles.ageValue}>{minAge}세</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.stepBtn} onPress={() => adjustMinAge(1)}>
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.ageDash}>~</Text>

          <View style={styles.ageSide}>
            <Text style={styles.ageLabel}>최대</Text>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => adjustMaxAge(-1)}>
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              {editingMax ? (
                <TextInput
                  style={styles.ageInput}
                  value={maxInput}
                  onChangeText={setMaxInput}
                  keyboardType="number-pad"
                  autoFocus
                  onBlur={commitMax}
                  onSubmitEditing={commitMax}
                  maxLength={2}
                />
              ) : (
                <TouchableOpacity onPress={() => { setMaxInput(String(maxAge)); setEditingMax(true); }}>
                  <Text style={styles.ageValue}>{maxAge}세</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.stepBtn} onPress={() => adjustMaxAge(1)}>
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 나이 범위 시각화 바 */}
        <View style={styles.rangeBarWrap}>
          <View style={styles.rangeBarBg} />
          <View
            style={[
              styles.rangeBarFill,
              {
                left: `${((minAge - AGE_MIN_LIMIT) / (AGE_MAX_LIMIT - AGE_MIN_LIMIT)) * 100}%`,
                right: `${((AGE_MAX_LIMIT - maxAge) / (AGE_MAX_LIMIT - AGE_MIN_LIMIT)) * 100}%`,
              },
            ]}
          />
        </View>
        <View style={styles.rangeBarLabels}>
          <Text style={styles.rangeBarLabel}>{AGE_MIN_LIMIT}세</Text>
          <Text style={styles.rangeBarLabel}>{AGE_MAX_LIMIT}세</Text>
        </View>
      </View>

      {/* 거리 범위 */}
      <Text style={styles.sectionTitle}>거리 범위</Text>
      <View style={styles.card}>
        <View style={styles.distanceRow}>
          {DISTANCE_OPTIONS.map(d => (
            <TouchableOpacity
              key={d}
              style={[
                styles.distanceBtn,
                maxDistance === d && styles.distanceBtnActive,
              ]}
              onPress={() => setMaxDistance(d)}>
              <Text
                style={[
                  styles.distanceBtnText,
                  maxDistance === d && styles.distanceBtnTextActive,
                ]}>
                {DISTANCE_LABELS[d]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.distanceHint}>
          * 정확한 거리 필터는 위치 정보 활성화 후 적용됩니다
        </Text>
      </View>

      {/* 취미 태그 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>취미 태그</Text>
        {hobbyTags.length > 0 && (
          <Text style={styles.tagCount}>{hobbyTags.length}개 선택</Text>
        )}
      </View>
      <View style={styles.card}>
        <Text style={styles.tagHint}>선택한 태그 중 하나라도 일치하면 노출돼요</Text>
        <View style={styles.tagGrid}>
          {HOBBY_TAGS.map(tag => (
            <TouchableOpacity
              key={tag}
              style={[styles.tag, hobbyTags.includes(tag) && styles.tagActive]}
              onPress={() => toggleTag(tag)}>
              <Text
                style={[
                  styles.tagText,
                  hobbyTags.includes(tag) && styles.tagTextActive,
                ]}>
                {tag}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 하단 버튼 */}
      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={[styles.resetBtn, !isActive && styles.resetBtnDisabled]}
          onPress={handleReset}
          disabled={!isActive}>
          <Text style={[styles.resetBtnText, !isActive && styles.resetBtnTextDisabled]}>
            초기화
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
          <Text style={styles.applyBtnText}>적용하기</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f5'},
  inner: {padding: 16, paddingBottom: 40},

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#222',
    marginTop: 20,
    marginBottom: 8,
  },
  tagCount: {fontSize: 13, color: '#4CAF50', fontWeight: '600'},
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },

  // 나이 범위
  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  ageSide: {alignItems: 'center'},
  ageLabel: {fontSize: 12, color: '#888', marginBottom: 6},
  stepper: {flexDirection: 'row', alignItems: 'center', gap: 12},
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBtnText: {fontSize: 20, color: '#333', lineHeight: 24},
  ageValue: {fontSize: 18, fontWeight: '700', color: '#222', minWidth: 52, textAlign: 'center'},
  ageInput: {fontSize: 18, fontWeight: '700', color: '#4CAF50', minWidth: 52, textAlign: 'center', borderBottomWidth: 2, borderBottomColor: '#4CAF50', padding: 0},
  ageDash: {fontSize: 20, color: '#ccc'},

  rangeBarWrap: {height: 6, position: 'relative', marginBottom: 4},
  rangeBarBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
  },
  rangeBarFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#4CAF50',
    borderRadius: 3,
  },
  rangeBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  rangeBarLabel: {fontSize: 11, color: '#bbb'},

  // 거리
  distanceRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8},
  distanceBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
  },
  distanceBtnActive: {backgroundColor: '#4CAF50', borderColor: '#4CAF50'},
  distanceBtnText: {fontSize: 14, color: '#555'},
  distanceBtnTextActive: {color: '#fff', fontWeight: '600'},
  distanceHint: {fontSize: 12, color: '#aaa', marginTop: 4},

  // 태그
  tagHint: {fontSize: 12, color: '#aaa', marginBottom: 10},
  tagGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  tag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tagActive: {backgroundColor: '#4CAF50', borderColor: '#4CAF50'},
  tagText: {fontSize: 13, color: '#555'},
  tagTextActive: {color: '#fff'},

  // 하단 버튼
  bottomRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 28,
  },
  resetBtn: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetBtnDisabled: {borderColor: '#e0e0e0'},
  resetBtnText: {fontSize: 15, color: '#4CAF50', fontWeight: '600'},
  resetBtnTextDisabled: {color: '#ccc'},
  applyBtn: {
    flex: 2,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyBtnText: {fontSize: 15, color: '#fff', fontWeight: '700'},
});
