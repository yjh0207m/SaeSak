import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {RootStackParamList} from '../navigation/RootNavigator';

type Nav = StackNavigationProp<RootStackParamList>;

interface Profile {
  nickname: string;
  bio: string;
  photos: string[];
  hobby_tags: string[];
  activity_area: string;
  completeness: number;
}

interface UserData {
  coin_balance: number;
  is_premium: boolean;
}

interface Stats {
  likes: number;
  superlikes: number;
  matches: number;
}

export default function MyProfileScreen() {
  const navigation = useNavigation<Nav>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({likes: 0, superlikes: 0, matches: 0});

  const uid = auth().currentUser?.uid;

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    const unsub1 = firestore()
      .collection('profiles')
      .doc(uid)
      .onSnapshot(snap => {
        if (snap?.exists()) setProfile(snap.data() as Profile);
      }, () => {});
    const unsub2 = firestore()
      .collection('users')
      .doc(uid)
      .onSnapshot(snap => {
        if (snap?.exists()) setUserData(snap.data() as UserData);
        setLoading(false);
      }, () => setLoading(false));

    // 통계 로드
    const loadStats = async () => {
      try {
        const [likeSnap, superSnap, matchSnap] = await Promise.all([
          firestore().collection('swipes').where('to_uid', '==', uid).where('type', '==', 'like').get(),
          firestore().collection('swipes').where('to_uid', '==', uid).where('type', '==', 'super').get(),
          firestore().collection('matches').where('user_ids', 'array-contains', uid).where('status', '==', 'active').get(),
        ]);
        setStats({
          likes: likeSnap.size,
          superlikes: superSnap.size,
          matches: matchSnap.size,
        });
      } catch {}
    };
    loadStats();

    // 주간 코인 지급 체크
    const grantWeeklyCoins = async () => {
      try {
        const subSnap = await firestore().collection('subscriptions').doc(uid).get();
        if (!subSnap.exists()) {return;}
        const sub = subSnap.data()!;
        const exp: Date | null = sub.expires_at?.toDate() ?? null;
        if (!exp || exp < new Date()) {return;}
        const lastGrant: Date | null = sub.weekly_coin_granted_at?.toDate() ?? null;
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (lastGrant && Date.now() - lastGrant.getTime() < sevenDays) {return;}
        const coins: number = sub.tier === 'sprout_plus_plus' ? 15 : 5;
        await firestore().runTransaction(async tx => {
          const userRef = firestore().collection('users').doc(uid);
          const userDoc = await tx.get(userRef);
          tx.update(userRef, {coin_balance: (userDoc.data()?.coin_balance ?? 0) + coins});
          tx.update(firestore().collection('subscriptions').doc(uid), {
            weekly_coin_granted_at: firestore.FieldValue.serverTimestamp(),
          });
        });
      } catch {}
    };
    grantWeeklyCoins();

    return () => {
      unsub1();
      unsub2();
    };
  }, [uid]);

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃 하시겠어요?', [
      {text: '취소', style: 'cancel'},
      {text: '로그아웃', style: 'destructive', onPress: () => auth().signOut()},
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  const completeness = profile?.completeness ?? 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>

      {/* 헤더 */}
      <View style={styles.header}>
        {profile?.photos?.[0] ? (
          <Image source={{uri: profile.photos[0]}} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarPlaceholderText}>🌱</Text>
          </View>
        )}
        <Text style={styles.nickname}>{profile?.nickname ?? '닉네임 없음'}</Text>
        {profile?.activity_area ? (
          <Text style={styles.area}>📍 {profile.activity_area}</Text>
        ) : null}
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => navigation.navigate('EditProfile')}>
          <Text style={styles.editBtnText}>프로필 편집</Text>
        </TouchableOpacity>
      </View>

      {/* 코인 / 프리미엄 */}
      <View style={styles.statsRow}>
        <TouchableOpacity style={styles.statBox} onPress={() => navigation.navigate('CoinShop')}>
          <Text style={styles.statValue}>🪙 {userData?.coin_balance ?? 0}</Text>
          <Text style={styles.statLabel}>코인 충전 →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.statBox} onPress={() => navigation.navigate('Premium')}>
          <Text style={styles.statValue}>
            {userData?.is_premium ? '⭐ 프리미엄' : '일반'}
          </Text>
          <Text style={styles.statLabel}>
            {userData?.is_premium ? '구독 중' : '업그레이드 →'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 활동 대시보드 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>활동 현황</Text>
        <View style={styles.dashRow}>
          <View style={styles.dashItem}>
            <Text style={styles.dashValue}>{stats.likes}</Text>
            <Text style={styles.dashLabel}>받은 좋아요</Text>
            <Text style={styles.dashEmoji}>♥</Text>
          </View>
          <View style={styles.dashDivider} />
          <View style={styles.dashItem}>
            <Text style={[styles.dashValue, {color: '#29b6f6'}]}>{stats.superlikes}</Text>
            <Text style={styles.dashLabel}>슈퍼라이크</Text>
            <Text style={styles.dashEmoji}>★</Text>
          </View>
          <View style={styles.dashDivider} />
          <View style={styles.dashItem}>
            <Text style={[styles.dashValue, {color: '#4CAF50'}]}>{stats.matches}</Text>
            <Text style={styles.dashLabel}>매칭</Text>
            <Text style={styles.dashEmoji}>💚</Text>
          </View>
        </View>
      </View>

      {/* 프로필 완성도 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>프로필 완성도</Text>
          <Text style={styles.completenessValue}>{completeness}%</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, {width: `${completeness}%`}]} />
        </View>
        {completeness < 80 ? (
          <Text style={styles.progressHint}>
            80% 이상이면 매칭 노출 우선순위가 높아져요
          </Text>
        ) : (
          <Text style={styles.progressBoosted}>🌱 매칭 노출 우선순위 상향 중!</Text>
        )}
      </View>

      {/* 자기소개 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>자기소개</Text>
        {profile?.bio ? (
          <Text style={styles.bio}>{profile.bio}</Text>
        ) : (
          <Text style={styles.empty}>자기소개를 작성해보세요</Text>
        )}
      </View>

      {/* 취미 태그 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>취미</Text>
        {profile?.hobby_tags?.length ? (
          <View style={styles.tagRow}>
            {profile.hobby_tags.map(tag => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>취미 태그를 추가해보세요</Text>
        )}
      </View>

      {/* 메뉴 */}
      <View style={styles.menuSection}>
        {[
          {label: '코인 충전', onPress: () => navigation.navigate('CoinShop')},
          {label: '프리미엄 구독', onPress: () => navigation.navigate('Premium')},
          {label: '프로필 편집', onPress: () => navigation.navigate('EditProfile')},
        ].map(item => (
          <TouchableOpacity key={item.label} style={styles.menuItem} onPress={item.onPress}>
            <Text style={styles.menuItemText}>{item.label}</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 로그아웃 */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>로그아웃</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f5'},
  inner: {paddingBottom: 48},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},

  header: {
    alignItems: 'center', paddingTop: 48, paddingBottom: 24,
    backgroundColor: '#fff', marginBottom: 12,
  },
  avatar: {width: 96, height: 96, borderRadius: 48, marginBottom: 12},
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#e8f5e9', justifyContent: 'center',
    alignItems: 'center', marginBottom: 12,
  },
  avatarPlaceholderText: {fontSize: 40},
  nickname: {fontSize: 22, fontWeight: '700', color: '#222'},
  area: {fontSize: 13, color: '#888', marginTop: 4},
  editBtn: {
    marginTop: 12, paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#4CAF50',
  },
  editBtnText: {fontSize: 13, color: '#4CAF50', fontWeight: '600'},

  statsRow: {flexDirection: 'row', marginHorizontal: 12, marginBottom: 12, gap: 8},
  statBox: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
  },
  statValue: {fontSize: 16, fontWeight: '700', color: '#222'},
  statLabel: {fontSize: 12, color: '#4CAF50', marginTop: 4},

  section: {
    backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 12,
    borderRadius: 12, padding: 16,
  },
  sectionHeader: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8},
  sectionTitle: {fontSize: 14, fontWeight: '600', color: '#555'},
  completenessValue: {fontSize: 14, fontWeight: '700', color: '#4CAF50'},
  progressBar: {height: 8, backgroundColor: '#e0e0e0', borderRadius: 4},
  progressFill: {height: 8, backgroundColor: '#4CAF50', borderRadius: 4},
  progressHint: {fontSize: 12, color: '#aaa', marginTop: 6},
  progressBoosted: {fontSize: 12, color: '#4CAF50', marginTop: 6},
  bio: {fontSize: 14, color: '#444', lineHeight: 22},
  empty: {fontSize: 14, color: '#ccc'},
  tagRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  tag: {paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#e8f5e9', borderRadius: 20},
  tagText: {fontSize: 13, color: '#4CAF50'},

  menuSection: {
    backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 12, borderRadius: 12,
  },
  menuItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  menuItemText: {fontSize: 15, color: '#333'},
  menuArrow: {fontSize: 20, color: '#ccc'},

  logoutBtn: {
    marginHorizontal: 12, height: 52, borderRadius: 12,
    borderWidth: 1, borderColor: '#ff5252',
    justifyContent: 'center', alignItems: 'center',
  },
  logoutText: {color: '#ff5252', fontSize: 15, fontWeight: '600'},

  dashRow: {flexDirection: 'row', alignItems: 'center', marginTop: 8},
  dashItem: {flex: 1, alignItems: 'center', paddingVertical: 8},
  dashValue: {fontSize: 26, fontWeight: '800', color: '#ff4458'},
  dashLabel: {fontSize: 12, color: '#888', marginTop: 2},
  dashEmoji: {fontSize: 16, marginTop: 4},
  dashDivider: {width: 1, height: 40, backgroundColor: '#f0f0f0'},
});
