import { defaultOf, MIGRATIONS, columnsOf } from '../schema';

describe('schema migrations', () => {
  it('creates loans in v1 without the card-EMI columns, so v12 can add them on every install', () => {
    const v1Loans = MIGRATIONS[0].split('\n').find((l) => l.startsWith('CREATE TABLE IF NOT EXISTS "loans"'))!;
    for (const col of ['cardId', 'sourceTxnId', 'processingFee']) {
      expect(v1Loans).not.toContain(`"${col}"`);
      expect(MIGRATIONS[11]).toContain(`ADD COLUMN "${col}"`);
      expect(columnsOf('loans')).toContain(col);
    }
  });

  it('adds rule conditions in v13, with existing rules marked learned', () => {
    const v1Rules = MIGRATIONS[0].split('\n').find((l) => l.startsWith('CREATE TABLE IF NOT EXISTS "rules"'))!;
    expect(v1Rules).not.toContain('"learned"');
    expect(MIGRATIONS[12]).toContain('ALTER TABLE "rules" ADD COLUMN "learned" INTEGER NOT NULL DEFAULT 1;');
    expect(MIGRATIONS[12]).toContain(`ADD COLUMN "field" TEXT NOT NULL DEFAULT 'payee';`);
  });

  it('adds hidden categories as a column with a default, never in the v1 table', () => {
    expect(MIGRATIONS[15]).toBe('ALTER TABLE "categories" ADD COLUMN "hidden" INTEGER NOT NULL DEFAULT 0;');
    expect(MIGRATIONS[0]).not.toContain('"hidden"');
  });

  it('only ever appends migrations', () => {
    expect(MIGRATIONS).toHaveLength(16);
  });
});

describe('defaultOf', () => {
  it("gives a missing column its SQL default, so a row from an older app version can't fail a write", () => {
    expect(defaultOf('categories', 'hidden')).toBe(0);
    expect(defaultOf('rules', 'learned')).toBe(1);
    expect(defaultOf('rules', 'field')).toBe('payee');
    expect(defaultOf('categories', 'parentId')).toBeNull();
    expect(defaultOf('categories', 'scope')).toBe('personal');
  });
});
