import { applyRules, describeRule, ruleMatches } from '../rules';
import { rule } from './fixtures';

const targets = { categoryIds: new Set(['food', 'shopping', 'fuel']), cardIds: new Set(['hdfc']), accountIds: new Set(['sbi']) };
const names = { category: (id: string) => ({ food: 'Food', shopping: 'Shopping' })[id], card: (id: string) => (id === 'hdfc' ? 'HDFC Millennia' : undefined), account: () => 'SBI' };

describe('capture rules', () => {
  const cardRule = rule({ pattern: 'credit card', field: 'text', source: 'ocr', categoryId: '', method: 'card', cardId: 'hdfc', learned: 0 });

  it('a screenshot that mentions a credit card is marked as paid with that card', () => {
    const out = applyRules([cardRule], { payee: 'Croma', vpa: null, text: 'Paid using HDFC Credit Card XX1234', source: 'ocr' }, targets);
    expect(out).toMatchObject({ method: 'card', cardId: 'hdfc', ruleIds: [cardRule.id] });
    expect(out.categoryId).toBeUndefined();
  });

  it('only looks where and in what it was told to', () => {
    expect(ruleMatches(cardRule, { payee: 'Croma', vpa: null, text: 'credit card', source: 'sms' })).toBe(false);
    expect(ruleMatches(rule({ pattern: 'credit card' }), { payee: 'Croma', vpa: null, text: 'credit card', source: 'ocr' })).toBe(false);
    expect(ruleMatches(rule({ pattern: 'swiggy' }), { payee: null, vpa: 'swiggy.stores@axb', source: 'manual' })).toBe(true);
  });

  it('your rules win over learned ones, and each field is set by the first rule that sets it', () => {
    const learned = rule({ pattern: 'amazon', categoryId: 'shopping' });
    const mine = rule({ pattern: 'amazon pay', categoryId: 'fuel', rename: 'Amazon', learned: 0 });
    const out = applyRules([learned, mine], { payee: 'AMAZON PAY INDIA', vpa: null, source: 'sms' }, targets);
    expect(out).toMatchObject({ categoryId: 'fuel', payee: 'Amazon', ruleIds: [mine.id] });
  });

  it('learned rules only ever set the category', () => {
    const out = applyRules([rule({ pattern: 'swiggy', method: 'cash', rename: 'X' })], { payee: 'Swiggy', vpa: null, source: 'manual' }, targets);
    expect(out).toEqual({ categoryId: 'food', ruleIds: [expect.any(String)] });
  });

  it('ignores a rule whose card or category was deleted', () => {
    const out = applyRules([rule({ pattern: 'swiggy', categoryId: 'gone', method: 'card', cardId: 'old', learned: 0 })], { payee: 'Swiggy', vpa: null, source: 'manual' }, targets);
    expect(out).toEqual({ ruleIds: [] });
  });

  it('rows synced from an older phone (no new columns) behave as learned payee rules', () => {
    const old = { ...rule(), field: undefined, source: undefined, learned: undefined } as unknown as Parameters<typeof ruleMatches>[0];
    expect(applyRules([old], { payee: 'Swiggy', vpa: null, source: 'ocr' }, targets).categoryId).toBe('food');
  });

  it('reads as a sentence', () => {
    expect(describeRule(cardRule, names)).toEqual({ when: 'When a screenshot mentions “credit card”', then: ['Paid with HDFC Millennia'] });
    expect(describeRule(rule({ pattern: 'swiggy' }), names)).toEqual({ when: 'When the payee contains “swiggy”', then: ['File under Food'] });
  });
});
