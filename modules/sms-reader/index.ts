import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';

export interface RawSms {
  id: string;
  address: string;
  body: string;
  /** Epoch milliseconds. */
  date: number;
}

interface SmsReaderNative {
  isAvailable(): boolean;
  readInbox(sinceMs: number, limit: number): Promise<RawSms[]>;
}

const allowed = Constants.expoConfig?.extra?.smsEnabled !== false;
const native = Platform.OS === 'android' && allowed ? requireOptionalNativeModule<SmsReaderNative>('SmsReader') : null;

/** False on iOS (no SMS access exists), in Expo Go, and in the Play Store flavour built without SMS. */
export const isSmsAvailable = (): boolean => Boolean(native?.isAvailable());

export async function readInbox(sinceMs: number, limit = 500): Promise<RawSms[]> {
  if (!native) return [];
  return native.readInbox(sinceMs, limit);
}
