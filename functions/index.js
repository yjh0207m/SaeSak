const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

admin.initializeApp();

/**
 * 네이버 로그인 Cloud Function
 * 네이버 accessToken을 받아 Firebase Custom Token 반환
 */
exports.naverLogin = functions.https.onCall(async (data, context) => {
  const accessToken = data.accessToken;

  if (!accessToken) {
    throw new functions.https.HttpsError('invalid-argument', 'accessToken이 필요합니다.');
  }

  try {
    // 네이버 사용자 정보 조회
    const response = await axios.get('https://openapi.naver.com/v1/nid/me', {
      headers: {Authorization: `Bearer ${accessToken}`},
    });

    const naverUser = response.data.response;
    const uid = `naver:${naverUser.id}`;

    // Firebase Auth 사용자 생성 또는 확인
    try {
      await admin.auth().getUser(uid);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        await admin.auth().createUser({
          uid,
          displayName: naverUser.name || naverUser.nickname || '새싹 유저',
          email: naverUser.email || undefined,
          photoURL: naverUser.profile_image || undefined,
        });
      } else {
        throw error;
      }
    }

    // Firestore users 문서 생성 (신규 유저)
    const userRef = admin.firestore().collection('users').doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      await userRef.set({
        uid,
        email: naverUser.email || '',
        provider: 'naver',
        naver_id: String(naverUser.id),
        coin_balance: 100,
        is_premium: false,
        is_blocked: false,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    const customToken = await admin.auth().createCustomToken(uid);
    return {customToken};
  } catch (error) {
    console.error('naverLogin error:', error);
    throw new functions.https.HttpsError('internal', '네이버 로그인 처리 중 오류가 발생했습니다.');
  }
});
