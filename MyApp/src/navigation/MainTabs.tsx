import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import SwipeScreen from '../screens/match/SwipeScreen';
import MapScreen from '../screens/match/MapScreen';
import ChatListScreen from '../screens/chat/ChatListScreen';
import MyProfileScreen from '../screens/MyProfileScreen';
import {useTheme} from '../context/ThemeContext';

export type MainTabParamList = {
  Swipe: undefined;
  Map: undefined;
  ChatList: undefined;
  MyProfile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  const {colors} = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {backgroundColor: colors.card, borderTopColor: colors.divider},
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}>
      <Tab.Screen name="Swipe" component={SwipeScreen} options={{title: '탐색'}} />
      <Tab.Screen name="Map" component={MapScreen} options={{title: '근처'}} />
      <Tab.Screen name="ChatList" component={ChatListScreen} options={{title: '채팅'}} />
      <Tab.Screen name="MyProfile" component={MyProfileScreen} options={{title: '내 정보'}} />
    </Tab.Navigator>
  );
}
