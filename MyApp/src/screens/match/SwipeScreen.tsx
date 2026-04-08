import React, {useCallback, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Swiper from 'react-native-deck-swiper';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import SwipeCard from '../../components/SwipeCard';
import useMatchStore, {FilterSettings, ProfileData} from '../../store/matchStore';
import {RootStackParamList} from '../../navigation/RootNavigator';

const CURRENT_YEAR = new Date().getFullYear();

function applyFilter(profiles: ProfileData[], filter: FilterSettings): ProfileData[] {
  return profiles.filter(p => {
    const age = CURRENT_YEAR - p.birth_year + 1;
    if (age < filter.minAge || age > filter.maxAge) {return false;}
    if (filter.hobbyTags.length > 0) {
      const hasCommon = p.hobby_tags?.some(t => filter.hobbyTags.includes(t));
      if (!hasCommon) {return false;}
    }
    return true;
  });
}

export default function SwipeScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const swiperRef = useRef<any>(null);
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [noMoreCards, setNoMoreCards] = useState(false);
  const lastSwipedProfileRef = useRef<ProfileData | null>(null);

  const {
    swipedUids,
    addSwipedUid,
    removeSwipedUid,
    lastSwipeDocId,
    setLastSwipeDocId,
    markUndoUsed,
    canUndo,
    filter,
    showButtons,
    setShowButtons,
  } = useMatchStore();

  const currentUid = auth().currentUser?.uid;

  // 필터 적용 상태 표시
  const isFilterActive =
    filter.minAge !== 18 ||
    filter.maxAge !== 60 ||
    filter.maxDistance !== 30 ||
    filter.hobbyTags.length > 0;

  // 프로필 목록 로드 — 화면 포커스 시 재실행 (필터 변경 반영)
  const loadProfiles = useCallback(async () => {
    if (!currentUid) {return;}
    setLoading(true);
    setNoMoreCards(false);
    try {
      // 이미 매칭된 상대 uid 수집
      const matchSnap = await firestore()
        .collection('matches')
        .where('user_ids', 'array-contains', currentUid)
        .get();
      const matchedUids = new Set<string>();
      matchSnap?.docs.forEach(doc => {
        const ids: string[] = doc.data().user_ids ?? [];
        ids.forEach(id => { if (id !== currentUid) {matchedUids.add(id);} });
      });

      const snap = await firestore()
        .collection('profiles')
        .limit(50)
        .get();

      const raw: ProfileData[] = snap.docs
        .filter(doc =>
          doc.id !== currentUid &&
          !swipedUids.includes(doc.id) &&
          !matchedUids.has(doc.id),
        )
        .map(doc => ({uid: doc.id, ...(doc.data() as Omit<ProfileData, 'uid'>)}));

      const filtered = applyFilter(raw, filter);
      setProfiles(filtered);
      setNoMoreCards(filtered.length === 0);
    } catch {
      Alert.alert('오류', '프로필을 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [currentUid, swipedUids, filter]);

  // 화면 포커스마다 재로드 (Filter 화면에서 돌아올 때 포함)
  useFocusEffect(
    useCallback(() => {
      loadProfiles();
    }, [loadProfiles]),
  );

  // Firestore swipes 저장 + 매칭 확인
  const saveSwipe = async (toProfile: ProfileData, type: 'like' | 'pass' | 'super') => {
    if (!currentUid) {return;}
    addSwipedUid(toProfile.uid);
    try {
      const docRef = await firestore().collection('swipes').add({
        from_uid: currentUid,
        to_uid: toProfile.uid,
        type,
        created_at: firestore.FieldValue.serverTimestamp(),
      });
      setLastSwipeDocId(docRef.id);

      if (type === 'like' || type === 'super') {
        const mutualSnap = await firestore()
          .collection('swipes')
          .where('from_uid', '==', toProfile.uid)
          .where('to_uid', '==', currentUid)
          .get();

        const hasMutualLike =
          mutualSnap != null &&
          mutualSnap.docs.some(d => ['like', 'super'].includes(d.data().type));

        if (hasMutualLike) {
          await firestore().collection('matches').add({
            user_ids: [currentUid, toProfile.uid],
            status: 'active',
            meeting_plan: null,
            safety_checked: false,
            created_at: firestore.FieldValue.serverTimestamp(),
          });
          Alert.alert('🎉 매칭 성립!', `${toProfile.nickname}님과 매칭됐어요! 채팅을 시작해보세요.`);
        }
      }
    } catch {
      // 저장 실패해도 UI 흐름은 유지
    }
  };

  // 코인 차감 (슈퍼라이크)
  const deductCoin = async (): Promise<boolean> => {
    if (!currentUid) {return false;}
    const userRef = firestore().collection('users').doc(currentUid);
    try {
      let success = false;
      await firestore().runTransaction(async tx => {
        const doc = await tx.get(userRef);
        const balance: number = doc.data()?.coin_balance ?? 0;
        if (balance < 1) {return;}
        tx.update(userRef, {coin_balance: balance - 1});
        success = true;
      });
      return success;
    } catch {
      return false;
    }
  };

  const handlePass = (index: number) => {
    const profile = profiles[index];
    if (!profile) {return;}
    lastSwipedProfileRef.current = profile;
    saveSwipe(profile, 'pass');
  };

  const handleLike = (index: number) => {
    const profile = profiles[index];
    if (!profile) {return;}
    lastSwipedProfileRef.current = profile;
    saveSwipe(profile, 'like');
  };

  const handleSuperLike = async (index: number) => {
    const profile = profiles[index];
    if (!profile) {return;}
    lastSwipedProfileRef.current = profile;
    const ok = await deductCoin();
    if (!ok) {
      Alert.alert('코인 부족', '슈퍼라이크에는 코인 1개가 필요해요.');
      saveSwipe(profile, 'like');
      return;
    }
    saveSwipe(profile, 'super');
  };

  const handleUndo = async () => {
    if (!canUndo()) {
      Alert.alert('되돌리기', '되돌리기는 하루 1회만 가능해요.');
      return;
    }
    if (!lastSwipeDocId || !lastSwipedProfileRef.current) {
      Alert.alert('되돌리기', '되돌릴 수 있는 스와이프가 없어요.');
      return;
    }
    try {
      await firestore().collection('swipes').doc(lastSwipeDocId).delete();
      removeSwipedUid(lastSwipedProfileRef.current.uid);
      setLastSwipeDocId(null);
      markUndoUsed();
      swiperRef.current?.swipeBack();
    } catch {
      Alert.alert('오류', '되돌리기에 실패했습니다.');
    }
  };

  // 새 방향 매핑: 위=패스 / 우=좋아요 / 좌=슈퍼라이크
  const pressPass = () => swiperRef.current?.swipeTop();
  const pressLike = () => swiperRef.current?.swipeRight();
  const pressSuperLike = () => swiperRef.current?.swipeLeft();

  const isEmpty = !loading && (noMoreCards || profiles.length === 0);

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.headerRow}>
        <Text style={styles.header}>🌱 새싹</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setShowButtons(!showButtons)}>
            <Text style={styles.toggleBtnText}>{showButtons ? '👁' : '👁‍🗨'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, isFilterActive && styles.filterBtnActive]}
            onPress={() => navigation.navigate('Filter')}>
            <Text style={[styles.filterBtnText, isFilterActive && styles.filterBtnTextActive]}>
              {isFilterActive ? '필터 ●' : '필터'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 카드 영역 + 버튼 오버레이 */}
      <View style={styles.cardArea}>
        {/* 카드 */}
        <View style={styles.swiperWrap}>
          {loading ? (
            <ActivityIndicator size="large" color="#4CAF50" />
          ) : isEmpty ? (
            <View style={styles.emptyInner}>
              <Text style={styles.emptyIcon}>🌱</Text>
              <Text style={styles.emptyTitle}>
                {isFilterActive ? '필터에 맞는 새싹이 없어요' : '주변 새싹이 없어요'}
              </Text>
              <Text style={styles.emptySub}>
                {isFilterActive ? '필터를 조정해보세요' : '잠시 후 다시 확인해보세요'}
              </Text>
              <View style={styles.emptyButtons}>
                {isFilterActive && (
                  <TouchableOpacity
                    style={styles.filterBtnOutline}
                    onPress={() => navigation.navigate('Filter')}>
                    <Text style={styles.filterBtnOutlineText}>필터 수정</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.refreshBtn} onPress={loadProfiles}>
                  <Text style={styles.refreshBtnText}>새로고침</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Swiper
              ref={swiperRef}
              cards={profiles}
              keyExtractor={card => card.uid}
              renderCard={card => <SwipeCard profile={card} />}
              onSwipedLeft={handleSuperLike}
              onSwipedRight={handleLike}
              onSwipedTop={handlePass}
              onSwipedAll={() => setNoMoreCards(true)}
              verticalSwipe
              horizontalSwipe
              stackSize={3}
              stackSeparation={12}
              stackScale={4}
              backgroundColor="transparent"
              cardHorizontalMargin={0}
              cardVerticalMargin={0}
              animateCardOpacity
              disableBottomSwipe
              overlayLabels={{
                left: {
                  title: 'SUPER',
                  style: {
                    label: {color: '#29b6f6', borderColor: '#29b6f6', fontSize: 28, fontWeight: '700', borderWidth: 3, borderRadius: 8, padding: 6},
                    wrapper: {flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'flex-start', marginTop: 40, marginLeft: -20},
                  },
                },
                right: {
                  title: 'LIKE',
                  style: {
                    label: {color: '#4CAF50', borderColor: '#4CAF50', fontSize: 28, fontWeight: '700', borderWidth: 3, borderRadius: 8, padding: 6},
                    wrapper: {flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', marginTop: 40, marginLeft: 20},
                  },
                },
                top: {
                  title: 'PASS',
                  style: {
                    label: {color: '#ff4458', borderColor: '#ff4458', fontSize: 28, fontWeight: '700', borderWidth: 3, borderRadius: 8, padding: 6},
                    wrapper: {flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 40},
                  },
                },
              }}
            />
          )}
        </View>

        {/* 버튼 오버레이 — 스와이프 터치 통과 */}
        {showButtons && <View style={styles.btnOverlay} pointerEvents="box-none">
          {/* PASS — 상단 중앙 */}
          <View style={styles.btnTop} pointerEvents="box-none">
            <TouchableOpacity style={styles.passBtn} onPress={pressPass}>
              <Text style={styles.passBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          {/* SUPER — 좌측 중앙 */}
          <View style={styles.btnLeft} pointerEvents="box-none">
            <TouchableOpacity style={styles.superBtn} onPress={pressSuperLike}>
              <Text style={styles.superBtnText}>★</Text>
            </TouchableOpacity>
          </View>
          {/* LIKE — 우측 중앙 */}
          <View style={styles.btnRight} pointerEvents="box-none">
            <TouchableOpacity style={styles.likeBtn} onPress={pressLike}>
              <Text style={styles.likeBtnText}>♥</Text>
            </TouchableOpacity>
          </View>
          {/* UNDO — 하단 중앙 */}
          <View style={styles.btnBottom} pointerEvents="box-none">
            <TouchableOpacity style={styles.undoBtn} onPress={handleUndo}>
              <Text style={styles.undoBtnText}>↩</Text>
            </TouchableOpacity>
            <Text style={styles.actionHint}>되돌리기 (1일 1회)</Text>
          </View>
        </View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fafafa'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fafafa'},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  header: {fontSize: 22, fontWeight: '700', color: '#4CAF50'},
  headerRight: {flexDirection: 'row', alignItems: 'center', gap: 8},
  toggleBtn: {padding: 6},
  toggleBtnText: {fontSize: 18},
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#ccc',
  },
  filterBtnActive: {borderColor: '#4CAF50', backgroundColor: '#f1f8f1'},
  filterBtnText: {fontSize: 13, color: '#999'},
  filterBtnTextActive: {color: '#4CAF50', fontWeight: '600'},
  cardArea: {
    flex: 1,
    position: 'relative',
  },
  swiperWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 10,
  },
  btnTop: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  btnLeft: {
    position: 'absolute',
    left: 20,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  btnRight: {
    position: 'absolute',
    right: 20,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  btnBottom: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 4,
  },
  actionHint: {fontSize: 11, color: '#ddd', textAlign: 'center'},
  undoBtn: {width: 56, height: 56, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#ffd740', justifyContent: 'center', alignItems: 'center', elevation: 2},
  undoBtnText: {fontSize: 22, color: '#ffd740'},
  passBtn: {width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', borderWidth: 2, borderColor: '#ff4458', justifyContent: 'center', alignItems: 'center', elevation: 3},
  passBtnText: {fontSize: 22, color: '#ff4458'},
  superBtn: {width: 56, height: 56, borderRadius: 32, backgroundColor: '#fff', borderWidth: 2, borderColor: '#29b6f6', justifyContent: 'center', alignItems: 'center', elevation: 3},
  superBtnText: {fontSize: 22, color: '#29b6f6'},
  likeBtn: {width: 56, height: 56, borderRadius: 32, backgroundColor: '#fff', borderWidth: 2, borderColor: '#4CAF50', justifyContent: 'center', alignItems: 'center', elevation: 3},
  likeBtnText: {fontSize: 22, color: '#4CAF50'},
  emptyInner: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24},
  emptyIcon: {fontSize: 64, marginBottom: 16},
  emptyTitle: {fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 8},
  emptySub: {fontSize: 14, color: '#aaa', marginBottom: 24},
  emptyButtons: {flexDirection: 'row', gap: 10},
  filterBtnOutline: {paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, borderWidth: 1.5, borderColor: '#4CAF50'},
  filterBtnOutlineText: {color: '#4CAF50', fontWeight: '600'},
  refreshBtn: {paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#4CAF50', borderRadius: 24},
  refreshBtnText: {color: '#fff', fontWeight: '600'},
});
