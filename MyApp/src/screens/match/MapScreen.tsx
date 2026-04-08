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

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const CURRENT_YEAR = new Date().getFullYear();

// Haversine 거리 계산 (km)
function getDistanceKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
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

// 위치를 ~100m 정밀도로 퍼지화
function fuzzyLocation(lat: number, lng: number) {
  return {
    lat: Math.round(lat * 1000) / 1000,
    lng: Math.round(lng * 1000) / 1000,
  };
}

interface NearbyUser extends ProfileData {
  distanceKm: number;
}

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const currentUid = auth().currentUser?.uid;
  const {filter} = useMatchStore();

  const [myLocation, setMyLocation] = useState<{lat: number; lng: number} | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);

  // 선택된 유저 프로필 미니카드
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  // 위치 권한 요청
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
    return true; // iOS는 Geolocation.requestAuthorization()으로 처리
  };

  // 주변 유저 로드
  const loadNearbyUsers = useCallback(
    async (myLat: number, myLng: number) => {
      if (!currentUid) {return;}
      try {
        const snap = await firestore().collection('profiles').limit(100).get();
        const maxDist = filter.maxDistance === 0 ? Infinity : filter.maxDistance;

        const users: NearbyUser[] = [];
        snap.docs.forEach(doc => {
          if (doc.id === currentUid) {return;}
          const data = doc.data() as Omit<ProfileData, 'uid'>;
          const loc = data.location_fuzzy as {lat: number; lng: number} | null;
          if (!loc) {return;}
          const dist = getDistanceKm(myLat, myLng, loc.lat, loc.lng);
          if (dist > maxDist) {return;}
          users.push({uid: doc.id, ...data, distanceKm: dist});
        });

        users.sort((a, b) => a.distanceKm - b.distanceKm);
        setNearbyUsers(users);
      } catch {
        // 조용히 처리
      }
    },
    [currentUid, filter.maxDistance],
  );

  // 위치 취득 + Firestore 업데이트
  useEffect(() => {
    let watchId: number;

    const init = async () => {
      const granted = await requestPermission();
      if (!granted) {
        setLocationDenied(true);
        setLoading(false);
        return;
      }

      watchId = Geolocation.watchPosition(
        pos => {
          const {latitude: lat, longitude: lng} = pos.coords;
          setMyLocation({lat, lng});
          setLoading(false);

          // Firestore에 위치 업데이트 (정확 위치 + 퍼지 위치)
          if (currentUid) {
            const fuzzy = fuzzyLocation(lat, lng);
            firestore()
              .collection('profiles')
              .doc(currentUid)
              .update({
                location: {lat, lng},
                location_fuzzy: fuzzy,
              })
              .catch(() => {});

            // 주변 유저 로드
            loadNearbyUsers(fuzzy.lat, fuzzy.lng);
          }
        },
        err => {
          console.warn('Location error:', err);
          setLoading(false);
        },
        {enableHighAccuracy: true, distanceFilter: 50, interval: 30000},
      );
    };

    init();
    return () => {
      if (watchId != null) {Geolocation.clearWatch(watchId);}
    };
  }, [currentUid, loadNearbyUsers]);

  const handleMarkerPress = (user: NearbyUser) => {
    setSelectedUser(user);
    setPhotoIndex(0);
  };

  const handleOpenProfile = () => {
    setProfileModalVisible(true);
  };

  const distanceLabel = (km: number) =>
    km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>위치를 가져오는 중...</Text>
      </View>
    );
  }

  if (locationDenied) {
    return (
      <View style={styles.center}>
        <Text style={styles.deniedIcon}>📍</Text>
        <Text style={styles.deniedTitle}>위치 권한이 필요해요</Text>
        <Text style={styles.deniedSub}>설정에서 위치 권한을 허용해주세요.</Text>
      </View>
    );
  }

  const initialRegion: Region | undefined = myLocation
    ? {
        latitude: myLocation.lat,
        longitude: myLocation.lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : undefined;

  const age = selectedUser
    ? CURRENT_YEAR - (selectedUser.birth_year ?? 0) + 1
    : null;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
        onPress={() => setSelectedUser(null)}>
        {/* 주변 유저 마커 */}
        {nearbyUsers.map(user => {
          const loc = user.location_fuzzy as {lat: number; lng: number};
          return (
            <Marker
              key={user.uid}
              coordinate={{latitude: loc.lat, longitude: loc.lng}}
              onPress={() => handleMarkerPress(user)}>
              <View style={styles.markerWrap}>
                {user.photos?.[0] ? (
                  <Image source={{uri: user.photos[0]}} style={styles.markerAvatar} />
                ) : (
                  <View style={styles.markerAvatarPlaceholder}>
                    <Text style={{fontSize: 14}}>🌱</Text>
                  </View>
                )}
              </View>
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

      {/* 선택된 유저 미니카드 */}
      {selectedUser && (
        <TouchableOpacity
          style={styles.miniCard}
          activeOpacity={0.95}
          onPress={handleOpenProfile}>
          {selectedUser.photos?.[0] ? (
            <Image source={{uri: selectedUser.photos[0]}} style={styles.miniPhoto} />
          ) : (
            <View style={[styles.miniPhoto, styles.miniPhotoPlaceholder]}>
              <Text style={{fontSize: 24}}>🌱</Text>
            </View>
          )}
          <View style={styles.miniInfo}>
            <Text style={styles.miniName}>
              {selectedUser.nickname}  {age}세
            </Text>
            {(selectedUser.job || selectedUser.job_field) ? (
              <Text style={styles.miniMeta}>
                💼 {[selectedUser.job, selectedUser.job_field].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            {selectedUser.activity_area ? (
              <Text style={styles.miniMeta}>📍 {selectedUser.activity_area}</Text>
            ) : null}
            <Text style={styles.miniDist}>
              🗺 {distanceLabel(selectedUser.distanceKm)} 거리
            </Text>
          </View>
          <Text style={styles.miniArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* 프로필 상세 모달 */}
      <Modal
        visible={profileModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setProfileModalVisible(false)}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setProfileModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            {/* 사진 캐러셀 */}
            {selectedUser?.photos?.length ? (
              <View style={styles.modalPhotoWrap}>
                <Image
                  source={{uri: selectedUser.photos[photoIndex]}}
                  style={{width: SCREEN_WIDTH, height: 260}}
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
              <View style={styles.modalPhotoPlaceholder}>
                <Text style={{fontSize: 48}}>🌱</Text>
              </View>
            )}

            <ScrollView style={styles.modalInfo} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalName}>
                {selectedUser?.nickname}  {age}세
              </Text>
              <Text style={styles.modalDist}>
                🗺 {selectedUser ? distanceLabel(selectedUser.distanceKm) : ''} 거리
              </Text>
              {(selectedUser?.job || selectedUser?.job_field) ? (
                <Text style={styles.modalMeta}>
                  💼 {[selectedUser?.job, selectedUser?.job_field].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {selectedUser?.activity_area ? (
                <Text style={styles.modalMeta}>📍 {selectedUser.activity_area}</Text>
              ) : null}
              {selectedUser?.bio ? (
                <Text style={styles.modalBio}>{selectedUser.bio}</Text>
              ) : null}
              {selectedUser?.hobby_tags?.length ? (
                <>
                  <Text style={styles.modalSectionLabel}>취미</Text>
                  <View style={styles.modalTags}>
                    {selectedUser.hobby_tags.map(tag => (
                      <View key={tag} style={styles.modalTag}>
                        <Text style={styles.modalTagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
              {selectedUser?.ideal_type_tags?.length ? (
                <>
                  <Text style={styles.modalSectionLabel}>이상형</Text>
                  <View style={styles.modalTags}>
                    {selectedUser.ideal_type_tags.map(tag => (
                      <View key={tag} style={[styles.modalTag, styles.modalTagIdeal]}>
                        <Text style={[styles.modalTagText, {color: '#FF7043'}]}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
              <View style={{height: 32}} />
            </ScrollView>
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
  markerWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: '#4CAF50',
    overflow: 'hidden',
    backgroundColor: '#e8f5e9',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  markerAvatar: {width: 40, height: 40, borderRadius: 20},
  markerAvatarPlaceholder: {width: 40, height: 40, justifyContent: 'center', alignItems: 'center'},

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

  // 미니카드
  miniCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.15,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  miniPhoto: {width: 80, height: 80},
  miniPhotoPlaceholder: {backgroundColor: '#e8f5e9', justifyContent: 'center', alignItems: 'center'},
  miniInfo: {flex: 1, padding: 12, gap: 3},
  miniName: {fontSize: 16, fontWeight: '700', color: '#111'},
  miniMeta: {fontSize: 12, color: '#666'},
  miniDist: {fontSize: 12, color: '#4CAF50', fontWeight: '600'},
  miniArrow: {fontSize: 24, color: '#ccc', paddingRight: 12},

  // 모달
  modalBackdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end'},
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    height: '70%',
  },
  modalPhotoWrap: {height: 260, position: 'relative'},
  modalPhotoPlaceholder: {height: 260, backgroundColor: '#e8f5e9', justifyContent: 'center', alignItems: 'center'},
  modalInfo: {padding: 20},
  modalName: {fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 2},
  modalDist: {fontSize: 13, color: '#4CAF50', fontWeight: '600', marginBottom: 6},
  modalMeta: {fontSize: 13, color: '#666', marginBottom: 4},
  modalBio: {fontSize: 14, color: '#444', marginTop: 10, lineHeight: 21},
  modalSectionLabel: {fontSize: 13, fontWeight: '600', color: '#888', marginTop: 14, marginBottom: 6},
  modalTags: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  modalTag: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#f1f8f1', borderRadius: 12,
    borderWidth: 1, borderColor: '#c8e6c9',
  },
  modalTagText: {fontSize: 12, color: '#4CAF50'},
  modalTagIdeal: {backgroundColor: '#fff3f0', borderColor: '#ffccbc'},

  // 캐러셀
  photoNavBtn: {
    position: 'absolute', top: 0, bottom: 0, width: 48,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  photoNavText: {fontSize: 36, color: '#fff', fontWeight: '300', lineHeight: 42},
  dotRow: {
    position: 'absolute', bottom: 10, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  dot: {width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)'},
  dotActive: {backgroundColor: '#fff', width: 8, height: 8, borderRadius: 4},
});
