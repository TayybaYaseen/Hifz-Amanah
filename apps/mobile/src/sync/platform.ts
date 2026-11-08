// Device services for sync and app lock: secure random bytes (expo-crypto), SHA-256 for the PIN hash
// (expo-crypto), and secure key-value storage (expo-secure-store, Android Keystore-backed).
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { KeyValueStore, PinCrypto } from '../app-lock/lock.ts';
import type { RandomBytes } from './ids.ts';

export const secureRandomBytes: RandomBytes = (count) => Crypto.getRandomBytes(count);

export const pinCrypto: PinCrypto = {
  sha256Hex: (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, { encoding: Crypto.CryptoEncoding.HEX }),
  randomHex: (bytes) => Array.from(Crypto.getRandomBytes(bytes), (b) => b.toString(16).padStart(2, '0')).join(''),
};

export const secureKeyValue: KeyValueStore = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  delete: (key) => SecureStore.deleteItemAsync(key),
};
