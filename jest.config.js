/** Domain logic is pure TypeScript, so it runs under the lightweight node preset. */
module.exports = {
  preset: 'jest-expo/node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@noble/.*|fflate)',
  ],
};
