/**
 * Round 52e — services/users.lookupUsersByPhones tests.
 *
 * Covers: empty input shortcut, de-duping, chunking at 200, network
 * error swallowed without throwing.
 */
import { lookupUsersByPhones } from '../services/users';

jest.mock('../utils/api', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));
import api from '../utils/api';

const mockPost = (api as any).post as jest.Mock;

beforeEach(() => mockPost.mockReset());

describe('lookupUsersByPhones', () => {
  it('returns [] without hitting the API for empty input', async () => {
    const r = await lookupUsersByPhones([]);
    expect(r).toEqual([]);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('de-dupes input phones before POST', async () => {
    mockPost.mockResolvedValueOnce({ data: { matches: [] } });
    await lookupUsersByPhones(['9000000001', '9000000001', '9000000002']);
    expect(mockPost).toHaveBeenCalledTimes(1);
    const sent = mockPost.mock.calls[0][1].phones;
    expect(sent).toHaveLength(2);
    expect(new Set(sent)).toEqual(new Set(['9000000001', '9000000002']));
  });

  it('chunks oversized batches at 100 per request', async () => {
    // Service uses 100/chunk to match the backend's server-side cap;
    // 350 phones → 4 chunks (100, 100, 100, 50).
    const phones = Array.from({ length: 350 }, (_, i) => String(9000000000 + i));
    mockPost
      .mockResolvedValueOnce({ data: { matches: [{ phone: phones[0], user_id: 'u1', name: 'a' }] } })
      .mockResolvedValueOnce({ data: { matches: [{ phone: phones[100], user_id: 'u2', name: 'b' }] } })
      .mockResolvedValueOnce({ data: { matches: [] } })
      .mockResolvedValueOnce({ data: { matches: [] } });
    const r = await lookupUsersByPhones(phones);
    expect(mockPost).toHaveBeenCalledTimes(4);
    expect(mockPost.mock.calls[0][1].phones).toHaveLength(100);
    expect(mockPost.mock.calls[1][1].phones).toHaveLength(100);
    expect(mockPost.mock.calls[2][1].phones).toHaveLength(100);
    expect(mockPost.mock.calls[3][1].phones).toHaveLength(50);
    expect(r).toHaveLength(2);
    expect(r.map(m => m.user_id).sort()).toEqual(['u1', 'u2']);
  });

  it('swallows per-chunk failures silently and keeps other chunks\' matches', async () => {
    const phones = Array.from({ length: 250 }, (_, i) => String(9100000000 + i));
    mockPost
      .mockRejectedValueOnce(new Error('500'))
      .mockResolvedValueOnce({ data: { matches: [{ phone: phones[200], user_id: 'survived', name: 'x' }] } });
    const r = await lookupUsersByPhones(phones);
    expect(r).toEqual([{ phone: phones[200], user_id: 'survived', name: 'x' }]);
  });

  it('skips falsy phone entries before sending', async () => {
    mockPost.mockResolvedValueOnce({ data: { matches: [] } });
    await lookupUsersByPhones(['', '9123456780' as any, null as any, undefined as any]);
    expect(mockPost.mock.calls[0][1].phones).toEqual(['9123456780']);
  });

  it('returns [] when the server response shape is missing matches[]', async () => {
    mockPost.mockResolvedValueOnce({ data: {} });
    const r = await lookupUsersByPhones(['9000000099']);
    expect(r).toEqual([]);
  });
});
