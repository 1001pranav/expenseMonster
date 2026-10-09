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

/**
 * Copy an incoming image to its own cache file. The share library names its copy after the sender's
 * file name, so a second screenshot from the same app overwrites the first at the same path.
 */
export async function stageImage(sourceUri: string): Promise<string> {
  try {
    const src = new File(sourceUri);
    const dest = new File(Paths.cache, `scan-${uuidv7()}${(src.extension || '.jpg').toLowerCase()}`);
    await src.copy(dest);
    return dest.uri;
  } catch (e) {
    // console.warn lands in the error log (diagnostics.ts imports this file, so no direct import).
    console.warn('files: could not copy shared image, using the original', e);
    return sourceUri;
  }
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
