import React, {useEffect, useRef, useState} from 'react';
import {Alert, Text, TouchableOpacity} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import ChatRoomScreen from '../screens/chat/ChatRoomScreen';
import FilterScreen from '../screens/match/FilterScreen';
import ProfileSetupScreen from '../screens/auth/ProfileSetupScreen';
import CoinShopScreen from '../screens/pay/CoinShopScreen';
import PremiumScreen from '../screens/pay/PremiumScreen';

// Metro 0.83 + @react-navigation/elements v2 에셋 버그 우회:
// 기본 PNG 뒤로가기 버튼 대신 커스텀 컴포넌트 사용
function BackButton({onPress}: {onPress: () => void}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{paddingHorizontal: 16, paddingVertical: 8}}>
      <Text style={{fontSize: 17, color: '#4CAF50'}}>‹ 뒤로</Text>
    </TouchableOpacity>
  );
}

export type RootStackParamList = {
  AuthStack: undefined;
  MainTabs: undefined;
  ProfileSetup: undefined;
  ChatRoom: {matchId: string; otherUserNickname: string; otherUserUid: string};
  Filter: undefined;
  EditProfile: undefined;
  CoinShop: undefined;
  Premium: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [profileChecking, setProfileChecking] = useState(false);

  // Firestore 프로필 리스너 ref — 로그아웃 시 정리
  const unsubProfileRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    const unsubAuth = auth().onAuthStateChanged(currentUser => {
      // 이전 프로필 리스너 정리
      unsubProfileRef.current?.();
      unsubProfileRef.current = undefined;

      setUser(currentUser);
      setInitializing(false);

      if (currentUser) {
        setProfileChecking(true);
        // profiles/{uid} 실시간 감시 — 저장 즉시 MainTabs로 전환
        unsubProfileRef.current = firestore()
          .collection('profiles')
          .doc(currentUser.uid)
          .onSnapshot(
            doc => {
              setHasProfile(doc.exists());
              setProfileChecking(false);
            },
            () => {
              setHasProfile(false);
              setProfileChecking(false);
            },
          );
      } else {
        setHasProfile(false);
        setProfileChecking(false);
      }
    });

    return () => {
      unsubAuth();
      unsubProfileRef.current?.();
    };
  }, []);

  if (initializing || profileChecking) {
    return null;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={({navigation}) => ({
          headerShown: false,
          headerLeft: ({canGoBack}) =>
            canGoBack ? <BackButton onPress={() => navigation.goBack()} /> : null,
        })}>
        {user ? (
          hasProfile ? (
            // 로그인 + 프로필 완성 → 메인
            <>
              <Stack.Screen name="MainTabs" component={MainTabs} />
              <Stack.Screen
                name="ChatRoom"
                component={ChatRoomScreen}
                options={({route}) => ({
                  headerShown: true,
                  title: route.params.otherUserNickname,
                })}
              />
              <Stack.Screen
                name="Filter"
                component={FilterScreen}
                options={{headerShown: true, title: '필터'}}
              />
              <Stack.Screen
                name="EditProfile"
                component={ProfileSetupScreen}
                options={{headerShown: true, title: '프로필 편집'}}
              />
              <Stack.Screen
                name="CoinShop"
                component={CoinShopScreen}
                options={{headerShown: true, title: '코인 충전'}}
              />
              <Stack.Screen
                name="Premium"
                component={PremiumScreen}
                options={{headerShown: true, title: '프리미엄'}}
              />
            </>
          ) : (
            // 로그인 + 프로필 미완성 → 프로필 설정
            <Stack.Screen
              name="ProfileSetup"
              component={ProfileSetupScreen}
              options={{
                headerShown: true,
                title: '프로필 설정',
                headerLeft: () => null,
                headerRight: () => (
                  <TouchableOpacity
                    style={{paddingRight: 16}}
                    onPress={() =>
                      Alert.alert('로그아웃', '로그아웃 하시겠어요?', [
                        {text: '취소', style: 'cancel'},
                        {text: '로그아웃', style: 'destructive', onPress: () => auth().signOut()},
                      ])
                    }>
                    <Text style={{color: '#ff5252', fontSize: 14}}>로그아웃</Text>
                  </TouchableOpacity>
                ),
              }}
            />
          )
        ) : (
          // 미로그인 → 인증 플로우
          <Stack.Screen name="AuthStack" component={AuthStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
