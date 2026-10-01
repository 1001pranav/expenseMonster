import { NativeModules } from 'react-native';
import type { TextRecognitionResult } from '@react-native-ml-kit/text-recognition';

/**
 * On-device OCR via Google ML Kit (the bundled model ships inside the APK, so this works offline).
 * Lines are rebuilt top-to-bottom, left-to-right so labels and their values stay adjacent.
 */
export async function recognizeText(uri: string): Promise<string> {
  if (!NativeModules.TextRecognition) {
    throw new Error('Text recognition needs a development build (it is not available in Expo Go).');
  }
  const { default: TextRecognition } = await import('@react-native-ml-kit/text-recognition');
  const result: TextRecognitionResult = await TextRecognition.recognize(uri);
  const lines = result.blocks.flatMap((b) => b.lines);
  if (!lines.every((l) => l.frame)) return result.text;
  return lines
    .slice()
    .sort((a, b) => {
      const dy = a.frame!.top - b.frame!.top;
      return Math.abs(dy) < Math.min(a.frame!.height, b.frame!.height) / 2 ? a.frame!.left - b.frame!.left : dy;
    })
    .map((l) => l.text)
    .join('\n');
}
