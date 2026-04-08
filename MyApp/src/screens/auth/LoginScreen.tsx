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
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import KakaoUser from '@react-native-kakao/user';
import {StackNavigationProp} from '@react-navigation/stack';
import {AuthStackParamList} from '../../navigation/AuthStack';

// Firebase 콘솔 → 프로젝트 설정 → 내 앱 → google-services.json 재다운로드 후
// oauth_client[type=3].client_id 값으로 교체
const WEB_CLIENT_ID = '420359268221-rran1o958fh75hl73ba1t74au6bsd2ov.apps.googleusercontent.com';

GoogleSignin.configure({webClientId: WEB_CLIENT_ID});

type Props = {
  navigation: StackNavigationProp<AuthStackParamList, 'Login'>;
};

export default function LoginScreen({navigation}: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(false);

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

  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true);
      await GoogleSignin.hasPlayServices();
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;
      if (!idToken) throw new Error('ID 토큰을 가져오지 못했습니다.');

      const googleCredential = auth.GoogleAuthProvider.credential(idToken);
      const userCredential = await auth().signInWithCredential(googleCredential);

      // 신규 유저면 Firestore users 문서 생성 (실패해도 로그인은 유지)
      try {
        const userDoc = await firestore()
          .collection('users')
          .doc(userCredential.user.uid)
          .get();

        if (!userDoc.exists()) {
          await firestore()
            .collection('users')
            .doc(userCredential.user.uid)
            .set({
              uid: userCredential.user.uid,
              email: userCredential.user.email ?? '',
              provider: 'google',
              coin_balance: 100,
              is_premium: false,
              is_blocked: false,
              created_at: firestore.FieldValue.serverTimestamp(),
            });
        }
      } catch {
        // Firestore 오류는 무시 (로그인 자체는 성공)
      }
    } catch (error: any) {
      if (error.code !== 'SIGN_IN_CANCELLED') {
        Alert.alert('구글 로그인 실패', error.message ?? '오류가 발생했습니다.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleKakaoLogin = async () => {
    try {
      setKakaoLoading(true);
      await KakaoUser.login();
      const kakaoProfile = await KakaoUser.me();

      // Firebase Auth: 카카오 ID 기반 이메일/비밀번호 브릿지
      // (Firebase는 카카오 OAuth를 직접 지원하지 않으므로 결정론적 자격증명 사용)
      const kakaoEmail = `kakao_${kakaoProfile.id}@kakao.saesak.app`;
      const kakaoPassword = `kakao_${kakaoProfile.id}_saesak`;

      // create-first 전략: 신규면 계정 생성, 기존이면 로그인
      let userCredential;
      try {
        userCredential = await auth().createUserWithEmailAndPassword(kakaoEmail, kakaoPassword);
      } catch (createError: any) {
        if (createError.code === 'auth/email-already-in-use') {
          userCredential = await auth().signInWithEmailAndPassword(kakaoEmail, kakaoPassword);
        } else {
          throw createError;
        }
      }

      // 신규 유저면 Firestore 문서 생성
      try {
        const userDoc = await firestore()
          .collection('users')
          .doc(userCredential.user.uid)
          .get();

        if (!userDoc.exists()) {
          await firestore()
            .collection('users')
            .doc(userCredential.user.uid)
            .set({
              uid: userCredential.user.uid,
              email: kakaoProfile.email ?? kakaoEmail,
              provider: 'kakao',
              kakao_id: String(kakaoProfile.id),
              coin_balance: 100,
              is_premium: false,
              is_blocked: false,
              created_at: firestore.FieldValue.serverTimestamp(),
            });
        }
      } catch {
        // Firestore 오류는 무시 (로그인 자체는 성공)
      }
    } catch (error: any) {
      if (error.code !== 'SIGN_IN_CANCELLED' && error.code !== 'E_CANCELLED') {
        Alert.alert('카카오 로그인 실패', error.message ?? '오류가 발생했습니다.');
      }
    } finally {
      setKakaoLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
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
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>로그인</Text>
          )}
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>또는</Text>
          <View style={styles.divider} />
        </View>

        <TouchableOpacity
          style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
          onPress={handleGoogleLogin}
          disabled={googleLoading}>
          {googleLoading ? (
            <ActivityIndicator color="#555" />
          ) : (
            <Text style={styles.googleButtonText}>🔍 Google로 계속하기</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.kakaoButton, kakaoLoading && styles.buttonDisabled]}
          onPress={handleKakaoLogin}
          disabled={kakaoLoading}>
          {kakaoLoading ? (
            <ActivityIndicator color="#3C1E1E" />
          ) : (
            <Text style={styles.kakaoButtonText}>💬 카카오로 계속하기</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('Register')}>
          <Text style={styles.linkText}>
            계정이 없으신가요? <Text style={styles.linkBold}>회원가입</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function firebaseErrorMessage(code: string): string {
  switch (code) {
    case 'auth/user-not-found':
      return '등록되지 않은 이메일입니다.';
    case 'auth/wrong-password':
      return '비밀번호가 올바르지 않습니다.';
    case 'auth/invalid-email':
      return '이메일 형식이 올바르지 않습니다.';
    case 'auth/too-many-requests':
      return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.';
    case 'auth/invalid-credential':
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    default:
      return '로그인 중 오류가 발생했습니다.';
  }
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  inner: {flex: 1, justifyContent: 'center', paddingHorizontal: 32},
  logo: {fontSize: 48, textAlign: 'center', marginBottom: 8},
  subtitle: {fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 48},
  input: {
    height: 52, borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 12, paddingHorizontal: 16, marginBottom: 12,
    fontSize: 16, color: '#222',
  },
  button: {
    height: 52, backgroundColor: '#4CAF50', borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: {opacity: 0.6},
  buttonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  dividerRow: {flexDirection: 'row', alignItems: 'center', marginVertical: 20},
  divider: {flex: 1, height: 1, backgroundColor: '#e0e0e0'},
  dividerText: {marginHorizontal: 12, color: '#aaa', fontSize: 13},
  googleButton: {
    height: 52, backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e0e0e0',
    justifyContent: 'center', alignItems: 'center',
  },
  googleButtonText: {fontSize: 15, color: '#333', fontWeight: '500'},
  kakaoButton: {
    height: 52, backgroundColor: '#FEE500', borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginTop: 10,
  },
  kakaoButtonText: {fontSize: 15, color: '#3C1E1E', fontWeight: '600'},
  linkButton: {marginTop: 24, alignItems: 'center'},
  linkText: {color: '#888', fontSize: 14},
  linkBold: {color: '#4CAF50', fontWeight: '600'},
});
