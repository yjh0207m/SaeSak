import React, {createContext, useContext, useEffect, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@saesak_theme';

export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  // 배경
  bg: string;
  bgSecondary: string;
  card: string;
  inputBg: string;
  // 텍스트
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textPlaceholder: string;
  // 구분선/테두리
  border: string;
  divider: string;
  // 강조
  primary: string;
  primaryMuted: string;
  tagBg: string;
  tagText: string;
  // 기타
  danger: string;
}

const dark: ThemeColors = {
  bg: '#151a28',
  bgSecondary: '#1e2538',
  card: '#1e2538',
  inputBg: '#151a28',
  textPrimary: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.7)',
  textMuted: 'rgba(255,255,255,0.35)',
  textPlaceholder: 'rgba(255,255,255,0.3)',
  border: 'rgba(255,255,255,0.15)',
  divider: 'rgba(255,255,255,0.06)',
  primary: '#4CAF50',
  primaryMuted: 'rgba(76,175,80,0.15)',
  tagBg: 'rgba(76,175,80,0.2)',
  tagText: '#81c784',
  danger: '#ff5252',
};

const light: ThemeColors = {
  bg: '#f5f5f5',
  bgSecondary: '#ffffff',
  card: '#ffffff',
  inputBg: '#ffffff',
  textPrimary: '#222222',
  textSecondary: '#444444',
  textMuted: '#888888',
  textPlaceholder: '#bbbbbb',
  border: '#e0e0e0',
  divider: '#f0f0f0',
  primary: '#4CAF50',
  primaryMuted: 'rgba(76,175,80,0.1)',
  tagBg: '#e8f5e9',
  tagText: '#4CAF50',
  danger: '#ff5252',
};

interface ThemeContextType {
  mode: ThemeMode;
  colors: ThemeColors;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'dark',
  colors: dark,
  toggle: () => {},
});

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const [mode, setMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val === 'light' || val === 'dark') {setMode(val);}
    });
  }, []);

  const toggle = () => {
    setMode(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{mode, colors: mode === 'dark' ? dark : light, toggle}}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
