import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
import {RouteProp, useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import {launchImageLibrary} from 'react-native-image-picker';
import ChatBubble from '../../components/ChatBubble';
import useChatStore from '../../store/chatStore';
import {RootStackParamList} from '../../navigation/RootNavigator';

interface ExclusivityDoc {
  id: string;
  user_ids: string[];
  status: 'active' | 'ended';
  expires_at: {toDate: () => Date} | null;
  cancelled_by: string | null;
}

interface Message {
  id: string;
  sender_uid: string;
  type: 'text' | 'image';
  content: string;
  image_url?: string | null;
  read_at: {toMillis: () => number} | null;
  created_at: {toMillis: () => number} | null;
}

type ChatRoomRouteProp = RouteProp<RootStackParamList, 'ChatRoom'>;

interface OtherProfile {
  nickname: string;
  photos: string[];
  birth_year: number;
  gender: string;
  bio: string;
  activity_area: string;
  job: string;
  job_field: string;
  hobby_tags: string[];
  ideal_type_tags: string[];
}

export default function ChatRoomScreen() {
  const route = useRoute<ChatRoomRouteProp>();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const {matchId, otherUserNickname, otherUserUid} = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [otherProfile, setOtherProfile] = useState<OtherProfile | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  // 매칭 상태
  const [matchStatus, setMatchStatus] = useState<'active' | 'cancelled'>('active');

  // 독점
  const [exclusivity, setExclusivity] = useState<ExclusivityDoc | null>(null);
  const [exCooldownUntil, setExCooldownUntil] = useState<Date | null>(null);
  const [exLoading, setExLoading] = useState(false);

  // + 메뉴
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const toggleMenu = () => {
    const open = !menuOpen;
    setMenuOpen(open);
    Animated.timing(menuAnim, {
      toValue: open ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };
  const flatListRef = useRef<FlatList>(null);
  const markedReadRef = useRef<Set<string>>(new Set());

  const {setActiveMatchId} = useChatStore();
  const currentUid = auth().currentUser?.uid;

  // 헤더 타이틀 (독점 활성 시 💍 표시)
  useEffect(() => {
    navigation.setOptions({
      title: exclusivity ? `💍 ${otherUserNickname}` : otherUserNickname,
    });
  }, [navigation, otherUserNickname, exclusivity]);

  // 상대방 프로필 로드
  useEffect(() => {
    firestore()
      .collection('profiles')
      .doc(otherUserUid)
      .get()
      .then(doc => {
        if (!doc.exists()) {return;}
        const d = doc.data()!;
        setOtherProfile({
          nickname: d.nickname ?? '',
          photos: d.photos ?? [],
          birth_year: d.birth_year ?? 0,
          gender: d.gender ?? '',
          bio: d.bio ?? '',
          activity_area: d.activity_area ?? '',
          job: d.job ?? '',
          job_field: d.job_field ?? '',
          hobby_tags: d.hobby_tags ?? [],
          ideal_type_tags: d.ideal_type_tags ?? [],
        });
      })
      .catch(() => {});
  }, [otherUserUid]);

  // 채팅방 열림/닫힘 상태 기록
  useEffect(() => {
    setActiveMatchId(matchId);
    return () => setActiveMatchId(null);
  }, [matchId, setActiveMatchId]);

  // 매칭 상태 실시간 구독
  useEffect(() => {
    const unsub = firestore()
      .collection('matches')
      .doc(matchId)
      .onSnapshot(snap => {
        const status = snap?.data()?.status;
        setMatchStatus(status === 'cancelled' ? 'cancelled' : 'active');
      }, () => {});
    return unsub;
  }, [matchId]);

  // 매칭 취소
  const handleCancelMatch = () => {
    Alert.alert(
      '💔 매칭 취소',
      '매칭을 취소할까요?\n대화 내용은 남아있고, 탐색에서 다시 만날 수 있어요.',
      [
        {text: '취소', style: 'cancel'},
        {
          text: '매칭 취소',
          style: 'destructive',
          onPress: async () => {
            try {
              await firestore()
                .collection('matches')
                .doc(matchId)
                .update({status: 'cancelled'});
            } catch {
              Alert.alert('오류', '매칭 취소 중 문제가 발생했어요.');
            }
          },
        },
      ],
    );
  };

  // 독점 상태 로드 + 자동 연장 체크
  useEffect(() => {
    if (!currentUid) {return;}
    const unsub = firestore()
      .collection('exclusivity')
      .where('user_ids', 'array-contains', currentUid)
      .where('status', '==', 'active')
      .onSnapshot(async snap => {
        const doc = snap?.docs.find(d =>
          d.data().user_ids.includes(otherUserUid),
        );
        if (!doc) {setExclusivity(null); return;}

        const data = doc.data();
        const exDoc: ExclusivityDoc = {
          id: doc.id,
          user_ids: data.user_ids,
          status: data.status,
          expires_at: data.expires_at ?? null,
          cancelled_by: data.cancelled_by ?? null,
        };

        // 자동 연장 체크
        const expiresAt: Date | null = data.expires_at?.toDate() ?? null;
        if (expiresAt && expiresAt < new Date()) {
          // 코인 10개 차감 후 4주 연장
          try {
            let renewed = false;
            await firestore().runTransaction(async tx => {
              const userRef = firestore().collection('users').doc(currentUid);
              const userDoc = await tx.get(userRef);
              const balance: number = userDoc.data()?.coin_balance ?? 0;
              if (balance < 10) {return;}
              tx.update(userRef, {coin_balance: balance - 10});
              const newExpiry = new Date();
              newExpiry.setDate(newExpiry.getDate() + 28);
              tx.update(firestore().collection('exclusivity').doc(doc.id), {
                expires_at: newExpiry,
              });
              renewed = true;
            });
            if (renewed) {
              Alert.alert('💍 독점 자동 연장', '독점이 4주 연장됐어요 🪙 -10코인');
            } else {
              // 코인 부족 → 독점 종료
              await firestore().collection('exclusivity').doc(doc.id).update({
                status: 'ended',
                cancelled_by: null,
              });
              Alert.alert('독점 해제', '코인이 부족해 독점이 자동 해제됐어요.');
            }
          } catch {}
          return;
        }

        setExclusivity(exDoc);
      }, () => {});

    // 내 쿨다운 로드
    firestore()
      .collection('users')
      .doc(currentUid)
      .get()
      .then(doc => {
        const until: Date | null = doc.data()?.exclusivity_cooldown_until?.toDate() ?? null;
        setExCooldownUntil(until && until > new Date() ? until : null);
      })
      .catch(() => {});

    return unsub;
  }, [currentUid, otherUserUid]);

  // 독점 선언
  const handleDeclareExclusivity = async () => {
    if (!currentUid) {return;}

    if (exCooldownUntil) {
      const days = Math.ceil((exCooldownUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      Alert.alert('독점 불가', `${days}일 후 독점 선언이 가능해요.`);
      return;
    }

    Alert.alert(
      '💍 독점 선언',
      `${otherUserNickname}님과 독점 관계를 시작할까요?\n\n🪙 10코인 소모 · 4주 지속\n자동 연장 시 동일 비용\n내가 해제하면 2주, 상대가 해제하면 1주 독점 불가`,
      [
        {text: '취소', style: 'cancel'},
        {
          text: '선언하기',
          onPress: async () => {
            setExLoading(true);
            try {
              let success = false;
              await firestore().runTransaction(async tx => {
                const userRef = firestore().collection('users').doc(currentUid);
                const userDoc = await tx.get(userRef);
                const balance: number = userDoc.data()?.coin_balance ?? 0;
                if (balance < 10) {return;}
                tx.update(userRef, {coin_balance: balance - 10});
                success = true;
              });
              if (!success) {
                Alert.alert('코인 부족', '독점 선언에는 코인 10개가 필요해요.');
                return;
              }
              const expiry = new Date();
              expiry.setDate(expiry.getDate() + 28);
              await firestore().collection('exclusivity').add({
                user_ids: [currentUid, otherUserUid],
                status: 'active',
                started_at: firestore.FieldValue.serverTimestamp(),
                expires_at: expiry,
                cancelled_by: null,
              });
              Alert.alert('💍 독점 시작!', `${otherUserNickname}님과의 독점이 시작됐어요.`);
            } catch {
              Alert.alert('오류', '독점 선언 중 문제가 발생했어요.');
            } finally {
              setExLoading(false);
            }
          },
        },
      ],
    );
  };

  // 독점 해제
  const handleCancelExclusivity = () => {
    if (!currentUid || !exclusivity) {return;}
    Alert.alert(
      '독점 해제',
      '독점을 해제할까요?\n해제 후 2주간 독점 선언이 불가해요.',
      [
        {text: '취소', style: 'cancel'},
        {
          text: '해제',
          style: 'destructive',
          onPress: async () => {
            setExLoading(true);
            try {
              const now = new Date();
              const myCooldown = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
              const otherCooldown = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
              const batch = firestore().batch();
              batch.update(firestore().collection('exclusivity').doc(exclusivity.id), {
                status: 'ended',
                cancelled_by: currentUid,
              });
              batch.update(firestore().collection('users').doc(currentUid), {
                exclusivity_cooldown_until: myCooldown,
              });
              batch.update(firestore().collection('users').doc(otherUserUid), {
                exclusivity_cooldown_until: otherCooldown,
              });
              await batch.commit();
              setExCooldownUntil(myCooldown);
              setExclusivity(null);
            } catch {
              Alert.alert('오류', '독점 해제 중 문제가 발생했어요.');
            } finally {
              setExLoading(false);
            }
          },
        },
      ],
    );
  };

  // 메시지 실시간 구독
  useEffect(() => {
    const unsub = firestore()
      .collection('matches')
      .doc(matchId)
      .collection('messages')
      .orderBy('created_at', 'desc') // inverted FlatList: 최신 → 위
      .onSnapshot(snap => {
        const msgs: Message[] = snap.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as Omit<Message, 'id'>),
        }));
        setMessages(msgs);

        // 상대방 메시지 읽음 처리
        if (!currentUid) {return;}
        const toMark = msgs.filter(
          m =>
            m.sender_uid !== currentUid &&
            !m.read_at &&
            !markedReadRef.current.has(m.id),
        );
        if (toMark.length === 0) {return;}

        const batch = firestore().batch();
        toMark.forEach(m => {
          markedReadRef.current.add(m.id);
          batch.update(
            firestore()
              .collection('matches')
              .doc(matchId)
              .collection('messages')
              .doc(m.id),
            {read_at: firestore.FieldValue.serverTimestamp()},
          );
        });
        batch.commit().catch(() => {});
      });

    return unsub;
  }, [matchId, currentUid]);

  // 메시지 & last_message 저장 공통 로직
  const persistMessage = useCallback(
    async (
      type: 'text' | 'image',
      content: string,
      imageUrl?: string,
    ) => {
      if (!currentUid) {return;}

      const msgData: Record<string, unknown> = {
        sender_uid: currentUid,
        type,
        content,
        read_at: null,
        created_at: firestore.FieldValue.serverTimestamp(),
      };
      if (imageUrl) {msgData.image_url = imageUrl;}

      await firestore()
        .collection('matches')
        .doc(matchId)
        .collection('messages')
        .add(msgData);

      // 채팅 목록용 last_message 업데이트
      await firestore()
        .collection('matches')
        .doc(matchId)
        .update({
          last_message: {
            content: type === 'image' ? '📷 사진' : content,
            sender_uid: currentUid,
            type,
            created_at: firestore.FieldValue.serverTimestamp(),
          },
        });
    },
    [matchId, currentUid],
  );

  // 텍스트 전송
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) {return;}
    setText('');
    setSending(true);
    try {
      await persistMessage('text', trimmed);
    } catch {
      Alert.alert('오류', '메시지 전송에 실패했습니다.');
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  // 이미지 전송
  const handleImageSend = async () => {
    const result = await launchImageLibrary({mediaType: 'photo', quality: 0.8});
    if (result.didCancel || !result.assets?.[0]?.uri) {return;}

    const uri = result.assets[0].uri!;
    setImageUploading(true);
    try {
      const filename = `chat_images/${matchId}/${Date.now()}.jpg`;
      await storage().ref(filename).putFile(uri);
      const url = await storage().ref(filename).getDownloadURL();
      await persistMessage('image', '', url);
    } catch {
      Alert.alert('오류', '이미지 전송에 실패했습니다.');
    } finally {
      setImageUploading(false);
    }
  };

  // 메시지 삭제 (본인 메시지만)
  const handleDeleteMessage = (msg: Message) => {
    if (msg.sender_uid !== currentUid) {return;}
    Alert.alert('메시지 삭제', '이 메시지를 삭제할까요?', [
      {text: '취소', style: 'cancel'},
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          firestore()
            .collection('matches')
            .doc(matchId)
            .collection('messages')
            .doc(msg.id)
            .delete()
            .catch(() => {});
        },
      },
    ]);
  };

  const renderMessage = ({item}: {item: Message}) => {
    const isMine = item.sender_uid === currentUid;
    return (
      <ChatBubble
        content={item.content}
        type={item.type}
        imageUrl={item.image_url}
        isMine={isMine}
        readAt={item.read_at?.toMillis() ?? null}
        createdAt={item.created_at?.toMillis() ?? null}
        onLongPress={isMine ? () => handleDeleteMessage(item) : undefined}
        senderPhoto={isMine ? null : (otherProfile?.photos?.[0] ?? null)}
        senderName={isMine ? null : (otherProfile?.nickname ?? otherUserNickname)}
        onAvatarPress={isMine ? undefined : () => { setPhotoIndex(0); setProfileModalVisible(true); }}
      />
    );
  };

  const otherAge = otherProfile?.birth_year
    ? new Date().getFullYear() - otherProfile.birth_year + 1
    : null;

  return (
    <>
    {/* 프로필 모달 */}
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
          {otherProfile?.photos?.length ? (
            <View style={styles.modalPhotoWrap}>
              <Image
                source={{uri: otherProfile.photos[photoIndex]}}
                style={{width: SCREEN_WIDTH, height: 280}}
                resizeMode="cover"
              />
              {/* 좌우 버튼 */}
              {photoIndex > 0 && (
                <TouchableOpacity
                  style={[styles.photoNavBtn, styles.photoNavLeft]}
                  onPress={() => setPhotoIndex(i => i - 1)}>
                  <Text style={styles.photoNavText}>‹</Text>
                </TouchableOpacity>
              )}
              {photoIndex < otherProfile.photos.length - 1 && (
                <TouchableOpacity
                  style={[styles.photoNavBtn, styles.photoNavRight]}
                  onPress={() => setPhotoIndex(i => i + 1)}>
                  <Text style={styles.photoNavText}>›</Text>
                </TouchableOpacity>
              )}
              {/* 점 인디케이터 */}
              {otherProfile.photos.length > 1 && (
                <View style={styles.dotRow}>
                  {otherProfile.photos.map((_, i) => (
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
              {otherProfile?.nickname}{otherAge ? `  ${otherAge}세` : ''}
            </Text>
            {(otherProfile?.job || otherProfile?.job_field) ? (
              <Text style={styles.modalMeta}>
                💼 {[otherProfile.job, otherProfile.job_field].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            {otherProfile?.activity_area ? (
              <Text style={styles.modalMeta}>📍 {otherProfile.activity_area}</Text>
            ) : null}
            {otherProfile?.bio ? (
              <Text style={styles.modalBio}>{otherProfile.bio}</Text>
            ) : null}
            {otherProfile?.hobby_tags?.length ? (
              <>
                <Text style={styles.modalSectionLabel}>취미</Text>
                <View style={styles.modalTags}>
                  {otherProfile.hobby_tags.map(tag => (
                    <View key={tag} style={styles.modalTag}>
                      <Text style={styles.modalTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            {otherProfile?.ideal_type_tags?.length ? (
              <>
                <Text style={styles.modalSectionLabel}>이상형</Text>
                <View style={styles.modalTags}>
                  {otherProfile.ideal_type_tags.map(tag => (
                    <View key={tag} style={[styles.modalTag, styles.modalTagIdeal]}>
                      <Text style={[styles.modalTagText, styles.modalTagIdealText]}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            <View style={styles.modalBottomPad} />
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>

    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        inverted
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* + 메뉴 패널 */}
      <Animated.View
        style={[
          styles.menuPanel,
          {
            opacity: menuAnim,
            transform: [{translateY: menuAnim.interpolate({inputRange: [0, 1], outputRange: [12, 0]})}],
          },
        ]}
        pointerEvents={menuOpen ? 'auto' : 'none'}>
        {/* 사진 */}
        <TouchableOpacity
          style={styles.menuItem}
          disabled={matchStatus === 'cancelled'}
          onPress={() => { toggleMenu(); handleImageSend(); }}>
          {imageUploading
            ? <ActivityIndicator size="small" color="#4CAF50" />
            : <Text style={styles.menuItemIcon}>📷</Text>}
          <Text style={styles.menuItemLabel}>사진</Text>
        </TouchableOpacity>
        {/* 독점 선언 / 해제 */}
        <TouchableOpacity
          style={styles.menuItem}
          disabled={exLoading || matchStatus === 'cancelled'}
          onPress={() => {
            toggleMenu();
            exclusivity ? handleCancelExclusivity() : handleDeclareExclusivity();
          }}>
          {exLoading
            ? <ActivityIndicator size="small" color="#9c27b0" />
            : <Text style={styles.menuItemIcon}>💍</Text>}
          <Text style={[styles.menuItemLabel, {color: '#9c27b0'}]}>
            {exclusivity
              ? '독점 해제'
              : exCooldownUntil
              ? `쿨다운 ${Math.ceil((exCooldownUntil.getTime() - Date.now()) / 86400000)}일`
              : '독점 선언'}
          </Text>
        </TouchableOpacity>
        {/* 매칭 취소 */}
        {matchStatus === 'active' && (
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => { toggleMenu(); handleCancelMatch(); }}>
            <Text style={styles.menuItemIcon}>💔</Text>
            <Text style={[styles.menuItemLabel, {color: '#ff5252'}]}>매칭 취소</Text>
          </TouchableOpacity>
        )}
        {/* 신고 */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => { toggleMenu(); Alert.alert('신고', '신고 기능은 준비 중이에요.'); }}>
          <Text style={styles.menuItemIcon}>🚨</Text>
          <Text style={[styles.menuItemLabel, {color: '#ff5252'}]}>신고</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* 매칭 취소 배너 */}
      {matchStatus === 'cancelled' && (
        <View style={styles.cancelledBanner}>
          <Text style={styles.cancelledBannerText}>
            💔 매칭이 취소됐어요 · 탐색에서 다시 만날 수 있어요
          </Text>
        </View>
      )}

      {/* 입력 바 */}
      <View style={styles.inputBar}>
        <TouchableOpacity
          style={styles.plusBtn}
          onPress={toggleMenu}
          disabled={matchStatus === 'cancelled'}>
          <Text style={[styles.plusBtnText, menuOpen && styles.plusBtnTextOpen]}>＋</Text>
        </TouchableOpacity>

        <TextInput
          style={[styles.input, matchStatus === 'cancelled' && styles.inputDisabled]}
          value={text}
          onChangeText={setText}
          placeholder={matchStatus === 'cancelled' ? '매칭이 취소됐어요' : '메시지를 입력하세요'}
          placeholderTextColor="#aaa"
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          editable={matchStatus !== 'cancelled'}
        />

        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}>
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendBtnText}>전송</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#151a28'},
  // 모달
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    height: '75%',
  },
  modalInfo: {padding: 20},
  modalName: {fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 6},
  modalMeta: {fontSize: 13, color: '#666', marginBottom: 4},
  modalBio: {fontSize: 14, color: '#444', marginTop: 10, lineHeight: 21},
  modalTags: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12},
  modalTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#f1f8f1',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  modalTagText: {fontSize: 12, color: '#4CAF50'},
  modalSectionLabel: {fontSize: 13, fontWeight: '600', color: '#888', marginTop: 14, marginBottom: 6},
  modalTagIdeal: {backgroundColor: '#fff3f0', borderColor: '#ffccbc'},
  modalTagIdealText: {fontSize: 12, color: '#FF7043'},
  modalPhotoWrap: {height: 280, position: 'relative'},
  modalPhotoPlaceholder: {height: 280, backgroundColor: '#e8f5e9', justifyContent: 'center', alignItems: 'center'},
  photoNavBtn: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  photoNavLeft: {left: 0},
  photoNavRight: {right: 0},
  photoNavText: {fontSize: 36, color: '#fff', fontWeight: '300', lineHeight: 42},
  dotRow: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)'},
  dotActive: {backgroundColor: '#fff', width: 8, height: 8, borderRadius: 4},
  modalBottomPad: {height: 32},
  listContent: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1e2538',
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    fontSize: 15,
    color: '#fff',
    marginRight: 8,
    backgroundColor: '#151a28',
  },
  sendBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 18,
    paddingHorizontal: 16,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: {backgroundColor: '#c8e6c9'},
  sendBtnText: {color: '#fff', fontWeight: '600', fontSize: 14},

  // + 메뉴
  menuPanel: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1e2538',
  },
  menuItem: {alignItems: 'center', gap: 4},
  menuItemIcon: {fontSize: 28},
  menuItemLabel: {fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600'},
  plusBtn: {
    width: 36, height: 36,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 8, marginBottom: 2,
  },
  plusBtnText: {fontSize: 26, color: 'rgba(255,255,255,0.3)', lineHeight: 30},
  plusBtnTextOpen: {color: '#4CAF50'},

  cancelledBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffeaea',
    borderTopWidth: 1,
    borderTopColor: '#ffcdd2',
    alignItems: 'center',
  },
  cancelledBannerText: {fontSize: 13, color: '#c62828', fontWeight: '500'},
  inputDisabled: {backgroundColor: '#f5f5f5', color: '#aaa'},
});
