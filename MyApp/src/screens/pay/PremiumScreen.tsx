import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {useSubscription} from '../../hooks/useSubscription';

interface TierConfig {
  id: 'sprout_plus' | 'sprout_plus_plus';
  name: string;
  price: number;
  weeklyCoins: number;
  color: string;
  lightColor: string;
  benefits: string[];
}

const TIERS: TierConfig[] = [
  {
    id: 'sprout_plus',
    name: '새싹+',
    price: 5_900,
    weeklyCoins: 5,
    color: '#4CAF50',
    lightColor: '#e8f5e9',
    benefits: [
      '취미·이상형 태그 기반 우선 노출',
      '매주 5코인 자동 지급',
      '프로필 조회수 확인 (예정)',
    ],
  },
  {
    id: 'sprout_plus_plus',
    name: '새싹++',
    price: 15_900,
    weeklyCoins: 15,
    color: '#FF7043',
    lightColor: '#fff3f0',
    benefits: [
      '새싹+ 혜택 전체 포함',
      '매주 15코인 자동 지급',
      '플러팅 주 3회 (일방 매칭 시도)',
      '슈퍼라이크 이용자 우선 노출',
    ],
  },
];

const WEEKLY_COINS: Record<string, number> = {
  sprout_plus: 5,
  sprout_plus_plus: 15,
};

function formatDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatWon(n: number) {
  return n.toLocaleString('ko-KR') + '원';
}

export default function PremiumScreen() {
  const uid = auth().currentUser?.uid;
  const {tier, expiresAt, loading} = useSubscription();
  const [balance, setBalance] = useState(0);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // 코인 잔액 실시간
  useEffect(() => {
    if (!uid) {return;}
    const unsub = firestore()
      .collection('users')
      .doc(uid)
      .onSnapshot(snap => {
        setBalance(snap.data()?.coin_balance ?? 0);
      }, () => {});
    return unsub;
  }, [uid]);

  // 주간 코인 지급 체크
  useEffect(() => {
    if (!uid || tier === 'free') {return;}
    const grantIfDue = async () => {
      try {
        const subSnap = await firestore().collection('subscriptions').doc(uid).get();
        const subData = subSnap.data();
        if (!subData) {return;}
        const lastGrant: Date | null = subData.weekly_coin_granted_at?.toDate() ?? null;
        const now = new Date();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (lastGrant && now.getTime() - lastGrant.getTime() < sevenDays) {return;}

        const coins = WEEKLY_COINS[tier] ?? 0;
        if (coins <= 0) {return;}

        await firestore().runTransaction(async tx => {
          const userRef = firestore().collection('users').doc(uid);
          const userDoc = await tx.get(userRef);
          const current: number = userDoc.data()?.coin_balance ?? 0;
          tx.update(userRef, {coin_balance: current + coins});
          tx.update(firestore().collection('subscriptions').doc(uid), {
            weekly_coin_granted_at: firestore.FieldValue.serverTimestamp(),
          });
        });
        Alert.alert('🪙 코인 지급', `이번 주 ${coins}코인이 지급됐어요!`);
      } catch {}
    };
    grantIfDue();
  }, [uid, tier]);

  const handleSubscribe = async (targetTier: TierConfig) => {
    if (!uid) {return;}
    const isSameTier = tier === targetTier.id;
    if (isSameTier) {return;}

    const isUpgrade =
      tier === 'sprout_plus' && targetTier.id === 'sprout_plus_plus';
    const label = isUpgrade ? '업그레이드' : '구독';

    Alert.alert(
      `${targetTier.name} ${label}`,
      `${targetTier.name}을 ${formatWon(targetTier.price)}/월에 ${label}할까요?\n(테스트 모드: 실제 결제 없이 즉시 활성화)`,
      [
        {text: '취소', style: 'cancel'},
        {
          text: label + '하기',
          onPress: async () => {
            setSubscribing(true);
            try {
              const now = new Date();
              const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
              await firestore()
                .collection('subscriptions')
                .doc(uid)
                .set({
                  tier: targetTier.id,
                  started_at: firestore.FieldValue.serverTimestamp(),
                  expires_at: expires,
                  weekly_coin_granted_at: null,
                });
              Alert.alert('활성화 완료', `${targetTier.name} 혜택을 즉시 누리세요! 🌱`);
            } catch {
              Alert.alert('오류', '구독 처리 중 문제가 발생했어요.');
            } finally {
              setSubscribing(false);
            }
          },
        },
      ],
    );
  };

  const handleCancel = () => {
    if (!uid) {return;}
    Alert.alert('구독 해지', '구독을 해지할까요?\n(테스트 모드: 즉시 해지)', [
      {text: '취소', style: 'cancel'},
      {
        text: '해지',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await firestore().collection('subscriptions').doc(uid).delete();
          } catch {
            Alert.alert('오류', '해지 처리 중 문제가 발생했어요.');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  const currentTierConfig = TIERS.find(t => t.id === tier);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>

      {/* 현재 상태 카드 */}
      <View style={[
        styles.statusCard,
        currentTierConfig ? {borderColor: currentTierConfig.color, backgroundColor: currentTierConfig.lightColor} : styles.statusCardFree,
      ]}>
        <View style={styles.statusTop}>
          <View>
            <Text style={styles.statusLabel}>현재 등급</Text>
            <Text style={[styles.statusTier, currentTierConfig ? {color: currentTierConfig.color} : styles.freeTierText]}>
              {currentTierConfig ? currentTierConfig.name : '무료'}
            </Text>
          </View>
          <View style={styles.coinBox}>
            <Text style={styles.coinLabel}>보유 코인</Text>
            <Text style={styles.coinValue}>🪙 {balance}</Text>
          </View>
        </View>
        {tier !== 'free' && expiresAt && (
          <Text style={[styles.expiryText, {color: currentTierConfig!.color}]}>
            만료일: {formatDate(expiresAt)}
          </Text>
        )}
        {tier !== 'free' && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            disabled={cancelling}>
            <Text style={styles.cancelBtnText}>
              {cancelling ? '처리 중...' : '구독 해지'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 테스트 모드 배너 */}
      <View style={styles.testBanner}>
        <Text style={styles.testBannerText}>
          🧪 테스트 모드 · 실제 결제가 발생하지 않아요
        </Text>
      </View>

      {/* 구독 플랜 */}
      <Text style={styles.sectionTitle}>구독 플랜</Text>

      {TIERS.map(t => {
        const isCurrent = tier === t.id;
        const isLower = tier === 'sprout_plus_plus' && t.id === 'sprout_plus';
        return (
          <View
            key={t.id}
            style={[
              styles.tierCard,
              isCurrent && {borderColor: t.color, borderWidth: 2},
            ]}>
            {isCurrent && (
              <View style={[styles.currentBadge, {backgroundColor: t.color}]}>
                <Text style={styles.currentBadgeText}>현재 구독 중</Text>
              </View>
            )}
            <View style={styles.tierHeader}>
              <Text style={[styles.tierName, {color: t.color}]}>{t.name}</Text>
              <View>
                <Text style={styles.tierPrice}>{formatWon(t.price)}/월</Text>
                <Text style={styles.tierCoins}>매주 🪙{t.weeklyCoins} 지급</Text>
              </View>
            </View>

            <View style={styles.benefitList}>
              {t.benefits.map((b, i) => (
                <View key={i} style={styles.benefitRow}>
                  <Text style={[styles.benefitDot, {color: t.color}]}>✓</Text>
                  <Text style={styles.benefitText}>{b}</Text>
                </View>
              ))}
            </View>

            {!isCurrent && !isLower && (
              <TouchableOpacity
                style={[styles.subscribeBtn, {backgroundColor: t.color}]}
                onPress={() => handleSubscribe(t)}
                disabled={subscribing}>
                {subscribing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.subscribeBtnText}>
                    {tier === 'sprout_plus' && t.id === 'sprout_plus_plus'
                      ? '업그레이드'
                      : '구독하기'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            {isLower && (
              <View style={styles.downgradeDim}>
                <Text style={styles.downgradeText}>현재 등급보다 낮은 플랜이에요</Text>
              </View>
            )}
          </View>
        );
      })}

      {/* 안내 */}
      <View style={styles.noticeBox}>
        <Text style={styles.noticeTitle}>구독 안내</Text>
        {[
          '매월 자동 결제되며 언제든 해지 가능해요.',
          '주간 코인은 구독 중일 때 앱 접속 시 지급돼요.',
          '해지 후에도 만료일까지 혜택이 유지돼요.',
          '실제 결제 기능은 추후 업데이트 예정이에요.',
        ].map((line, i) => (
          <Text key={i} style={styles.noticeLine}>· {line}</Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f5'},
  inner: {padding: 16, paddingBottom: 48},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},

  // 현재 상태 카드
  statusCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 12,
  },
  statusCardFree: {borderColor: '#e0e0e0', backgroundColor: '#fff'},
  statusTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  statusLabel: {fontSize: 12, color: '#999', marginBottom: 4},
  statusTier: {fontSize: 24, fontWeight: '800'},
  freeTierText: {color: '#aaa'},
  coinBox: {alignItems: 'flex-end'},
  coinLabel: {fontSize: 12, color: '#999', marginBottom: 4},
  coinValue: {fontSize: 18, fontWeight: '700', color: '#222'},
  expiryText: {fontSize: 12, marginTop: 8},
  cancelBtn: {marginTop: 12, alignSelf: 'flex-start'},
  cancelBtnText: {fontSize: 13, color: '#aaa', textDecorationLine: 'underline'},

  // 테스트 배너
  testBanner: {
    backgroundColor: '#FFF9C4',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F9A825',
  },
  testBannerText: {fontSize: 12, color: '#795548', textAlign: 'center'},

  sectionTitle: {fontSize: 14, fontWeight: '600', color: '#888', marginBottom: 10},

  // 구독 카드
  tierCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 20,
    marginBottom: 12,
    position: 'relative',
  },
  currentBadge: {
    position: 'absolute',
    top: -1,
    right: 16,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  currentBadgeText: {fontSize: 11, color: '#fff', fontWeight: '700'},
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tierName: {fontSize: 22, fontWeight: '800'},
  tierPrice: {fontSize: 16, fontWeight: '700', color: '#222', textAlign: 'right'},
  tierCoins: {fontSize: 12, color: '#888', textAlign: 'right', marginTop: 2},
  benefitList: {gap: 8, marginBottom: 16},
  benefitRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  benefitDot: {fontSize: 14, fontWeight: '700', lineHeight: 20},
  benefitText: {fontSize: 14, color: '#444', flex: 1, lineHeight: 20},
  subscribeBtn: {
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subscribeBtnText: {fontSize: 15, fontWeight: '700', color: '#fff'},
  downgradeDim: {
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downgradeText: {fontSize: 13, color: '#bbb'},

  // 안내
  noticeBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
  },
  noticeTitle: {fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8},
  noticeLine: {fontSize: 12, color: '#999', lineHeight: 20},
});
