/**
 * A screenshot capture keeps what OCR read (services/capture.ts), so its form can show it even when
 * reached by "Approve & next" rather than straight from a scan.
 */
import { DEFAULT_SETTINGS, EMPTY_TABLES, getState } from '@/db/store';

let mockN = 0;
const mockTexts: Record<string, unknown>[] = [];
const mockGpay = ['To Swiggy', 'swiggy.stores@axb', '₹249', 'Completed', '12 Sep 2026, 10:32 pm', 'UPI transaction ID', '425612345678', 'Powered by UPI | Google Pay'].join('\n');
jest.mock('@/db/repo', () => {
  const { getState: state } = jest.requireActual('@/db/store');
  const put = (table: string, row: Record<string, unknown>) => {
    state().putRow(table, row);
    return row;
  };
  return {
    insert: async (table: string, data: Record<string, unknown>) =>
      put(table, { scope: 'household', ...data, id: data.id ?? `${table}-${++mockN}`, createdAt: '2026-10-01T00:00:00Z', updatedAt: String(++mockN), deletedAt: null, deviceId: 'me' }),
    update: async () => undefined,
    findById: (table: string, id: string) => (state().tables[table] as { id: string }[]).find((r) => r.id === id),
    insertMany: async () => [],
    saveCaptureText: async (t: Record<string, unknown>) => void mockTexts.push(t),
  };
});
jest.mock('../files', () => ({ saveAttachment: async () => 'file://shot.jpg' }));
jest.mock('../ocr', () => ({ recognizeText: async () => ({ text: mockGpay, prominent: ['₹249'] }) }));
jest.mock('../diagnostics', () => ({ logFailure: () => undefined, logInfo: () => undefined }));

/* eslint-disable import/first */
import { captureImage } from '../capture';
/* eslint-enable import/first */

beforeEach(() => {
  mockTexts.length = 0;
  getState().setAll(
    { ...EMPTY_TABLES },
    { deviceId: 'me', deviceName: 'Me', householdId: 'h', householdName: 'Home', selfMemberId: '', onboarded: true },
    DEFAULT_SETTINGS,
  );
});

describe('screenshot capture text', () => {
  it('keeps what was read, with no sender or time', async () => {
    const r = await captureImage('file://in.jpg');
    expect(r.transactionId).toBeTruthy();
    expect(mockTexts).toEqual([{ txnId: r.transactionId, sender: null, body: mockGpay, receivedAt: null }]);
  });

  it('keeps nothing for the same screenshot shared twice', async () => {
    await captureImage('file://in.jpg');
    mockTexts.length = 0;
    const again = await captureImage('file://in.jpg');
    expect(again.transactionId).toBeNull();
    expect(mockTexts).toEqual([]);
  });
});
