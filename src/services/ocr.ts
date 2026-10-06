import { NativeModules } from 'react-native';
import type { TextRecognitionResult } from '@react-native-ml-kit/text-recognition';

export interface RecognizedText {
  text: string;
  /** Lines set in the largest type, biggest first (the amount on a UPI success screen). */
  prominent: string[];
}

/**
 * On-device OCR via Google ML Kit (the bundled model ships inside the APK, so this works offline).
 * Lines are rebuilt top-to-bottom, left-to-right so labels and their values stay adjacent.
 */
export async function recognizeText(uri: string): Promise<RecognizedText> {
  if (!NativeModules.TextRecognition) {
    throw new Error('Text recognition needs a development build (it is not available in Expo Go).');
  }
  const { default: TextRecognition } = await import('@react-native-ml-kit/text-recognition');
  const result: TextRecognitionResult = await TextRecognition.recognize(uri);
  const lines = result.blocks.flatMap((b) => b.lines);
  if (!lines.every((l) => l.frame)) return { text: result.text, prominent: [] };
  const text = lines
    .slice()
    .sort((a, b) => {
      const dy = a.frame!.top - b.frame!.top;
      return Math.abs(dy) < Math.min(a.frame!.height, b.frame!.height) / 2 ? a.frame!.left - b.frame!.left : dy;
    })
    .map((l) => l.text)
    .join('\n');
  const heights = lines.map((l) => l.frame!.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] ?? 0;
  const prominent = lines
    .filter((l) => l.frame!.height >= median * 1.4)
    .sort((a, b) => b.frame!.height - a.frame!.height)
    .slice(0, 4)
    .map((l) => l.text);
  return { text, prominent };
}
