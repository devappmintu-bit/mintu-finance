import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LangCode } from '../utils/i18n';
import { STORAGE } from '../constants/storage';

interface LangState {
  lang: LangCode;
  setLang: (lang: LangCode) => Promise<void>;
  loadLang: () => Promise<void>;
}

export const useLangStore = create<LangState>((set) => ({
  lang: 'en',
  setLang: async (lang) => {
    await AsyncStorage.setItem(STORAGE.APP_LANG, lang);
    set({ lang });
  },
  loadLang: async () => {
    const saved = await AsyncStorage.getItem(STORAGE.APP_LANG);
    if (saved) set({ lang: saved as LangCode });
  },
}));
