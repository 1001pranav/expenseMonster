import { Directory, File, Paths } from 'expo-file-system';
import { uuidv7 } from '@/domain/ids';

/** Captured screenshots / bill photos live in the app's private document directory, never in shared storage. */
function attachmentsDir(): Directory {
  const dir = new Directory(Paths.document, 'attachments');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

export async function saveAttachment(sourceUri: string): Promise<string> {
  const src = new File(sourceUri);
  const ext = (src.extension || '.jpg').toLowerCase();
  const dest = new File(attachmentsDir(), `${uuidv7()}${ext}`);
  await src.copy(dest);
  return dest.uri;
}

export function deleteAttachment(uri: string | null | undefined) {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}

export function wipeAttachments() {
  const dir = new Directory(Paths.document, 'attachments');
  if (dir.exists) dir.delete();
}

/** Write text to a cache file (for sharing exports) and return it. */
export function writeCacheFile(name: string, content: string): File {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  f.write(content);
  return f;
}

export const readText = (uri: string) => new File(uri).text();
