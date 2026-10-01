import { getRandomValues } from 'expo-crypto';

// Hermes has no WebCrypto; ids, keys and nonces need a CSPRNG.
const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (!g.crypto) g.crypto = {};
if (!g.crypto.getRandomValues) g.crypto.getRandomValues = getRandomValues;
