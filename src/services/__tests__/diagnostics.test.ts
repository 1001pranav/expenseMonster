const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'doc' },
  File: class {
    key: string;
    constructor(...parts: string[]) {
      this.key = parts.join('/');
    }
    get exists() {
      return mockFiles.has(this.key);
    }
    create() {
      mockFiles.set(this.key, '');
    }
    write(s: string) {
      mockFiles.set(this.key, s);
    }
    textSync() {
      return mockFiles.get(this.key) ?? '';
    }
    delete() {
      mockFiles.delete(this.key);
    }
  },
}));
// The node preset rewrites react-native imports to react-native-web, which isn't installed.
jest.mock('react-native-web/dist/exports/Platform', () => ({ __esModule: true, default: { OS: 'android', Version: 34 } }), { virtual: true });
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-device', () => ({ manufacturer: 'Test', modelName: 'Phone' }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));
jest.mock('../files', () => ({ writeCacheFile: jest.fn(() => ({ uri: 'file://log.txt' })) }));

import { clearDiagnostics, diagnosticsText, installErrorCapture, logInfo, useDiagnostics } from '../diagnostics';

describe('diagnostics log', () => {
  const previousHandler = jest.fn();
  beforeAll(() => {
    (globalThis as any).ErrorUtils = { getGlobalHandler: () => previousHandler, setGlobalHandler: (h: any) => ((globalThis as any).__handler = h) };
    // Silence the originals: capture wraps whatever console.* is at install time.
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    installErrorCapture();
  });
  beforeEach(clearDiagnostics);

  it('records console errors and warnings, still printing them', () => {
    console.error(new Error('boom'));
    console.warn('careful', { a: 1 });
    const lines = useDiagnostics.getState().lines;
    expect(lines.some((l) => / ERROR Error: boom/.test(l))).toBe(true);
    expect(lines.some((l) => / WARN  careful \{"a":1\}/.test(l))).toBe(true);
  });

  it('records a crash and hands it on to the previous handler', () => {
    (globalThis as any).__handler(new TypeError('x is undefined'), true);
    expect(useDiagnostics.getState().lines.at(-1)).toMatch(/ERROR CRASH TypeError: x is undefined/);
    expect(previousHandler).toHaveBeenCalledWith(expect.any(TypeError), true);
  });

  it('persists to a file, keeps the newest 300 lines, and shares with a device header', () => {
    for (let i = 0; i < 310; i++) logInfo(`step ${i}`);
    const lines = useDiagnostics.getState().lines;
    expect(lines).toHaveLength(300);
    expect(lines.at(-1)).toMatch(/INFO  step 309$/);
    expect(mockFiles.get('doc/diagnostics.log')?.split('\n')).toHaveLength(300);
    expect(diagnosticsText()).toMatch(/^ExpenseMonster diagnostics\nApp 1\.0\.0 · Test Phone/);
  });
});
