import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {RootStackParamList} from '../../navigation/RootNavigator';
import {useTheme} from '../../context/ThemeContext';

interface FlirtingItem {
  id: string;
  from_uid: string;
  from_nickname: string;
  from_photo: string | null;
  created_at: number;
}

interface LastMessage {
  content: string;
  sender_uid: string;
  type: string;
  created_at: {toMillis: () => number} | null;
}

interface MatchItem {
  matchId: string;
  otherUid: string;
  otherNickname: string;
  otherPhoto: string | null;
  lastMessage: LastMessage | null;
}

const KST_OFFSET = 9 * 60 * 60 * 1000;

function formatListTime(ts: number | null | undefined): string {
  if (!ts) {return '';}
  const d = new Date(ts + KST_OFFSET);
  const now = new Date(Date.now() + KST_OFFSET);
  const isToday =
    d.getUTCDate() === now.getUTCDate() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCFullYear() === now.getUTCFullYear();
  if (isToday) {
    const h = d.getUTCHours();
    const m = d.getUTCMinutes().toString().padStart(2, '0');
    return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${m}`;
  }
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export default function ChatListScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [flirtings, setFlirtings] = useState<FlirtingItem[]>([]);

  const currentUid = auth().currentUser?.uid;

  // 플러팅 수신함 로드
  useEffect(() => {
    if (!currentUid) {return;}
    const unsub = firestore()
      .collection('flirtings')
      .where('to_uid', '==', currentUid)
      .where('status', '==', 'pending')
      .onSnapshot(async snap => {
        if (!snap || snap.empty) {setFlirtings([]); return;}
        const items = await Promise.all(
          snap.docs.map(async doc => {
            const d = doc.data();
            let from_nickname = '알 수 없음';
            let from_photo: string | null = null;
            try {
              const p = await firestore().collection('profiles').doc(d.from_uid).get();
              if (p.exists()) {
                from_nickname = p.data()!.nickname ?? from_nickname;
                from_photo = p.data()!.photos?.[0] ?? null;
              }
            } catch {}
            return {
              id: doc.id,
              from_uid: d.from_uid,
              from_nickname,
              from_photo,
              created_at: d.created_at?.toMillis() ?? 0,
            } as FlirtingItem;
          }),
        );
        setFlirtings(items.sort((a, b) => b.created_at - a.created_at));
      }, () => {});
    return unsub;
  }, [currentUid]);

  const handleAcceptFlirting = async (item: FlirtingItem) => {
    if (!currentUid) {return;}
    Alert.alert(
      '플러팅 수락',
      `${item.from_nickname}님의 플러팅을 수락할까요?\n수락하면 바로 매칭이 성립돼요!`,
      [
        {text: '거절', style: 'cancel', onPress: async () => {
          await firestore().collection('flirtings').doc(item.id)
            .update({status: 'rejected'}).catch(() => {});
        }},
        {text: '수락', onPress: async () => {
          try {
            await firestore().collection('flirtings').doc(item.id)
              .update({status: 'accepted'});
            await firestore().collection('matches').add({
              user_ids: [currentUid, item.from_uid],
              status: 'active',
              meeting_plan: null,
              safety_checked: false,
              created_at: firestore.FieldValue.serverTimestamp(),
            });
            Alert.alert('🎉 매칭 성립!', `${item.from_nickname}님과 매칭됐어요!`);
          } catch {
            Alert.alert('오류', '처리 중 문제가 발생했어요.');
          }
        }},
      ],
    );
  };

  useEffect(() => {
    if (!currentUid) {return;}

    // status 필터를 쿼리에서 제거하고 클라이언트에서 필터링
    // → array-contains 단독 사용으로 복합 인덱스 불필요
    const unsub = firestore()
      .collection('matches')
      .where('user_ids', 'array-contains', currentUid)
      .onSnapshot(
        async snap => {
          if (!snap || snap.empty) {
            setMatches([]);
            setLoading(false);
            return;
          }

          // active 매치만 클라이언트 필터링
          const activeDocs = snap.docs.filter(
            doc => doc.data().status === 'active',
          );

          if (activeDocs.length === 0) {
            setMatches([]);
            setLoading(false);
            return;
          }

          // 각 매치의 상대방 프로필 병렬 조회
          const items = await Promise.all(
            activeDocs.map(async doc => {
              const data = doc.data();
              const otherUid: string = data.user_ids.find(
                (uid: string) => uid !== currentUid,
              );

              let otherNickname = '알 수 없음';
              let otherPhoto: string | null = null;
              try {
                const profileDoc = await firestore()
                  .collection('profiles')
                  .doc(otherUid)
                  .get();
                if (profileDoc.exists()) {
                  const p = profileDoc.data()!;
                  otherNickname = p.nickname ?? '알 수 없음';
                  otherPhoto = p.photos?.[0] ?? null;
                }
              } catch {}

              return {
                matchId: doc.id,
                otherUid,
                otherNickname,
                otherPhoto,
                lastMessage: data.last_message ?? null,
              } as MatchItem;
            }),
          );

          // 마지막 메시지 최신순 정렬
          items.sort((a, b) => {
            const at = a.lastMessage?.created_at?.toMillis() ?? 0;
            const bt = b.lastMessage?.created_at?.toMillis() ?? 0;
            return bt - at;
          });

          setMatches(items);
          setLoading(false);
        },
        err => {
          // 로그아웃 타이밍에 발생하는 permission-denied는 정상 — 무시
          if ((err as any)?.code !== 'firestore/permission-denied') {
            console.error('ChatList onSnapshot error:', err);
          }
          setMatches([]);
          setLoading(false);
        },
      );

    return unsub;
  }, [currentUid]);

  const renderItem = ({item}: {item: MatchItem}) => {
    const lastText =
      item.lastMessage?.type === 'image'
        ? '📷 사진'
        : item.lastMessage?.content ?? '매칭됐어요! 먼저 인사해보세요 👋';
    const time = item.lastMessage?.created_at
      ? formatListTime(item.lastMessage.created_at.toMillis())
      : '';

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() =>
          navigation.navigate('ChatRoom', {
            matchId: item.matchId,
            otherUserNickname: item.otherNickname,
            otherUserUid: item.otherUid,
          })
        }>
        {item.otherPhoto ? (
          <Image source={{uri: item.otherPhoto}} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarFallbackText}>🌱</Text>
          </View>
        )}
        <View style={styles.info}>
          <View style={styles.topRow}>
            <Text style={[styles.nickname, {color: colors.textPrimary}]}>{item.otherNickname}</Text>
            <Text style={[styles.time, {color: colors.textMuted}]}>{time}</Text>
          </View>
          <Text style={[styles.lastMsg, {color: colors.textSecondary}]} numberOfLines={1}>
            {lastText}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, {backgroundColor: colors.bg}]}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <View style={[styles.container, {backgroundColor: colors.bg}]}>
      <Text style={[styles.header, {color: colors.textPrimary}]}>💬 채팅</Text>

      {/* 플러팅 수신함 */}
      {flirtings.length > 0 && (
        <View style={[styles.flirtSection, {borderBottomColor: colors.divider}]}>
          <Text style={styles.flirtTitle}>💌 플러팅 {flirtings.length}건</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.flirtScroll}>
            {flirtings.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.flirtCard}
                onPress={() => handleAcceptFlirting(item)}>
                {item.from_photo ? (
                  <Image source={{uri: item.from_photo}} style={styles.flirtAvatar} />
                ) : (
                  <View style={styles.flirtAvatarFallback}>
                    <Text style={{fontSize: 20}}>🌱</Text>
                  </View>
                )}
                <Text style={styles.flirtName} numberOfLines={1}>{item.from_nickname}</Text>
                <View style={styles.flirtBadge}>
                  <Text style={styles.flirtBadgeText}>수락하기</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      {matches.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🌱</Text>
          <Text style={[styles.emptyText, {color: colors.textPrimary}]}>아직 매칭된 상대가 없어요</Text>
          <Text style={[styles.emptySub, {color: colors.textMuted}]}>탐색 탭에서 새싹을 찾아보세요!</Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={item => item.matchId}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={[styles.separator, {backgroundColor: colors.divider}]} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#151a28'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    marginRight: 12,
  },
  avatarFallback: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(76,175,80,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarFallbackText: {fontSize: 24},
  info: {flex: 1},
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  nickname: {fontSize: 15, fontWeight: '600', color: '#fff'},
  time: {fontSize: 12, color: 'rgba(255,255,255,0.35)'},
  lastMsg: {fontSize: 14, color: 'rgba(255,255,255,0.5)'},
  separator: {height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 82},
  emptyIcon: {fontSize: 56, marginBottom: 12},
  emptyText: {fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 6},
  emptySub: {fontSize: 13, color: 'rgba(255,255,255,0.4)'},

  // 플러팅 수신함
  flirtSection: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 12,
    marginBottom: 4,
  },
  flirtTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ce93d8',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  flirtScroll: {paddingLeft: 16},
  flirtCard: {
    width: 90,
    alignItems: 'center',
    marginRight: 12,
  },
  flirtAvatar: {width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#ce93d8'},
  flirtAvatarFallback: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(156,39,176,0.2)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#ce93d8',
  },
  flirtName: {fontSize: 12, color: '#fff', marginTop: 6, fontWeight: '600', textAlign: 'center'},
  flirtBadge: {
    marginTop: 4,
    backgroundColor: '#9c27b0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  flirtBadgeText: {fontSize: 10, color: '#fff', fontWeight: '700'},
});
