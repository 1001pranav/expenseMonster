/**
 * SMS sender marks in capture (services/capture.ts): blocked senders are skipped, and a bank
 * sender's linked account / card is used only when the message doesn't name a saved one.
 */
import { DEFAULT_SETTINGS, EMPTY_TABLES, getState } from '@/db/store';
import type { Account, CreditCard, SmsSender } from '@/domain/types';

let mockN = 0;
const mockTexts: Record<string, unknown>[] = [];
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
jest.mock('../files', () => ({ saveAttachment: async () => null }));
jest.mock('../ocr', () => ({ recognizeText: async () => ({ text: '', prominent: [] }) }));
jest.mock('../diagnostics', () => ({ logFailure: () => undefined, logInfo: () => undefined }));

/* eslint-disable import/first */
import { captureText } from '../capture';
/* eslint-enable import/first */

const base = { createdAt: '', updatedAt: '', deletedAt: null, deviceId: 'me', scope: 'household' as const };
const savings = { ...base, id: 'acc-sav', name: 'Coop savings', last4: '4321' } as unknown as Account;
const other = { ...base, id: 'acc-other', name: 'Other', last4: '9999' } as unknown as Account;
const card = { ...base, id: 'card-coop', name: 'Coop card', last4: '6306', statementDay: 1 } as unknown as CreditCard;
const mark = (p: Partial<SmsSender>): SmsSender => ({ ...base, id: 's1', sender: '9876543210', name: null, kind: 'bank', accountId: null, cardId: null, ...p });

function setup(senders: SmsSender[]) {
  mockTexts.length = 0;
  getState().setAll(
    { ...EMPTY_TABLES, accounts: [savings, other], cards: [card], sms_senders: senders },
    { deviceId: 'me', deviceName: 'Me', householdId: 'h', householdName: 'Home', selfMemberId: '', onboarded: true },
    DEFAULT_SETTINGS,
  );
}
const added = () => getState().tables.transactions.at(-1)!;
// No account or card number in the message.
const bare = 'Rs.500.00 debited for UPI to SWIGGY on 12-10-26. Ref 425612345678';

describe('SMS sender marks', () => {
  it('skips a blocked sender', async () => {
    setup([mark({ kind: 'blocked' })]);
    const r = await captureText(bare, '+91 98765 43210');
    expect(r).toMatchObject({ recognised: false, skipped: 1, added: 0 });
    expect(mockTexts).toEqual([]);
  });

  it('keeps the SMS and its sender to show in Review', async () => {
    setup([]);
    const at = new Date('2026-10-12T09:30:00Z');
    const r = await captureText(bare, 'VM-HDFCBK', at);
    expect(mockTexts).toEqual([{ txnId: r.addedIds[0], sender: 'VM-HDFCBK', body: bare, receivedAt: at.toISOString() }]);
  });

  it('files a message without an account under the sender’s account', async () => {
    setup([mark({ accountId: 'acc-sav' })]);
    await captureText(bare, '9876543210');
    expect(added()).toMatchObject({ accountId: 'acc-sav', cardId: null });
  });

  it('lets an account named in the message win over the sender’s', async () => {
    setup([mark({ accountId: 'acc-sav' })]);
    await captureText('Rs.500.00 debited from A/c XX9999 for UPI to SWIGGY on 12-10-26. Ref 425612345679', '9876543210');
    expect(added()).toMatchObject({ accountId: 'acc-other' });
  });

  it('puts a sender linked only to a card on that card, paid by card', async () => {
    setup([mark({ cardId: 'card-coop' })]);
    await captureText(bare, '9876543210');
    expect(added()).toMatchObject({ cardId: 'card-coop', accountId: null, method: 'card' });
  });

  it('does not use the sender’s card for a message about an account', async () => {
    setup([mark({ cardId: 'card-coop' })]);
    await captureText('Rs.500.00 debited from A/c XX9999 for UPI to SWIGGY on 12-10-26. Ref 425612345670', '9876543210');
    expect(added()).toMatchObject({ cardId: null, accountId: 'acc-other' });
  });

  it('changes nothing for unmarked senders', async () => {
    setup([]);
    await captureText(bare, 'VM-SBIUPI');
    expect(added()).toMatchObject({ accountId: null, cardId: null, method: 'upi' });
  });
});
