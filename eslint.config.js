// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      // Apostrophes inside React Native <Text> are plain text, not HTML entities.
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*'],
  },
]);
