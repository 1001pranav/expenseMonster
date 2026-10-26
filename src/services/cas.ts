import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import { anonymise, parseCas, type CasStatement, type Word } from '@/domain/cas';
import { readPdfWords } from '../../modules/cas-pdf';
import { logInfo } from './diagnostics';
import { writeCacheFile } from './files';

/**
 * Reading a consolidated account statement on the phone (domain/cas.ts). The picked file's copy is
 * deleted once read, and the password (the PAN) is used only for this read: neither is kept.
 */
export async function readStatement(uri: string, password: string): Promise<{ statement: CasStatement; words: Word[] }> {
  const words = await readPdfWords(uri, password.trim().toUpperCase());
  const statement = parseCas(words);
  logInfo(`cas: ${statement.depository ?? 'unknown'} statement, ${statement.rows.length} rows read, ${statement.unreadable} unreadable`);
  return { statement, words };
}

/** Forget the picked copy of the statement (after it was read; a wrong password is retried with the same copy). */
export function discardStatement(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Not a file this app owns (a content:// URI): nothing to delete.
  }
}

/** Share an anonymised copy of the statement's layout (domain/cas.ts anonymise) for improving the reader. */
export async function shareAnonymised(words: Word[]): Promise<void> {
  const file = writeCacheFile('statement-layout-anonymised.json', JSON.stringify({ v: 1, words: anonymise(words) }));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Anonymised statement layout' });
}
