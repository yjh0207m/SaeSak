import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, {Marker, PROVIDER_GOOGLE, Region} from 'react-native-maps';
import Geolocation from 'react-native-geolocation-service';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import useMatchStore, {ProfileData} from '../../store/matchStore';
import {useTheme} from '../../context/ThemeContext';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const CURRENT_YEAR = new Date().getFullYear();

function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fuzzyLocation(lat: number, lng: number) {
  return {lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000};
}

interface NearbyUser extends ProfileData {
  distanceKm: number;
}

export default function MapScreen() {
  const {colors} = useTheme();
  const mapRef = useRef<MapView>(null);
  const currentUid = auth().currentUser?.uid;
  const {filter} = useMatchStore();

  const [myLocation, setMyLocation] = useState<{lat: number; lng: number} | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  const requestPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: '위치 권한 필요',
          message: '주변 새싹을 찾으려면 위치 권한이 필요해요.',
          buttonPositive: '허용',
          buttonNegative: '거부',
        },
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  };

  const loadNearbyUsers = useCallback(
    async (myLat: number, myLng: number) => {
      if (!currentUid) {return;}
      try {
        // 이미 매칭된 상대 uid 수집
        const matchSnap = await firestore()
          .collection('matches')
          .where('user_ids', 'array-contains', currentUid)
          .get();
        const matchedUids = new Set<string>();
        matchSnap?.docs.forEach(doc => {
          if (doc.data().status !== 'active') {return;} // cancelled는 재탐색 허용
          const ids: string[] = doc.data().user_ids ?? [];
          ids.forEach(id => {if (id !== currentUid) {matchedUids.add(id);}});
        });

        const myProfile = await firestore().collection('profiles').doc(currentUid).get();
        const myPreferredGender: string = myProfile.data()?.preferred_gender ?? 'any';

        const snap = await firestore().collection('profiles').limit(100).get();
        const maxDist = filter.maxDistance === 0 ? Infinity : filter.maxDistance;
        const users: NearbyUser[] = [];
        snap.docs.forEach(doc => {
          if (doc.id === currentUid) {return;}
          if (matchedUids.has(doc.id)) {return;}
          if (myPreferredGender !== 'any' && doc.data().gender !== myPreferredGender) {return;}
          const data = doc.data() as Omit<ProfileData, 'uid'>;
          const loc = data.location_fuzzy as {lat: number; lng: number} | null;
          if (!loc) {return;}
          const dist = getDistanceKm(myLat, myLng, loc.lat, loc.lng);
          if (dist > maxDist) {return;}
          users.push({uid: doc.id, ...data, distanceKm: dist});
        });
        users.sort((a, b) => a.distanceKm - b.distanceKm);
        setNearbyUsers(users);
      } catch {}
    },
    [currentUid, filter.maxDistance],
  );

  useEffect(() => {
    let watchId: number;
    const init = async () => {
      const granted = await requestPermission();
      if (!granted) {setLocationDenied(true); setLoading(false); return;}

      watchId = Geolocation.watchPosition(
        pos => {
          const {latitude: lat, longitude: lng} = pos.coords;
          setMyLocation({lat, lng});
          setLoading(false);
          if (currentUid) {
            const fuzzy = fuzzyLocation(lat, lng);
            firestore().collection('profiles').doc(currentUid)
              .update({location: {lat, lng}, location_fuzzy: fuzzy})
              .catch(() => {});
            loadNearbyUsers(fuzzy.lat, fuzzy.lng);
          }
        },
        err => {console.warn('Location error:', err); setLoading(false);},
        {enableHighAccuracy: true, distanceFilter: 50, interval: 30000},
      );
    };
    init();
    return () => {if (watchId != null) {Geolocation.clearWatch(watchId);}};
  }, [currentUid, loadNearbyUsers]);

  // 좋아요 / 슈퍼라이크 공통 저장
  const saveSwipe = async (toUid: string, type: 'like' | 'super') => {
    if (!currentUid) {return;}
    try {
      await firestore().collection('swipes').add({
        from_uid: currentUid,
        to_uid: toUid,
        type,
        created_at: firestore.FieldValue.serverTimestamp(),
      });
      // 상호 매칭 확인
      const mutualSnap = await firestore()
        .collection('swipes')
        .where('from_uid', '==', toUid)
        .where('to_uid', '==', currentUid)
        .get();
      const hasMutual =
        mutualSnap?.docs.some(d => ['like', 'super'].includes(d.data().type)) ?? false;
      if (hasMutual) {
        await firestore().collection('matches').add({
          user_ids: [currentUid, toUid],
          status: 'active',
          meeting_plan: null,
          safety_checked: false,
          created_at: firestore.FieldValue.serverTimestamp(),
        });
        Alert.alert('🎉 매칭 성립!', `${selectedUser?.nickname}님과 매칭됐어요!`);
      }
    } catch {}
  };

  const deductCoin = async (): Promise<boolean> => {
    if (!currentUid) {return false;}
    try {
      let success = false;
      await firestore().runTransaction(async tx => {
        const doc = await tx.get(firestore().collection('users').doc(currentUid));
        const balance: number = doc.data()?.coin_balance ?? 0;
        if (balance < 1) {return;}
        tx.update(firestore().collection('users').doc(currentUid), {coin_balance: balance - 1});
        success = true;
      });
      return success;
    } catch {return false;}
  };

  const handleLike = async () => {
    if (!selectedUser) {return;}
    setActionLoading(true);
    await saveSwipe(selectedUser.uid, 'like');
    setActionLoading(false);
    setSelectedUser(null);
  };

  const handleSuperLike = async () => {
    if (!selectedUser) {return;}
    setActionLoading(true);
    const ok = await deductCoin();
    if (!ok) {
      Alert.alert('코인 부족', '슈퍼라이크에는 코인 1개가 필요해요.');
      setActionLoading(false);
      return;
    }
    await saveSwipe(selectedUser.uid, 'super');
    setActionLoading(false);
    setSelectedUser(null);
  };

  const distanceLabel = (km: number) =>
    km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;

  if (loading) {
    return (
      <View style={[styles.center, {backgroundColor: colors.bg}]}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={[styles.loadingText, {color: colors.textMuted}]}>위치를 가져오는 중...</Text>
      </View>
    );
  }

  if (locationDenied) {
    return (
      <View style={[styles.center, {backgroundColor: colors.bg}]}>
        <Text style={styles.deniedIcon}>📍</Text>
        <Text style={[styles.deniedTitle, {color: colors.textPrimary}]}>위치 권한이 필요해요</Text>
        <Text style={[styles.deniedSub, {color: colors.textMuted}]}>설정에서 위치 권한을 허용해주세요.</Text>
      </View>
    );
  }

  const initialRegion: Region | undefined = myLocation
    ? {latitude: myLocation.lat, longitude: myLocation.lng, latitudeDelta: 0.05, longitudeDelta: 0.05}
    : undefined;

  const selAge = selectedUser
    ? CURRENT_YEAR - (selectedUser.birth_year ?? 0) + 1
    : null;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        onPress={() => setSelectedUser(null)}>
        {/* 내 위치 마커 (showsUserLocation 대신 — New Architecture 호환) */}
        {myLocation && (
          <Marker
            coordinate={{latitude: myLocation.lat, longitude: myLocation.lng}}
            anchor={{x: 0.5, y: 0.5}}
            tracksViewChanges={false}>
            <View style={styles.myLocationOuter}>
              <View style={styles.myLocationDot} />
            </View>
          </Marker>
        )}
        {nearbyUsers.map(user => {
          const loc = user.location_fuzzy as {lat: number; lng: number};
          return (
            <Marker
              key={user.uid}
              coordinate={{latitude: loc.lat, longitude: loc.lng}}
              tracksViewChanges={false}
              onPress={e => {e.stopPropagation(); setSelectedUser(user); setPhotoIndex(0);}}>
              {/* 원형 마커 */}
              <View style={styles.markerOuter}>
                {user.photos?.[0] ? (
                  <Image
                    source={{uri: user.photos[0]}}
                    style={styles.markerImg}
                  />
                ) : (
                  <View style={styles.markerFallback}>
                    <Text style={{fontSize: 18}}>🌱</Text>
                  </View>
                )}
              </View>
              {/* 말풍선 꼬리 */}
              <View style={styles.markerTail} />
            </Marker>
          );
        })}
      </MapView>

      {/* 유저 수 배지 */}
      <View style={styles.countBadge}>
        <Text style={styles.countBadgeText}>
          🌱 {nearbyUsers.length}명의 새싹
          {filter.maxDistance > 0 ? ` (${filter.maxDistance}km 이내)` : ''}
        </Text>
      </View>

      {/* 프로필 하단 모달 */}
      <Modal
        visible={!!selectedUser}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedUser(null)}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSelectedUser(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalSheet, {backgroundColor: colors.card}]}>

            {/* 사진 캐러셀 */}
            {selectedUser?.photos?.length ? (
              <View style={styles.photoWrap}>
                <Image
                  source={{uri: selectedUser.photos[photoIndex]}}
                  style={{width: SCREEN_WIDTH, height: 240}}
                  resizeMode="cover"
                />
                {photoIndex > 0 && (
                  <TouchableOpacity
                    style={[styles.photoNavBtn, {left: 0}]}
                    onPress={() => setPhotoIndex(i => i - 1)}>
                    <Text style={styles.photoNavText}>‹</Text>
                  </TouchableOpacity>
                )}
                {photoIndex < (selectedUser.photos?.length ?? 1) - 1 && (
                  <TouchableOpacity
                    style={[styles.photoNavBtn, {right: 0}]}
                    onPress={() => setPhotoIndex(i => i + 1)}>
                    <Text style={styles.photoNavText}>›</Text>
                  </TouchableOpacity>
                )}
                {(selectedUser.photos?.length ?? 0) > 1 && (
                  <View style={styles.dotRow}>
                    {selectedUser.photos!.map((_, i) => (
                      <View key={i} style={[styles.dot, i === photoIndex && styles.dotActive]} />
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={{fontSize: 48}}>🌱</Text>
              </View>
            )}

            {/* 프로필 정보 */}
            <ScrollView style={styles.infoScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.nameRow}>
                <Text style={[styles.modalName, {color: colors.textPrimary}]}>
                  {selectedUser?.nickname}  {selAge}세
                </Text>
                <Text style={styles.distLabel}>
                  {selectedUser ? distanceLabel(selectedUser.distanceKm) : ''}
                </Text>
              </View>
              {(selectedUser?.job || selectedUser?.job_field) ? (
                <Text style={[styles.modalMeta, {color: colors.textSecondary}]}>
                  💼 {[selectedUser?.job, selectedUser?.job_field].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {selectedUser?.activity_area ? (
                <Text style={[styles.modalMeta, {color: colors.textSecondary}]}>📍 {selectedUser.activity_area}</Text>
              ) : null}
              {selectedUser?.bio ? (
                <Text style={[styles.modalBio, {color: colors.textSecondary}]}>{selectedUser.bio}</Text>
              ) : null}
              {selectedUser?.hobby_tags?.length ? (
                <>
                  <Text style={[styles.sectionLabel, {color: colors.textMuted}]}>취미</Text>
                  <View style={styles.tagRow}>
                    {selectedUser.hobby_tags.map(tag => (
                      <View key={tag} style={[styles.tag, {backgroundColor: colors.tagBg, borderColor: colors.border}]}>
                        <Text style={[styles.tagText, {color: colors.tagText}]}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
              {selectedUser?.ideal_type_tags?.length ? (
                <>
                  <Text style={[styles.sectionLabel, {color: colors.textMuted}]}>이상형</Text>
                  <View style={styles.tagRow}>
                    {selectedUser.ideal_type_tags.map(tag => (
                      <View key={tag} style={[styles.tag, {backgroundColor: 'rgba(255,112,67,0.18)', borderColor: 'rgba(255,112,67,0.4)'}]}>
                        <Text style={[styles.tagText, styles.tagIdealText]}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
              <View style={{height: 8}} />
            </ScrollView>

            {/* 액션 버튼 */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.superBtn}
                onPress={handleSuperLike}
                disabled={actionLoading}>
                {actionLoading ? (
                  <ActivityIndicator color="#29b6f6" />
                ) : (
                  <>
                    <Text style={styles.superBtnIcon}>★</Text>
                    <Text style={styles.superBtnLabel}>슈퍼라이크</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.likeBtn}
                onPress={handleLike}
                disabled={actionLoading}>
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.likeBtnIcon}>♥</Text>
                    <Text style={styles.likeBtnLabel}>좋아요</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  map: {flex: 1},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff'},
  loadingText: {marginTop: 12, fontSize: 14, color: '#888'},
  deniedIcon: {fontSize: 48, marginBottom: 12},
  deniedTitle: {fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 8},
  deniedSub: {fontSize: 14, color: '#aaa'},

  // 마커
  markerOuter: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: '#4CAF50',
    backgroundColor: '#e8f5e9',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  markerImg: {width: 46, height: 46, borderRadius: 23},
  markerFallback: {width: 46, height: 46, justifyContent: 'center', alignItems: 'center'},
  markerTail: {
    width: 10,
    height: 10,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#4CAF50',
    alignSelf: 'center',
    marginTop: -1,
  },

  // 유저 수 배지
  countBadge: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(76,175,80,0.92)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  countBadgeText: {color: '#fff', fontSize: 13, fontWeight: '600'},

  // 모달
  modalBackdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end'},
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    height: '75%',
  },

  // 사진 캐러셀
  photoWrap: {height: 240, position: 'relative'},
  photoPlaceholder: {height: 240, backgroundColor: '#e8f5e9', justifyContent: 'center', alignItems: 'center'},
  photoNavBtn: {
    position: 'absolute', top: 0, bottom: 0, width: 48,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  photoNavText: {fontSize: 36, color: '#fff', lineHeight: 42},
  dotRow: {
    position: 'absolute', bottom: 8, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  dot: {width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)'},
  dotActive: {backgroundColor: '#fff', width: 8, height: 8, borderRadius: 4},

  // 프로필 정보
  infoScroll: {paddingHorizontal: 20, paddingTop: 14, flex: 1},
  nameRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4},
  modalName: {fontSize: 20, fontWeight: '700', color: '#111'},
  distLabel: {fontSize: 13, color: '#4CAF50', fontWeight: '600'},
  modalMeta: {fontSize: 13, color: '#666', marginBottom: 3},
  modalBio: {fontSize: 14, color: '#444', marginTop: 6, lineHeight: 20},
  tagRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10},
  tag: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#f1f8f1', borderRadius: 12,
    borderWidth: 1, borderColor: '#c8e6c9',
  },
  tagText: {fontSize: 12, color: '#4CAF50'},
  sectionLabel: {fontSize: 13, fontWeight: '600', color: '#888', marginTop: 12, marginBottom: 6},
  tagIdeal: {backgroundColor: '#fff3f0', borderColor: '#ffccbc'},
  tagIdealText: {fontSize: 12, color: '#FF7043'},

  // 액션 버튼
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 24,
  },
  superBtn: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#29b6f6',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  superBtnIcon: {fontSize: 20, color: '#29b6f6'},
  superBtnLabel: {fontSize: 14, fontWeight: '600', color: '#29b6f6'},
  likeBtn: {
    flex: 2,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  likeBtnIcon: {fontSize: 20, color: '#fff'},
  likeBtnLabel: {fontSize: 14, fontWeight: '600', color: '#fff'},

  // 내 위치 마커
  myLocationOuter: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(66,133,244,0.2)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(66,133,244,0.4)',
  },
  myLocationDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#4285F4',
    borderWidth: 2, borderColor: '#fff',
  },
});
