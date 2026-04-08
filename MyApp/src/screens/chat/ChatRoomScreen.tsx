import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
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
  const flatListRef = useRef<FlatList>(null);
  const markedReadRef = useRef<Set<string>>(new Set());

  const {setActiveMatchId} = useChatStore();
  const currentUid = auth().currentUser?.uid;

  // 헤더 타이틀 설정
  useEffect(() => {
    navigation.setOptions({title: otherUserNickname});
  }, [navigation, otherUserNickname]);

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

      {/* 입력 바 */}
      <View style={styles.inputBar}>
        <TouchableOpacity
          style={styles.imageBtn}
          onPress={handleImageSend}
          disabled={imageUploading}>
          {imageUploading ? (
            <ActivityIndicator size="small" color="#4CAF50" />
          ) : (
            <Text style={styles.imageBtnText}>📷</Text>
          )}
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="메시지를 입력하세요"
          placeholderTextColor="#aaa"
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={handleSend}
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
  container: {flex: 1, backgroundColor: '#fff'},
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
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  imageBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 2,
  },
  imageBtnText: {fontSize: 22},
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    fontSize: 15,
    color: '#222',
    marginRight: 8,
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
});
