import { MIGRATIONS, columnsOf } from '../schema';

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

  it('only ever appends migrations', () => {
    expect(MIGRATIONS).toHaveLength(15);
  });
});
