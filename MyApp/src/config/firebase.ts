import firebase from '@react-native-firebase/app';

// @react-native-firebase는 google-services.json (Android) /
// GoogleService-Info.plist (iOS) 파일에서 자동으로 설정을 읽습니다.
// 별도의 initializeApp() 호출이 필요하지 않습니다.

// Auth
export { default as auth } from '@react-native-firebase/auth';

// Firestore
export { default as firestore } from '@react-native-firebase/firestore';

// Storage
export { default as storage } from '@react-native-firebase/storage';

// Messaging (FCM)
export { default as messaging } from '@react-native-firebase/messaging';

export default firebase;
