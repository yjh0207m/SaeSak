import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  Modal,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import KakaoUser from '@react-native-kakao/user';
import NaverLogin from '@react-native-seoul/naver-login';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {AuthStackParamList} from '../../navigation/AuthStack';

const {width: SW} = Dimensions.get('window');

// SDK 초기화는 LoginScreen에서만 수행

const CARD_WIDTH = SW - 64; // 좌우 여백으로 옆 카드 peek
const CARD_GAP = 12;

const MODEL_PHOTOS = [
  require('../../../src/models/f_model_1.jpg'),
  require('../../../src/models/f_model_2.jpg'),
  require('../../../src/models/f_model_3.jpg'),
  require('../../../src/models/f_model_4.jpg'),
  require('../../../src/models/m_model_5.jpg'),
  require('../../../src/models/m_model_6.jpg'),
  require('../../../src/models/m_model_7.jpg'),
];

const FEATURES = [
  {
    emoji: '💚',
    title: '스마트 매칭',
    desc: '프로필 완성도\n기반 정밀 매칭',
  },
  {
    emoji: '💌',
    title: '플러팅',
    desc: '먼저 마음을\n전하는 설레임',
  },
  {
    emoji: '💍',
    title: '독점 선언',
    desc: '우리만의\n특별한 공간',
  },
];

async function ensureUserDoc(
  uid: string,
  provider: string,
  extra: Record<string, unknown> = {},
) {
  try {
    const userDoc = await firestore().collection('users').doc(uid).get();
    if (!userDoc.exists()) {
      await firestore()
        .collection('users')
        .doc(uid)
        .set({
          uid,
          provider,
          coin_balance: 100,
          is_premium: false,
          is_blocked: false,
          created_at: firestore.FieldValue.serverTimestamp(),
          ...extra,
        });
    }
  } catch {}
}

type Nav = StackNavigationProp<AuthStackParamList, 'Landing'>;

export default function LandingScreen() {
  const navigation = useNavigation<Nav>();

  const scrollRef = useRef<ScrollView>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  const [loginModalVisible, setLoginModalVisible] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [naverLoading, setNaverLoading] = useState(false);

  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp'>('input');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [confirmation, setConfirmation] =
    useState<FirebaseAuthTypes.ConfirmationResult | null>(null);

  // 2초마다 자동 슬라이드
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide(prev => {
        const next = (prev + 1) % MODEL_PHOTOS.length;
        scrollRef.current?.scrollTo({
          x: next * (CARD_WIDTH + CARD_GAP),
          animated: true,
        });
        return next;
      });
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // ── Google ────────────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true);
      await GoogleSignin.hasPlayServices();
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;
      if (!idToken) {throw new Error('ID 토큰을 가져오지 못했습니다.');}
      const credential = auth.GoogleAuthProvider.credential(idToken);
      const uc = await auth().signInWithCredential(credential);
      await ensureUserDoc(uc.user.uid, 'google', {email: uc.user.email ?? ''});
      setLoginModalVisible(false);
    } catch (error: any) {
      if (error.code !== 'SIGN_IN_CANCELLED') {
        Alert.alert('구글 로그인 실패', error.message ?? '오류가 발생했습니다.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // ── 카카오 ───────────────────────────────────────────────────
  const handleKakaoLogin = async () => {
    try {
      setKakaoLoading(true);
      await KakaoUser.login();
      const kakaoProfile = await KakaoUser.me();
      const kakaoEmail = `kakao_${kakaoProfile.id}@kakao.saesak.app`;
      const kakaoPassword = `kakao_${kakaoProfile.id}_saesak`;
      let uc;
      try {
        uc = await auth().createUserWithEmailAndPassword(kakaoEmail, kakaoPassword);
      } catch (e: any) {
        if (e.code === 'auth/email-already-in-use') {
          uc = await auth().signInWithEmailAndPassword(kakaoEmail, kakaoPassword);
        } else {
          throw e;
        }
      }
      await ensureUserDoc(uc.user.uid, 'kakao', {
        email: kakaoProfile.email ?? kakaoEmail,
        kakao_id: String(kakaoProfile.id),
      });
      setLoginModalVisible(false);
    } catch (error: any) {
      if (error.code !== 'SIGN_IN_CANCELLED' && error.code !== 'E_CANCELLED') {
        Alert.alert('카카오 로그인 실패', error.message ?? '오류가 발생했습니다.');
      }
    } finally {
      setKakaoLoading(false);
    }
  };

  // ── 네이버 ───────────────────────────────────────────────────
  const handleNaverLogin = async () => {
    try {
      setNaverLoading(true);
      const {isSuccess, successResponse, failureResponse} = await NaverLogin.login();
      if (!isSuccess || !successResponse) {
        if (failureResponse?.message) {
          Alert.alert('네이버 로그인 실패', failureResponse.message);
        }
        return;
      }
      const result = await functions().httpsCallable('naverLogin')({
        accessToken: successResponse.accessToken,
      });
      const {customToken} = result.data as {customToken: string};
      await auth().signInWithCustomToken(customToken);
      setLoginModalVisible(false);
    } catch (error: any) {
      Alert.alert('네이버 로그인 실패', error.message ?? '오류가 발생했습니다.');
    } finally {
      setNaverLoading(false);
    }
  };

  const handleFacebookLogin = () => {
    Alert.alert('준비 중', 'Facebook 로그인은 곧 지원 예정이에요.');
  };

  // ── 휴대폰 OTP ───────────────────────────────────────────────
  const handleSendOtp = async () => {
    const digits = phoneNumber.replace(/[^0-9]/g, '');
    if (digits.length < 10) {
      Alert.alert('알림', '올바른 휴대폰 번호를 입력해주세요.');
      return;
    }
    const international = digits.startsWith('0')
      ? '+82' + digits.slice(1)
      : '+82' + digits;
    try {
      setPhoneLoading(true);
      const confirm = await auth().signInWithPhoneNumber(international);
      setConfirmation(confirm);
      setPhoneStep('otp');
    } catch (error: any) {
      Alert.alert('인증번호 발송 실패', error.message ?? '오류가 발생했습니다.');
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!confirmation) {return;}
    if (otp.length < 6) {
      Alert.alert('알림', '인증번호 6자리를 입력해주세요.');
      return;
    }
    try {
      setPhoneLoading(true);
      const uc = await confirmation.confirm(otp);
      if (uc) {
        await ensureUserDoc(uc.user.uid, 'phone', {phone: uc.user.phoneNumber ?? ''});
      }
      setPhoneModalVisible(false);
      setLoginModalVisible(false);
    } catch {
      Alert.alert('인증 실패', '인증번호가 올바르지 않아요. 다시 확인해주세요.');
    } finally {
      setPhoneLoading(false);
    }
  };

  const closePhoneModal = () => {
    setPhoneModalVisible(false);
    setPhoneStep('input');
    setPhoneNumber('');
    setOtp('');
    setConfirmation(null);
  };

  const openPhoneModal = () => {
    setLoginModalVisible(false);
    setTimeout(() => setPhoneModalVisible(true), 300);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#151a28" />

      {/* ── 휴대폰 인증 모달 ── */}
      <Modal
        visible={phoneModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closePhoneModal}>
        <KeyboardAvoidingView
          style={{flex: 1}}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closePhoneModal}>
            <TouchableOpacity activeOpacity={1} style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>📱 휴대폰 번호 로그인</Text>
              {phoneStep === 'input' ? (
                <>
                  <Text style={styles.sheetDesc}>
                    휴대폰 번호를 입력하면 인증번호를 문자로 보내드려요.
                  </Text>
                  <View style={styles.phoneRow}>
                    <View style={styles.prefix}>
                      <Text style={styles.prefixText}>🇰🇷 +82</Text>
                    </View>
                    <TextInput
                      style={styles.phoneInput}
                      placeholder="010-0000-0000"
                      placeholderTextColor="#bbb"
                      keyboardType="phone-pad"
                      value={phoneNumber}
                      onChangeText={setPhoneNumber}
                      maxLength={13}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.sheetBtn, phoneLoading && styles.dimmed]}
                    onPress={handleSendOtp}
                    disabled={phoneLoading}>
                    {phoneLoading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.sheetBtnText}>인증번호 받기</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.sheetDesc}>
                    {`+82${phoneNumber.replace(/[^0-9]/g, '').slice(1)}`}으로 발송된{'\n'}
                    6자리 인증번호를 입력해주세요.
                  </Text>
                  <TextInput
                    style={[styles.phoneInput, styles.otpInput]}
                    placeholder="인증번호 6자리"
                    placeholderTextColor="#bbb"
                    keyboardType="number-pad"
                    value={otp}
                    onChangeText={setOtp}
                    maxLength={6}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={[styles.sheetBtn, phoneLoading && styles.dimmed]}
                    onPress={handleVerifyOtp}
                    disabled={phoneLoading}>
                    {phoneLoading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.sheetBtnText}>확인</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.backBtn} onPress={() => setPhoneStep('input')}>
                    <Text style={styles.backBtnText}>← 번호 다시 입력</Text>
                  </TouchableOpacity>
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 로그인 선택 모달 ── */}
      <Modal
        visible={loginModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setLoginModalVisible(false)}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setLoginModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.loginSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.loginSheetTitle}>로그인 방법을 선택하세요</Text>
            <Text style={styles.loginSheetSub}>소셜 계정 인증으로 신뢰할 수 있는 만남을 보장해요</Text>

            <LoginBtn emoji="🔍" label="Google로 계속하기" style={styles.googleBtn} textStyle={styles.googleText} loading={googleLoading} loaderColor="#555" onPress={handleGoogleLogin} />
            <LoginBtn emoji="💬" label="카카오로 계속하기" style={styles.kakaoBtn} textStyle={styles.kakaoText} loading={kakaoLoading} loaderColor="#3C1E1E" onPress={handleKakaoLogin} />
            <LoginBtn emoji="N" emojiStyle={styles.naverEmoji} label="네이버로 계속하기" style={styles.naverBtn} textStyle={styles.naverText} loading={naverLoading} loaderColor="#fff" onPress={handleNaverLogin} />
            <LoginBtn emoji="f" emojiStyle={styles.fbEmoji} label="Facebook으로 계속하기" style={styles.fbBtn} textStyle={styles.fbText} loading={false} loaderColor="#fff" onPress={handleFacebookLogin} />
            <LoginBtn emoji="📱" label="휴대폰 번호로 계속하기" style={styles.phoneBtn} textStyle={styles.phoneText} loading={false} loaderColor="#fff" onPress={openPhoneModal} />

            <Text style={styles.termsText}>로그인 시 서비스 이용약관 및 개인정보 처리방침에 동의합니다</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 메인 콘텐츠 ── */}
      <View style={styles.inner}>

        {/* 상단: 로고 + 관리자 */}
        <View style={styles.topBar}>
          <Text style={styles.logo}>🌱 새싹</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.adminBtn}>
            <Text style={styles.adminBtnText}>관리자</Text>
          </TouchableOpacity>
        </View>

        {/* 슬로건 */}
        <View style={styles.sloganWrap}>
          <Text style={styles.sloganLine1}>
            <Text style={styles.sloganAccent}>새</Text>
            <Text style={styles.sloganPlain}>로운 사랑이</Text>
          </Text>
          <Text style={styles.sloganLine2}>
            <Text style={styles.sloganAccent}>싹</Text>
            <Text style={styles.sloganPlain}>트는 그곳</Text>
          </Text>
        </View>

        {/* 모델 사진 캐러셀 */}
        <View style={styles.carouselOuter}>
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + CARD_GAP}
            decelerationRate="fast"
            contentContainerStyle={styles.carouselContent}
            onMomentumScrollEnd={e => {
              const page = Math.round(
                e.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_GAP),
              );
              setActiveSlide(page);
            }}>
            {MODEL_PHOTOS.map((src, i) => (
              <Image
                key={i}
                source={src}
                style={styles.photoCard}
                resizeMode="cover"
              />
            ))}
          </ScrollView>

          {/* 인디케이터 */}
          <View style={styles.dots}>
            {MODEL_PHOTOS.map((_, i) => (
              <View key={i} style={[styles.dot, i === activeSlide && styles.dotActive]} />
            ))}
          </View>
        </View>

        {/* 기능 설명 3열 */}
        <View style={styles.featuresRow}>
          {FEATURES.map(f => (
            <View key={f.title} style={styles.featureItem}>
              <View style={styles.featureCircle}>
                <Text style={styles.featureEmoji}>{f.emoji}</Text>
              </View>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── 로그인 버튼 (고정 하단) ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.loginCta}
          onPress={() => setLoginModalVisible(true)}>
          <Text style={styles.loginCtaText}>🌱 로그인</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── 공통 소셜 버튼 ────────────────────────────────────────────────
interface LoginBtnProps {
  emoji: string;
  emojiStyle?: object;
  label: string;
  style: object;
  textStyle: object;
  loading: boolean;
  loaderColor: string;
  onPress: () => void;
}
function LoginBtn({emoji, emojiStyle, label, style, textStyle, loading, loaderColor, onPress}: LoginBtnProps) {
  return (
    <TouchableOpacity
      style={[styles.socialBase, style, loading && styles.dimmed]}
      onPress={onPress}
      disabled={loading}>
      {loading ? (
        <ActivityIndicator color={loaderColor} />
      ) : (
        <View style={styles.socialInner}>
          <Text style={[styles.socialEmoji, emojiStyle]}>{emoji}</Text>
          <Text style={[styles.socialLabel, textStyle]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#151a28'},
  inner: {flex: 1},

  // 상단 바
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingBottom: 8,
  },
  logo: {fontSize: 20, fontWeight: '800', color: '#4CAF50'},
  adminBtn: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  adminBtnText: {fontSize: 11, color: 'rgba(255,255,255,0.3)'},

  // 슬로건
  sloganWrap: {paddingHorizontal: 24, marginTop: 36, marginBottom: 20},
  sloganLine1: {fontSize: 34, fontWeight: '800', lineHeight: 42},
  sloganLine2: {fontSize: 34, fontWeight: '800', lineHeight: 42},
  sloganAccent: {color: '#4CAF50'},
  sloganPlain: {color: '#ffffff'},

  // 캐러셀
  carouselOuter: {marginBottom: 20},
  carouselContent: {
    paddingLeft: 24,
    paddingRight: 24 - CARD_GAP,
    gap: CARD_GAP,
  },
  photoCard: {
    width: CARD_WIDTH,
    height: 390,
    borderRadius: 20,
    backgroundColor: '#2a2f40',
    marginTop: 28,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    gap: 5,
  },
  dot: {width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)'},
  dotActive: {width: 16, backgroundColor: '#4CAF50'},

  // 기능 설명
  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
  },
  featureItem: {alignItems: 'center', flex: 1},
  featureCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
  },
  featureEmoji: {fontSize: 22},
  featureTitle: {fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 4},
  featureDesc: {fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 16},

  // 하단 버튼
  footer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    paddingTop: 16,
  },
  loginCta: {
    height: 56,
    backgroundColor: '#4CAF50',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginCtaText: {color: '#fff', fontSize: 17, fontWeight: '700'},

  // 모달 공통
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'},
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  sheetHandle: {
    width: 36, height: 4, backgroundColor: '#e0e0e0',
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: {fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 8},
  sheetDesc: {fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 20},
  sheetBtn: {
    height: 52, backgroundColor: '#4CAF50', borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  sheetBtnText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  backBtn: {marginTop: 14, alignItems: 'center'},
  backBtnText: {fontSize: 14, color: '#4CAF50'},

  phoneRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16},
  prefix: {
    height: 52, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#e0e0e0',
    justifyContent: 'center', alignItems: 'center',
  },
  prefixText: {fontSize: 14, color: '#333', fontWeight: '500'},
  phoneInput: {
    flex: 1, height: 52, borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 12, paddingHorizontal: 16, fontSize: 16, color: '#222',
  },
  otpInput: {
    flex: 0, width: '100%', textAlign: 'center',
    letterSpacing: 8, fontSize: 22, marginBottom: 16,
  },

  // 로그인 선택 시트
  loginSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
  },
  loginSheetTitle: {fontSize: 20, fontWeight: '800', color: '#222', marginBottom: 4},
  loginSheetSub: {fontSize: 13, color: '#999', marginBottom: 20},

  socialBase: {height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 10},
  socialInner: {flexDirection: 'row', alignItems: 'center', gap: 8},
  socialEmoji: {fontSize: 18, width: 24, textAlign: 'center'},
  socialLabel: {fontSize: 15, fontWeight: '500'},

  googleBtn: {backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0'},
  googleText: {color: '#333'},
  kakaoBtn: {backgroundColor: '#FEE500'},
  kakaoText: {color: '#3C1E1E', fontWeight: '600'},
  naverBtn: {backgroundColor: '#03C75A'},
  naverText: {color: '#fff', fontWeight: '600'},
  naverEmoji: {color: '#fff', fontWeight: '900', fontSize: 16},
  fbBtn: {backgroundColor: '#1877F2'},
  fbText: {color: '#fff', fontWeight: '600'},
  fbEmoji: {color: '#fff', fontWeight: '900', fontSize: 20},
  phoneBtn: {backgroundColor: '#333'},
  phoneText: {color: '#fff', fontWeight: '600'},

  termsText: {fontSize: 11, color: '#bbb', textAlign: 'center', marginTop: 6, lineHeight: 16},
  dimmed: {opacity: 0.6},
});
