import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import KakaoUser from '@react-native-kakao/user';
import NaverLogin from '@react-native-seoul/naver-login';
import {StackNavigationProp} from '@react-navigation/stack';
import {AuthStackParamList} from '../../navigation/AuthStack';

const WEB_CLIENT_ID = '420359268221-rran1o958fh75hl73ba1t74au6bsd2ov.apps.googleusercontent.com';

// ── 외부 SDK 초기화 ──────────────────────────────────────────
GoogleSignin.configure({webClientId: WEB_CLIENT_ID});

NaverLogin.initialize({
  appName: '새싹',
  consumerKey: '89L0gMzLAYR_8XjcGwiT',       // 네이버 개발자 콘솔에서 발급
  consumerSecret: '9i7A4o2wXg', // 네이버 개발자 콘솔에서 발급
  serviceUrlSchemeIOS: 'naversaesak',
  disableNaverAppAuthIOS: false,
});

type Props = {
  navigation: StackNavigationProp<AuthStackParamList, 'Login'>;
};

// ── 관리자 전용 화면 헤더 ──────────────────────────────────────────
function AdminHeader({onBack}: {onBack: () => void}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
      backgroundColor: '#fff3e0',
      borderBottomWidth: 1, borderBottomColor: '#ffe0b2',
    }}>
      <TouchableOpacity onPress={onBack} style={{marginRight: 12}}>
        <Text style={{color: '#f57c00', fontSize: 15, fontWeight: '600'}}>← 첫 화면</Text>
      </TouchableOpacity>
      <Text style={{flex: 1, textAlign: 'center', fontSize: 13, color: '#e65100', fontWeight: '700'}}>
        🔧 관리자 전용 로그인
      </Text>
      <View style={{width: 56}} />
    </View>
  );
}

// Firestore users 문서 생성 (신규 유저 공통)
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

export default function LoginScreen({navigation}: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [naverLoading, setNaverLoading] = useState(false);
  const [facebookLoading] = useState(false);

  // ── 휴대폰 인증 모달 state ───────────────────────────────
  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp'>('input');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [confirmation, setConfirmation] =
    useState<FirebaseAuthTypes.ConfirmationResult | null>(null);

  // ── 이메일 로그인 ────────────────────────────────────────
  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('알림', '이메일과 비밀번호를 입력해주세요.');
      return;
    }
    try {
      setLoading(true);
      await auth().signInWithEmailAndPassword(email.trim(), password);
    } catch (error: any) {
      Alert.alert('로그인 실패', firebaseErrorMessage(error.code));
    } finally {
      setLoading(false);
    }
  };

  // ── Google 로그인 ────────────────────────────────────────
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
    } catch (error: any) {
      if (error.code !== 'SIGN_IN_CANCELLED') {
        Alert.alert('구글 로그인 실패', error.message ?? '오류가 발생했습니다.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // ── 카카오 로그인 ────────────────────────────────────────
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
    } catch (error: any) {
      if (error.code !== 'SIGN_IN_CANCELLED' && error.code !== 'E_CANCELLED') {
        Alert.alert('카카오 로그인 실패', error.message ?? '오류가 발생했습니다.');
      }
    } finally {
      setKakaoLoading(false);
    }
  };

  // ── 네이버 로그인 ────────────────────────────────────────
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
      // Cloud Function으로 Custom Token 획득
      const result = await functions().httpsCallable('naverLogin')({
        accessToken: successResponse.accessToken,
      });
      const {customToken} = result.data as {customToken: string};
      await auth().signInWithCustomToken(customToken);
      // users 문서는 Cloud Function에서 생성됨
    } catch (error: any) {
      Alert.alert('네이버 로그인 실패', error.message ?? '오류가 발생했습니다.');
    } finally {
      setNaverLoading(false);
    }
  };

  // ── Facebook 로그인 (준비 중) ────────────────────────────
  const handleFacebookLogin = () => {
    Alert.alert('준비 중', 'Facebook 로그인은 곧 지원 예정이에요.');
  };

  // ── 휴대폰 인증: OTP 발송 ────────────────────────────────
  const handleSendOtp = async () => {
    const digits = phoneNumber.replace(/[^0-9]/g, '');
    if (digits.length < 10) {
      Alert.alert('알림', '올바른 휴대폰 번호를 입력해주세요.');
      return;
    }
    // 010... → +8210...
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

  // ── 휴대폰 인증: OTP 확인 ────────────────────────────────
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
        await ensureUserDoc(uc.user.uid, 'phone', {
          phone: uc.user.phoneNumber ?? '',
        });
      }
      setPhoneModalVisible(false);
    } catch (error: any) {
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      <AdminHeader onBack={() => navigation.navigate('Landing')} />

      {/* ── 휴대폰 인증 모달 ── */}
      <Modal
        visible={phoneModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closePhoneModal}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={closePhoneModal}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <Text style={styles.modalTitle}>📱 휴대폰 번호 로그인</Text>

            {phoneStep === 'input' ? (
              <>
                <Text style={styles.modalDesc}>
                  휴대폰 번호를 입력하면 인증번호를 문자로 보내드려요.
                </Text>
                <View style={styles.phoneInputRow}>
                  <View style={styles.phonePrefix}>
                    <Text style={styles.phonePrefixText}>🇰🇷 +82</Text>
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
                  style={[styles.modalBtn, phoneLoading && styles.buttonDisabled]}
                  onPress={handleSendOtp}
                  disabled={phoneLoading}>
                  {phoneLoading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.modalBtnText}>인증번호 받기</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalDesc}>
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
                  style={[styles.modalBtn, phoneLoading && styles.buttonDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={phoneLoading}>
                  {phoneLoading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.modalBtnText}>확인</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalBackBtn}
                  onPress={() => setPhoneStep('input')}>
                  <Text style={styles.modalBackBtnText}>← 번호 다시 입력</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 메인 로그인 화면 ── */}
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={styles.logo}>🌱 새싹</Text>
        <Text style={styles.subtitle}>새로운 사랑이 싹트는 그곳</Text>

        <TextInput
          style={styles.input}
          placeholder="이메일"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호"
          placeholderTextColor="#aaa"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>로그인</Text>}
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>소셜 로그인</Text>
          <View style={styles.divider} />
        </View>

        {/* Google */}
        <SocialButton
          label="Google로 계속하기"
          emoji="🔍"
          style={styles.googleButton}
          textStyle={styles.googleButtonText}
          loading={googleLoading}
          loaderColor="#555"
          onPress={handleGoogleLogin}
        />
        {/* 카카오 */}
        <SocialButton
          label="카카오로 계속하기"
          emoji="💬"
          style={styles.kakaoButton}
          textStyle={styles.kakaoButtonText}
          loading={kakaoLoading}
          loaderColor="#3C1E1E"
          onPress={handleKakaoLogin}
        />
        {/* 네이버 */}
        <SocialButton
          label="네이버로 계속하기"
          emoji="N"
          emojiStyle={styles.naverEmoji}
          style={styles.naverButton}
          textStyle={styles.naverButtonText}
          loading={naverLoading}
          loaderColor="#fff"
          onPress={handleNaverLogin}
        />
        {/* Facebook */}
        <SocialButton
          label="Facebook으로 계속하기"
          emoji="f"
          emojiStyle={styles.fbEmoji}
          style={styles.fbButton}
          textStyle={styles.fbButtonText}
          loading={facebookLoading}
          loaderColor="#fff"
          onPress={handleFacebookLogin}
        />
        {/* 휴대폰 */}
        <SocialButton
          label="휴대폰 번호로 계속하기"
          emoji="📱"
          style={styles.phoneButton}
          textStyle={styles.phoneButtonText}
          loading={false}
          loaderColor="#fff"
          onPress={() => setPhoneModalVisible(true)}
        />

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('Register')}>
          <Text style={styles.linkText}>
            계정이 없으신가요?{' '}
            <Text style={styles.linkBold}>회원가입</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── 공통 소셜 버튼 컴포넌트 ───────────────────────────────────
interface SocialButtonProps {
  label: string;
  emoji: string;
  emojiStyle?: object;
  style: object;
  textStyle: object;
  loading: boolean;
  loaderColor: string;
  onPress: () => void;
}
function SocialButton({
  label, emoji, emojiStyle, style, textStyle, loading, loaderColor, onPress,
}: SocialButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.socialBase, style, loading && styles.buttonDisabled]}
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

function firebaseErrorMessage(code: string): string {
  switch (code) {
    case 'auth/user-not-found':    return '등록되지 않은 이메일입니다.';
    case 'auth/wrong-password':    return '비밀번호가 올바르지 않습니다.';
    case 'auth/invalid-email':     return '이메일 형식이 올바르지 않습니다.';
    case 'auth/too-many-requests': return '시도 횟수가 초과됐어요. 잠시 후 다시 시도해주세요.';
    case 'auth/invalid-credential': return '이메일 또는 비밀번호가 올바르지 않습니다.';
    default: return '로그인 중 오류가 발생했습니다.';
  }
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  inner: {flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48},
  logo: {fontSize: 48, textAlign: 'center', marginBottom: 8},
  subtitle: {fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 40},
  input: {
    height: 52, borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 12, paddingHorizontal: 16, marginBottom: 12,
    fontSize: 16, color: '#222',
  },
  button: {
    height: 52, backgroundColor: '#4CAF50', borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: {opacity: 0.6},
  buttonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  dividerRow: {flexDirection: 'row', alignItems: 'center', marginVertical: 20},
  divider: {flex: 1, height: 1, backgroundColor: '#e0e0e0'},
  dividerText: {marginHorizontal: 12, color: '#aaa', fontSize: 12},

  // 소셜 버튼 공통
  socialBase: {height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 10},
  socialInner: {flexDirection: 'row', alignItems: 'center', gap: 8},
  socialEmoji: {fontSize: 18, width: 24, textAlign: 'center'},
  socialLabel: {fontSize: 15, fontWeight: '500'},

  // 각 소셜 색상
  googleButton: {backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0'},
  googleButtonText: {color: '#333'},
  kakaoButton: {backgroundColor: '#FEE500'},
  kakaoButtonText: {color: '#3C1E1E', fontWeight: '600'},
  naverButton: {backgroundColor: '#03C75A'},
  naverButtonText: {color: '#fff', fontWeight: '600'},
  naverEmoji: {color: '#fff', fontWeight: '900', fontSize: 16},
  fbButton: {backgroundColor: '#1877F2'},
  fbButtonText: {color: '#fff', fontWeight: '600'},
  fbEmoji: {color: '#fff', fontWeight: '900', fontSize: 20},
  phoneButton: {backgroundColor: '#333'},
  phoneButtonText: {color: '#fff', fontWeight: '600'},

  linkButton: {marginTop: 16, alignItems: 'center'},
  linkText: {color: '#888', fontSize: 14},
  linkBold: {color: '#4CAF50', fontWeight: '600'},

  // 휴대폰 모달
  modalBackdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end'},
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 28, paddingBottom: 40,
  },
  modalTitle: {fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 8},
  modalDesc: {fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 20},
  phoneInputRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16},
  phonePrefix: {
    height: 52, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#e0e0e0',
    justifyContent: 'center', alignItems: 'center',
  },
  phonePrefixText: {fontSize: 14, color: '#333', fontWeight: '500'},
  phoneInput: {
    flex: 1, height: 52, borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 12, paddingHorizontal: 16, fontSize: 16, color: '#222',
  },
  otpInput: {flex: 0, width: '100%', textAlign: 'center', letterSpacing: 8, fontSize: 22, marginBottom: 16},
  modalBtn: {
    height: 52, backgroundColor: '#4CAF50', borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  modalBtnText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  modalBackBtn: {marginTop: 14, alignItems: 'center'},
  modalBackBtnText: {fontSize: 14, color: '#4CAF50'},
});
