import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface Props {
  content: string;
  type: 'text' | 'image';
  imageUrl?: string | null;
  isMine: boolean;
  readAt?: number | null;
  createdAt?: number | null;
  onLongPress?: () => void;
  senderPhoto?: string | null;
  senderName?: string | null;
  onAvatarPress?: () => void;
}

const KST_OFFSET = 9 * 60 * 60 * 1000;

function formatTime(ts: number | null | undefined): string {
  if (!ts) {return '';}
  const d = new Date(ts + KST_OFFSET);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  const ampm = h < 12 ? '오전' : '오후';
  return `${ampm} ${h % 12 || 12}:${m}`;
}

export default function ChatBubble({
  content,
  type,
  imageUrl,
  isMine,
  readAt,
  createdAt,
  onLongPress,
  senderPhoto,
  senderName,
  onAvatarPress,
}: Props) {
  if (isMine) {
    return (
      <View style={styles.rowMine}>
        <View style={styles.metaMine}>
          {readAt ? <Text style={styles.readText}>읽음</Text> : null}
          <Text style={styles.time}>{formatTime(createdAt)}</Text>
        </View>
        <TouchableOpacity
          onLongPress={onLongPress}
          activeOpacity={onLongPress ? 0.7 : 1}
          style={[styles.bubble, styles.bubbleMine]}>
          {type === 'image' && imageUrl ? (
            <Image source={{uri: imageUrl}} style={styles.image} resizeMode="cover" />
          ) : (
            <Text style={[styles.text, styles.textMine]}>{content}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.rowOther}>
      {/* 아바타 */}
      <TouchableOpacity onPress={onAvatarPress} disabled={!onAvatarPress}>
        {senderPhoto ? (
          <Image source={{uri: senderPhoto}} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarPlaceholderText}>🌱</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* 이름 + 말풍선 */}
      <View style={styles.otherColumn}>
        {senderName ? <Text style={styles.senderName}>{senderName}</Text> : null}
        <View style={styles.otherBubbleRow}>
          <TouchableOpacity
            onLongPress={onLongPress}
            activeOpacity={onLongPress ? 0.7 : 1}
            style={[styles.bubble, styles.bubbleOther]}>
            {type === 'image' && imageUrl ? (
              <Image source={{uri: imageUrl}} style={styles.image} resizeMode="cover" />
            ) : (
              <Text style={[styles.text, styles.textOther]}>{content}</Text>
            )}
          </TouchableOpacity>
          <Text style={[styles.time, styles.timeOther]}>{formatTime(createdAt)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowMine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    marginHorizontal: 12,
    marginVertical: 3,
  },
  rowOther: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 12,
    marginVertical: 3,
  },
  avatar: {width: 36, height: 36, borderRadius: 18, marginRight: 8},
  avatarPlaceholder: {
    width: 36, height: 36, borderRadius: 18, marginRight: 8,
    backgroundColor: '#e8f5e9', justifyContent: 'center', alignItems: 'center',
  },
  avatarPlaceholderText: {fontSize: 18},
  otherColumn: {flexDirection: 'column', maxWidth: '72%'},
  senderName: {fontSize: 11, color: '#888', marginBottom: 3, marginLeft: 2},
  otherBubbleRow: {flexDirection: 'row', alignItems: 'flex-end'},
  bubble: {
    maxWidth: '72%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  bubbleMine: {
    backgroundColor: '#4CAF50',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#f0f0f0',
    borderBottomLeftRadius: 4,
  },
  text: {fontSize: 15, lineHeight: 21},
  textMine: {color: '#fff'},
  textOther: {color: '#222'},
  image: {width: 200, height: 200, borderRadius: 12},
  metaMine: {
    alignItems: 'flex-end',
    marginRight: 6,
    marginBottom: 2,
  },
  readText: {fontSize: 11, color: '#4CAF50', marginBottom: 1},
  time: {fontSize: 11, color: '#aaa'},
  timeOther: {marginLeft: 6, marginBottom: 2},
});
