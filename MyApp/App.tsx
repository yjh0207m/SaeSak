import React, {useEffect} from 'react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {initializeKakaoSDK} from '@react-native-kakao/core';
import RootNavigator from './src/navigation/RootNavigator';

const KAKAO_NATIVE_APP_KEY = 'f8a7898929b5397c53762e60482e795e';

export default function App() {
  useEffect(() => {
    initializeKakaoSDK(KAKAO_NATIVE_APP_KEY);
  }, []);

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
