
import 'react-native-url-polyfill/auto';

import {
  createClient,
  type Session,
} from '@supabase/supabase-js';
import { Platform } from 'react-native';

import * as SecureStore from 'expo-secure-store';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  'https://placeholder.supabase.co';

const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  'placeholder-publishable-key';

const isSupabaseConfigured = Boolean(
  process.env.EXPO_PUBLIC_SUPABASE_URL &&
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase is not configured yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to your .env file to enable auth and profile loading.'
  );
}

const ExpoSecureStoreAdapter = {
  getItem: (key: string) =>
    SecureStore.getItemAsync(key),

  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value),

  removeItem: (key: string) =>
    SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      ...(Platform.OS === 'web'
        ? {}
        : { storage: ExpoSecureStoreAdapter }),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  }
);

export type { Session };
