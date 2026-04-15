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
  isLoading: boolean;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  logout: () => void;
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setToken: async (token) => {
    await AsyncStorage.setItem('token', token);
    set({ token });
  },
  logout: async () => {
    await AsyncStorage.removeItem('token');
    set({ user: null, token: null });
  },
  loadFromStorage: async () => {
    const token = await AsyncStorage.getItem('token');
    set({ token, isLoading: false });
  },
}));