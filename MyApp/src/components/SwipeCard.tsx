import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
} from 'react-native';
import {ProfileData} from '../store/matchStore';

const {width, height} = Dimensions.get('window');
export const CARD_WIDTH = width - 32;
export const CARD_HEIGHT = height * 0.72;

interface Props {
  profile: ProfileData;
}

export default function SwipeCard({profile}: Props) {
  const age = new Date().getFullYear() - profile.birth_year + 1;
  const firstPhoto = profile.photos?.[0];

  return (
    <View style={styles.card}>
      {firstPhoto ? (
        <Image source={{uri: firstPhoto}} style={styles.photo} />
      ) : (
        <View style={styles.noPhoto}>
          <Text style={styles.noPhotoText}>🌱</Text>
        </View>
      )}

      {/* 하단 그라디언트 영역 */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{profile.nickname}</Text>
          <Text style={styles.age}>{age}세</Text>
        </View>

        {(profile.job || profile.job_field) ? (
          <Text style={styles.area}>
            💼 {[profile.job, profile.job_field].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {profile.activity_area ? (
          <Text style={styles.area}>📍 {profile.activity_area}</Text>
        ) : null}

        {profile.bio ? (
          <Text style={styles.bio} numberOfLines={2}>
            {profile.bio}
          </Text>
        ) : null}

        {profile.hobby_tags?.length > 0 && (
          <View style={styles.tagRow}>
            {profile.hobby_tags.slice(0, 4).map(tag => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '91%',
    height: CARD_HEIGHT,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.15,
    shadowRadius: 8,
    marginHorizontal: 19,
    marginVertical: 19,
    
  },
  photo: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  noPhoto: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
  },
  noPhotoText: {
    fontSize: 80,
  },
  info: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingTop: 40,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  name: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
  },
  age: {
    fontSize: 20,
    color: '#fff',
    opacity: 0.9,
  },
  area: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.85,
    marginBottom: 6,
  },
  bio: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.85,
    marginBottom: 8,
    lineHeight: 20,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  tagText: {
    color: '#fff',
    fontSize: 12,
  },
});
