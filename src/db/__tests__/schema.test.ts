import { MIGRATIONS, columnsOf } from '../schema';

describe('schema migrations', () => {
  it('creates loans in v1 without the card-EMI columns, so v4 can add them on every install', () => {
    const v1Loans = MIGRATIONS[0].split('\n').find((l) => l.startsWith('CREATE TABLE IF NOT EXISTS "loans"'))!;
    for (const col of ['cardId', 'sourceTxnId', 'processingFee']) {
      expect(v1Loans).not.toContain(`"${col}"`);
      expect(MIGRATIONS[3]).toContain(`ADD COLUMN "${col}"`);
      expect(columnsOf('loans')).toContain(col);
    }
  });

  it('only ever appends migrations', () => {
    expect(MIGRATIONS).toHaveLength(4);
  });
});
