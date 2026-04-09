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
import {useTheme} from '../../context/ThemeContext';

interface CoinPackage {
  coins: number;
  price: number;      // 원
  discount?: number;  // % (없으면 표시 안 함)
  best?: boolean;
}

const PACKAGES: CoinPackage[] = [
  {coins: 3,   price: 3_000},
  {coins: 10,  price: 7_900,  discount: 21},
  {coins: 30,  price: 19_900, discount: 34, best: true},
  {coins: 50,  price: 29_900, discount: 40},
  {coins: 100, price: 49_900, discount: 50},
];

function pricePerCoin(pkg: CoinPackage) {
  return Math.round(pkg.price / pkg.coins);
}

function formatWon(n: number) {
  return n.toLocaleString('ko-KR') + '원';
}

export default function CoinShopScreen() {
  const {colors} = useTheme();
  const uid = auth().currentUser?.uid;
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState<number | null>(null); // 충전 중인 패키지 coins

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

  const handleCharge = async (pkg: CoinPackage) => {
    if (!uid || loading !== null) {return;}
    Alert.alert(
      '코인 충전',
      `${pkg.coins}코인을 충전할까요?\n(테스트 모드: 실제 결제 없이 즉시 충전)`,
      [
        {text: '취소', style: 'cancel'},
        {
          text: '충전하기',
          onPress: async () => {
            setLoading(pkg.coins);
            try {
              await firestore().runTransaction(async tx => {
                const ref = firestore().collection('users').doc(uid);
                const doc = await tx.get(ref);
                const current: number = doc.data()?.coin_balance ?? 0;
                tx.update(ref, {coin_balance: current + pkg.coins});
              });
              Alert.alert('충전 완료', `🪙 ${pkg.coins}코인이 충전됐어요!`);
            } catch {
              Alert.alert('오류', '충전 중 문제가 발생했어요. 다시 시도해주세요.');
            } finally {
              setLoading(null);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={[styles.container, {backgroundColor: colors.bg}]} contentContainerStyle={styles.inner}>

      {/* 현재 잔액 */}
      <View style={styles.balanceBox}>
        <Text style={styles.balanceLabel}>보유 코인</Text>
        <Text style={styles.balanceValue}>
          🪙 {balance !== null ? balance : '—'}
        </Text>
        <Text style={styles.balanceHint}>슈퍼라이크 1회 = 1코인</Text>
      </View>

      {/* 테스트 모드 배너 */}
      <View style={styles.testBanner}>
        <Text style={styles.testBannerText}>
          🧪 테스트 모드 · 실제 결제가 발생하지 않아요
        </Text>
      </View>

      {/* 패키지 목록 */}
      <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>충전 패키지</Text>
      {PACKAGES.map(pkg => (
        <TouchableOpacity
          key={pkg.coins}
          style={[styles.card, {backgroundColor: colors.card, borderColor: colors.border}, pkg.best && {borderColor: '#4CAF50'}]}
          activeOpacity={0.75}
          disabled={loading !== null}
          onPress={() => handleCharge(pkg)}>

          {pkg.best && (
            <View style={styles.bestBadge}>
              <Text style={styles.bestBadgeText}>인기</Text>
            </View>
          )}

          <View style={styles.cardLeft}>
            <Text style={[styles.cardCoins, {color: colors.textPrimary}]}>🪙 {pkg.coins}코인</Text>
            <Text style={[styles.cardPer, {color: colors.textMuted}]}>
              개당 {formatWon(pricePerCoin(pkg))}
            </Text>
          </View>

          <View style={styles.cardRight}>
            {pkg.discount && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>{pkg.discount}% 할인</Text>
              </View>
            )}
            <Text style={[styles.cardPrice, {color: colors.textPrimary}, pkg.best && styles.cardPriceBest]}>
              {formatWon(pkg.price)}
            </Text>
            {loading === pkg.coins ? (
              <ActivityIndicator size="small" color="#4CAF50" style={{marginTop: 4}} />
            ) : (
              <Text style={styles.chargeLabel}>충전하기 ›</Text>
            )}
          </View>
        </TouchableOpacity>
      ))}

      {/* 안내 */}
      <View style={[styles.noticeBox, {backgroundColor: colors.card}]}>
        <Text style={[styles.noticeTitle, {color: colors.textSecondary}]}>코인 안내</Text>
        {[
          '슈퍼라이크 1회에 코인 1개가 사용돼요.',
          '충전한 코인은 환불되지 않아요.',
          '코인 유효기간은 충전일로부터 1년이에요.',
          '실제 결제 기능은 추후 업데이트 예정이에요.',
        ].map((line, i) => (
          <Text key={i} style={[styles.noticeLine, {color: colors.textMuted}]}>· {line}</Text>
        ))}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f5'},
  inner: {padding: 16, paddingBottom: 48},

  // 잔액
  balanceBox: {
    backgroundColor: '#4CAF50',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceLabel: {fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 4},
  balanceValue: {fontSize: 36, fontWeight: '700', color: '#fff'},
  balanceHint: {fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6},

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

  // 섹션 타이틀
  sectionTitle: {fontSize: 14, fontWeight: '600', color: '#888', marginBottom: 10},

  // 패키지 카드
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    position: 'relative',
  },
  cardBest: {
    borderColor: '#4CAF50',
    backgroundColor: '#f1f8f1',
  },
  bestBadge: {
    position: 'absolute',
    top: -1,
    left: 16,
    backgroundColor: '#4CAF50',
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bestBadgeText: {fontSize: 11, color: '#fff', fontWeight: '700'},

  cardLeft: {},
  cardCoins: {fontSize: 18, fontWeight: '700', color: '#222'},
  cardPer: {fontSize: 12, color: '#999', marginTop: 2},

  cardRight: {alignItems: 'flex-end'},
  discountBadge: {
    backgroundColor: '#FF7043',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 4,
  },
  discountText: {fontSize: 11, color: '#fff', fontWeight: '700'},
  cardPrice: {fontSize: 17, fontWeight: '700', color: '#222'},
  cardPriceBest: {color: '#4CAF50'},
  chargeLabel: {fontSize: 12, color: '#4CAF50', marginTop: 3},

  // 안내
  noticeBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  noticeTitle: {fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8},
  noticeLine: {fontSize: 12, color: '#999', lineHeight: 20},
});
