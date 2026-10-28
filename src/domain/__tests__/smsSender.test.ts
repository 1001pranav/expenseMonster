import { allowedSenders, findSender, normalizeSender } from '../smsSender';
import type { SmsSender } from '../types';

const row = (sender: string, kind: SmsSender['kind'] = 'bank'): SmsSender => ({
  id: sender,
  sender,
  name: null,
  kind,
  accountId: null,
  cardId: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  deviceId: 'd',
  scope: 'household',
});

describe('SMS senders', () => {
  it('spells one sender one way', () => {
    expect(normalizeSender('VM-HDFCBK')).toBe('HDFCBK');
    expect(normalizeSender('AD-HDFCBK-S')).toBe('HDFCBK');
    expect(normalizeSender(' hdfcbk ')).toBe('HDFCBK');
    expect(normalizeSender('+91 98765 43210')).toBe('9876543210');
    expect(normalizeSender('09876543210')).toBe('9876543210');
    expect(normalizeSender('')).toBe('');
    expect(normalizeSender(null)).toBe('');
  });

  it('finds the mark for any spelling and lists bank senders for the importer', () => {
    const senders = [row('HDFCBK'), row('9876543210'), row('SPAMMY', 'blocked')];
    expect(findSender(senders, 'JD-HDFCBK-T')?.id).toBe('HDFCBK');
    expect(findSender(senders, '+919876543210')?.id).toBe('9876543210');
    expect(findSender(senders, 'VM-SBIUPI')).toBeUndefined();
    expect(findSender(senders, '')).toBeUndefined();
    expect(allowedSenders(senders)).toEqual(['HDFCBK', '9876543210']);
  });
});
