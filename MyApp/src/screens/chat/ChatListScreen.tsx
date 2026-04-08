import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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

function formatListTime(ts: number | null | undefined): string {
  if (!ts) {return '';}
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${m}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function ChatListScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);

  const currentUid = auth().currentUser?.uid;

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
            <Text style={styles.nickname}>{item.otherNickname}</Text>
            <Text style={styles.time}>{time}</Text>
          </View>
          <Text style={styles.lastMsg} numberOfLines={1}>
            {lastText}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>💬 채팅</Text>
      {matches.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🌱</Text>
          <Text style={styles.emptyText}>아직 매칭된 상대가 없어요</Text>
          <Text style={styles.emptySub}>탐색 탭에서 새싹을 찾아보세요!</Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={item => item.matchId}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
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
    backgroundColor: '#e8f5e9',
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
  nickname: {fontSize: 15, fontWeight: '600', color: '#222'},
  time: {fontSize: 12, color: '#aaa'},
  lastMsg: {fontSize: 14, color: '#777'},
  separator: {height: 1, backgroundColor: '#f0f0f0', marginLeft: 82},
  emptyIcon: {fontSize: 56, marginBottom: 12},
  emptyText: {fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 6},
  emptySub: {fontSize: 13, color: '#aaa'},
});
