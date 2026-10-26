import { requireOptionalNativeModule } from 'expo';

/** Native side: modules/cas-pdf/android (PDFBox). Absent in Expo Go and on builds made before it was added. */
interface CasPdfNative {
  readWords(uri: string, password: string): Promise<string>;
}

const native = requireOptionalNativeModule<CasPdfNative>('CasPdf');

/** A word of the PDF: page (1-based), x, y (points from the top-left), width, font size, text. */
export type Word = [page: number, x: number, y: number, width: number, size: number, text: string];

export const casPdfAvailable = () => Boolean(native);

export class CasPdfError extends Error {
  constructor(
    readonly code: 'UNAVAILABLE' | 'PASSWORD_REQUIRED' | 'INCORRECT_PASSWORD' | 'UNREADABLE',
    message: string,
  ) {
    super(message);
  }
}

/** Every word of the PDF with its position. The password is used for this call only, never stored. */
export async function readPdfWords(uri: string, password: string): Promise<Word[]> {
  if (!native) throw new CasPdfError('UNAVAILABLE', 'Reading statements needs the latest version of the app (it was added after this build).');
  try {
    return JSON.parse(await native.readWords(uri, password)) as Word[];
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'PASSWORD_REQUIRED' || code === 'INCORRECT_PASSWORD') {
      throw new CasPdfError(code, code === 'PASSWORD_REQUIRED' ? 'This statement is protected: enter its password.' : "That password doesn't open this statement. CDSL and NSDL use your PAN in capitals.");
    }
    throw new CasPdfError('UNREADABLE', "This file couldn't be read as a PDF.");
  }
}
