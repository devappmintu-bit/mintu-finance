import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id: string;
  name: string;
  phone: string;
  money_score: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  avatar: string; // base64 or URI — kept in sync between Home + Profile via AsyncStorage
  isLoading: boolean;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  setAvatar: (avatar: string) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => Promise<void>;
}

const AVATAR_KEY = 'user_avatar';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  avatar: '',
  isLoading: true,
  setUser: (user) => set({ user }),
  setToken: async (token) => {
    await AsyncStorage.setItem('token', token);
    set({ token });
  },
  setAvatar: async (avatar: string) => {
    // Persist + update store so every mounted screen re-renders immediately.
    set({ avatar });
    try {
      if (avatar) await AsyncStorage.setItem(AVATAR_KEY, avatar);
      else await AsyncStorage.removeItem(AVATAR_KEY);
    } catch { /* noop */ }
  },
  logout: async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem(AVATAR_KEY);
    set({ user: null, token: null, avatar: '' });
  },
  loadFromStorage: async () => {
    const [token, avatar] = await Promise.all([
      AsyncStorage.getItem('token'),
      AsyncStorage.getItem(AVATAR_KEY),
    ]);
    set({ token, avatar: avatar || '', isLoading: false });
  },
}));
