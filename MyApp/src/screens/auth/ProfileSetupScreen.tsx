import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import {launchImageLibrary} from 'react-native-image-picker';
import {HOBBY_TAGS, GENDERS, JOB_FIELDS, IDEAL_TYPE_TAGS, PREFERRED_GENDERS} from '../../utils/constants';
import {useTheme} from '../../context/ThemeContext';

export default function ProfileSetupScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation();

  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [gender, setGender] = useState('');
  const [bio, setBio] = useState('');
  const [activityArea, setActivityArea] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [job, setJob] = useState('');
  const [jobField, setJobField] = useState('');
  const [idealTypeTags, setIdealTypeTags] = useState<string[]>([]);
  const [preferredGender, setPreferredGender] = useState('any');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // 기존 프로필 데이터 로드 (편집 모드)
  useEffect(() => {
    const uid = auth().currentUser?.uid;
    if (!uid) {
      setLoadingProfile(false);
      return;
    }
    firestore()
      .collection('profiles')
      .doc(uid)
      .get()
      .then(doc => {
        if (doc.exists()) {
          const data = doc.data()!;
          setNickname(data.nickname ?? '');
          setBirthYear(data.birth_year ? String(data.birth_year) : '');
          setGender(data.gender ?? '');
          setBio(data.bio ?? '');
          setActivityArea(data.activity_area ?? '');
          setSelectedTags(data.hobby_tags ?? []);
          setJob(data.job ?? '');
          setJobField(data.job_field ?? '');
          setIdealTypeTags(data.ideal_type_tags ?? []);
          setPreferredGender(data.preferred_gender ?? 'any');
          setPhotos(data.photos ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));
  }, []);

  const completeness = calcCompleteness({
    nickname, birthYear, gender, bio, activityArea, selectedTags, photos, job, jobField,
  });

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(prev => prev.filter(t => t !== tag));
    } else {
      if (selectedTags.length >= 5) {
        Alert.alert('알림', '취미 태그는 최대 5개까지 선택할 수 있습니다.');
        return;
      }
      setSelectedTags(prev => [...prev, tag]);
    }
  };

  const handleAddPhoto = async () => {
    if (photos.length >= 3) {
      Alert.alert('알림', '사진은 최대 3장까지 등록할 수 있습니다.');
      return;
    }
    const result = await launchImageLibrary({mediaType: 'photo', quality: 0.8});
    if (result.didCancel || !result.assets?.[0]?.uri) {return;}

    const uri = result.assets[0].uri;
    const uid = auth().currentUser?.uid;
    if (!uid) {return;}

    try {
      setUploading(true);
      const filename = `profiles/${uid}/${Date.now()}.jpg`;
      await storage().ref(filename).putFile(uri);
      const downloadURL = await storage().ref(filename).getDownloadURL();
      setPhotos(prev => [...prev, downloadURL]);
    } catch {
      Alert.alert('오류', '사진 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!nickname.trim()) {
      Alert.alert('알림', '닉네임을 입력해주세요.');
      return;
    }
    const year = parseInt(birthYear, 10);
    if (!birthYear || isNaN(year) || year < 1900 || year > new Date().getFullYear() - 17) {
      Alert.alert('알림', '올바른 출생연도를 입력해주세요. (만 18세 이상)');
      return;
    }
    if (!gender) {
      Alert.alert('알림', '성별을 선택해주세요.');
      return;
    }

    const uid = auth().currentUser?.uid;
    if (!uid) {return;}

    try {
      setUploading(true);

      await firestore()
        .collection('profiles')
        .doc(uid)
        .set({
          nickname: nickname.trim(),
          gender,
          birth_year: year,
          bio: bio.trim(),
          photos,
          hobby_tags: selectedTags,
          job: job.trim(),
          job_field: jobField,
          ideal_type_tags: idealTypeTags,
          preferred_gender: preferredGender,
          activity_area: activityArea.trim(),
          location: null,       // 위치는 MATCH-03 구현 시 업데이트
          location_fuzzy: null,
          completeness,
          updated_at: firestore.FieldValue.serverTimestamp(),
        });

      // EditProfile(수정 모드): 뒤로 이동
      // 초기 설정 모드: RootNavigator의 onSnapshot이 hasProfile을 감지해 MainTabs로 자동 전환
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    } catch {
      Alert.alert('오류', '프로필 저장에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  if (loadingProfile) {
    return (
      <View style={[styles.loadingContainer, {backgroundColor: colors.bg}]}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, {backgroundColor: colors.bg}]} contentContainerStyle={styles.inner}>
      {/* 완성도 바 */}
      <View style={styles.progressContainer}>
        <Text style={[styles.progressLabel, {color: colors.textSecondary}]}>프로필 완성도 {completeness}%</Text>
        <View style={[styles.progressBar, {backgroundColor: colors.border}]}>
          <View style={[styles.progressFill, {width: `${completeness}%`}]} />
        </View>
        {completeness >= 80 && (
          <Text style={styles.progressBonus}>🌱 매칭 노출 우선순위 상향!</Text>
        )}
      </View>

      {/* 사진 */}
      <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>사진 ({photos.length}/3)</Text>
      <View style={styles.photoRow}>
        {photos.map((uri, i) => (
          <TouchableOpacity key={i} onPress={() => handleRemovePhoto(i)}>
            <Image source={{uri}} style={styles.photo} />
            <View style={styles.removeBadge}>
              <Text style={styles.removeBadgeText}>✕</Text>
            </View>
            {i === 0 && (
              <View style={styles.firstPhotoBadge}>
                <Text style={styles.firstPhotoBadgeText}>메인</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
        {photos.length < 3 && (
          <TouchableOpacity
            style={[styles.addPhoto, {borderColor: colors.border}]}
            onPress={handleAddPhoto}
            disabled={uploading}>
            {uploading ? (
              <ActivityIndicator color="#4CAF50" />
            ) : (
              <Text style={[styles.addPhotoText, {color: colors.textMuted}]}>+</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* 닉네임 */}
      <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>닉네임 *</Text>
      <TextInput
        style={[styles.input, {borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bgSecondary}]}
        placeholder="닉네임을 입력하세요"
        placeholderTextColor={colors.textMuted}
        value={nickname}
        onChangeText={setNickname}
        maxLength={20}
      />

      {/* 출생연도 */}
      <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>출생연도 *</Text>
      <TextInput
        style={[styles.input, {borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bgSecondary}]}
        placeholder="예: 1995"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        value={birthYear}
        onChangeText={setBirthYear}
        maxLength={4}
      />

      {/* 성별 */}
      <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>성별 *</Text>
      <View style={styles.genderRow}>
        {GENDERS.map(g => (
          <TouchableOpacity
            key={g.value}
            style={[styles.genderBtn, {borderColor: colors.border}, gender === g.value && styles.genderBtnActive]}
            onPress={() => setGender(g.value)}>
            <Text
              style={[
                styles.genderBtnText,
                {color: colors.textSecondary},
                gender === g.value && styles.genderBtnTextActive,
              ]}>
              {g.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 매칭 상대 성별 */}
      <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>매칭 상대 성별</Text>
      <View style={styles.genderRow}>
        {PREFERRED_GENDERS.map(g => (
          <TouchableOpacity
            key={g.value}
            style={[styles.genderBtn, {borderColor: colors.border}, preferredGender === g.value && styles.genderBtnActive]}
            onPress={() => setPreferredGender(g.value)}>
            <Text style={[styles.genderBtnText, {color: colors.textSecondary}, preferredGender === g.value && styles.genderBtnTextActive]}>
              {g.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 자기소개 */}
      <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>자기소개 ({bio.length}/200)</Text>
      <TextInput
        style={[styles.input, styles.textArea, {borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bgSecondary}]}
        placeholder="자신을 소개해주세요"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={200}
        value={bio}
        onChangeText={setBio}
      />

      {/* 활동 지역 */}
      <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>활동 지역</Text>
      <TextInput
        style={[styles.input, {borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bgSecondary}]}
        placeholder="예: 서울 강남구"
        placeholderTextColor={colors.textMuted}
        value={activityArea}
        onChangeText={setActivityArea}
      />

      {/* 직업 */}
      <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>직업</Text>
      <TextInput
        style={[styles.input, {borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bgSecondary}]}
        placeholder="예: 소프트웨어 엔지니어"
        placeholderTextColor={colors.textMuted}
        value={job}
        onChangeText={setJob}
        maxLength={40}
      />

      {/* 직업 분야 */}
      <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>직업 분야</Text>
      <View style={styles.tagGrid}>
        {JOB_FIELDS.map(field => (
          <TouchableOpacity
            key={field}
            style={[styles.tag, {borderColor: colors.border}, jobField === field && styles.tagActive]}
            onPress={() => setJobField(prev => (prev === field ? '' : field))}>
            <Text style={[styles.tagText, {color: colors.textSecondary}, jobField === field && styles.tagTextActive]}>
              {field}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 취미 태그 */}
      <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>취미 태그 ({selectedTags.length}/5)</Text>
      <View style={styles.tagGrid}>
        {HOBBY_TAGS.map(tag => (
          <TouchableOpacity
            key={tag}
            style={[styles.tag, {borderColor: colors.border}, selectedTags.includes(tag) && styles.tagActive]}
            onPress={() => toggleTag(tag)}>
            <Text
              style={[
                styles.tagText,
                {color: colors.textSecondary},
                selectedTags.includes(tag) && styles.tagTextActive,
              ]}>
              {tag}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 이상형 태그 */}
      <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>이상형 태그 ({idealTypeTags.length}/5)</Text>
      <View style={styles.tagGrid}>
        {IDEAL_TYPE_TAGS.map(tag => (
          <TouchableOpacity
            key={tag}
            style={[styles.tag, {borderColor: colors.border}, idealTypeTags.includes(tag) && styles.tagIdeal]}
            onPress={() => {
              if (idealTypeTags.includes(tag)) {
                setIdealTypeTags(prev => prev.filter(t => t !== tag));
              } else {
                if (idealTypeTags.length >= 5) {
                  Alert.alert('알림', '이상형 태그는 최대 5개까지 선택할 수 있습니다.');
                  return;
                }
                setIdealTypeTags(prev => [...prev, tag]);
              }
            }}>
            <Text style={[styles.tagText, {color: colors.textSecondary}, idealTypeTags.includes(tag) && styles.tagTextActive]}>
              {tag}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 저장 버튼 */}
      <TouchableOpacity
        style={[styles.saveBtn, uploading && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={uploading}>
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>저장하기</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function calcCompleteness(data: {
  nickname: string;
  birthYear: string;
  gender: string;
  bio: string;
  activityArea: string;
  selectedTags: string[];
  photos: string[];
  job: string;
  jobField: string;
}): number {
  let score = 0;
  if (data.nickname.trim()) {score += 15;}
  if (data.birthYear && data.gender) {score += 15;}
  if (data.photos.length > 0) {score += 20;}
  if (data.bio.trim()) {score += 15;}
  if (data.activityArea.trim()) {score += 10;}
  if (data.selectedTags.length > 0) {score += 15;}
  if (data.job.trim() || data.jobField) {score += 10;}
  return score;
}

const styles = StyleSheet.create({
  loadingContainer: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff'},
  container: {flex: 1, backgroundColor: '#fff'},
  inner: {padding: 24, paddingBottom: 48},
  progressContainer: {marginBottom: 24},
  progressLabel: {fontSize: 14, color: '#555', marginBottom: 6},
  progressBar: {height: 8, backgroundColor: '#e0e0e0', borderRadius: 4},
  progressFill: {height: 8, backgroundColor: '#4CAF50', borderRadius: 4},
  progressBonus: {fontSize: 12, color: '#4CAF50', marginTop: 4},
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#222',
  },
  textArea: {height: 100, textAlignVertical: 'top'},
  photoRow: {flexDirection: 'row', gap: 10},
  photo: {width: 90, height: 90, borderRadius: 10},
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ff5252',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBadgeText: {color: '#fff', fontSize: 10, fontWeight: '700'},
  addPhoto: {
    width: 90,
    height: 90,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPhotoText: {fontSize: 28, color: '#aaa'},
  firstPhotoBadge: {
    position: 'absolute',
    bottom: 6,
    left: 4,
    backgroundColor: 'rgba(76,175,80,0.92)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  firstPhotoBadgeText: {color: '#fff', fontSize: 9, fontWeight: '700'},
  genderRow: {flexDirection: 'row', gap: 10},
  genderBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  genderBtnActive: {backgroundColor: '#4CAF50', borderColor: '#4CAF50'},
  genderBtnText: {fontSize: 15, color: '#555'},
  genderBtnTextActive: {color: '#fff', fontWeight: '600'},
  tagGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  tag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tagActive: {backgroundColor: '#4CAF50', borderColor: '#4CAF50'},
  tagIdeal: {backgroundColor: '#FF7043', borderColor: '#FF7043'},
  tagText: {fontSize: 13, color: '#555'},
  tagTextActive: {color: '#fff'},
  saveBtn: {
    marginTop: 32,
    height: 52,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnDisabled: {opacity: 0.6},
  saveBtnText: {color: '#fff', fontSize: 16, fontWeight: '600'},
});
