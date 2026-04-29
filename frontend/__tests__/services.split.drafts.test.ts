/**
 * Round 52e — services/split draft-helper tests.
 *
 * Mocks utils/api so we can assert the exact request bodies without
 * hitting the live backend.
 */
import { createDraftExpense, fetchDraftExpenses, deleteDraftExpense, attachDraftToGroup } from '../services/split';

jest.mock('../utils/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock('../utils/cacheGraph', () => ({
  invalidateAfter: jest.fn(),
}));
import api from '../utils/api';

const g = (api as any).get as jest.Mock;
const p = (api as any).post as jest.Mock;
const d = (api as any).delete as jest.Mock;

beforeEach(() => { g.mockReset(); p.mockReset(); d.mockReset(); });

describe('createDraftExpense', () => {
  it('POSTs to /split/expenses/draft and returns response data', async () => {
    p.mockResolvedValueOnce({ data: { id: 'd1', amount: 100 } });
    const r = await createDraftExpense({ description: 'x', amount: 100 });
    expect(p).toHaveBeenCalledWith('/split/expenses/draft', { description: 'x', amount: 100 });
    expect(r).toEqual({ id: 'd1', amount: 100 });
  });
});

describe('fetchDraftExpenses', () => {
  it('GETs /split/expenses/drafts and returns body', async () => {
    g.mockResolvedValueOnce({ data: { drafts: [], count: 0 } });
    const r = await fetchDraftExpenses();
    expect(g).toHaveBeenCalledWith('/split/expenses/drafts');
    expect(r).toEqual({ drafts: [], count: 0 });
  });
});

describe('deleteDraftExpense', () => {
  it('DELETEs the right path', async () => {
    d.mockResolvedValueOnce({ data: { deleted: true } });
    await deleteDraftExpense('abc');
    expect(d).toHaveBeenCalledWith('/split/expenses/drafts/abc');
  });
});

describe('attachDraftToGroup', () => {
  it('POSTs the attach endpoint with the group id in body', async () => {
    p.mockResolvedValueOnce({ data: { ok: true } });
    await attachDraftToGroup('d1', 'g1');
    expect(p).toHaveBeenCalledWith('/split/expenses/d1/attach-to-group', { group_id: 'g1' });
  });
});
