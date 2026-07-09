import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindById: vi.fn(),
  userCountDocuments: vi.fn(),
  userDeleteOne: vi.fn(),
  siteFind: vi.fn(),
  siteFindById: vi.fn(),
  membershipFind: vi.fn(),
  membershipCountDocuments: vi.fn(),
  membershipDeleteMany: vi.fn(),
  tokenDeleteMany: vi.fn(),
  apiKeyUpdateMany: vi.fn(),
}));

vi.mock('../db/models/User.js', () => ({
  UserModel: {
    findById: mocks.userFindById,
    countDocuments: mocks.userCountDocuments,
    deleteOne: mocks.userDeleteOne,
  },
}));

vi.mock('../db/models/Site.js', () => ({
  SiteModel: {
    find: mocks.siteFind,
    findById: mocks.siteFindById,
  },
}));

vi.mock('../db/models/Membership.js', () => ({
  MembershipModel: {
    find: mocks.membershipFind,
    countDocuments: mocks.membershipCountDocuments,
    deleteMany: mocks.membershipDeleteMany,
  },
}));

vi.mock('../db/models/AuthEmailToken.js', () => ({
  AuthEmailTokenModel: {
    deleteMany: mocks.tokenDeleteMany,
  },
}));

vi.mock('../db/models/ApiKey.js', () => ({
  ApiKeyModel: {
    updateMany: mocks.apiKeyUpdateMany,
  },
}));

function leanResult<T>(value: T) {
  return { lean: () => Promise.resolve(value), select: () => leanResult(value) };
}

describe('deleteGlobalUserAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.siteFind.mockReturnValue(leanResult([]));
    mocks.membershipFind.mockReturnValue(leanResult([]));
    mocks.userCountDocuments.mockResolvedValue(0);
    mocks.membershipCountDocuments.mockResolvedValue(0);
    mocks.membershipDeleteMany.mockResolvedValue({});
    mocks.tokenDeleteMany.mockResolvedValue({});
    mocks.apiKeyUpdateMany.mockResolvedValue({});
    mocks.userDeleteOne.mockResolvedValue({});
  });

  it('blocks deleting your own account', async () => {
    const { deleteGlobalUserAccount } = await import('../auth/delete-user.js');
    await expect(deleteGlobalUserAccount('user-1', 'user-1')).rejects.toThrow(/cannot delete your own account/i);
  });

  it('blocks deleting the only platform administrator', async () => {
    mocks.userFindById.mockReturnValue(leanResult({ _id: 'admin-1', isAdmin: true }));
    mocks.userCountDocuments.mockResolvedValue(1);

    const { deleteGlobalUserAccount } = await import('../auth/delete-user.js');
    await expect(deleteGlobalUserAccount('actor-1', 'admin-1')).rejects.toThrow(/only platform administrator/i);
  });

  it('deletes memberships, tokens, and the user when allowed', async () => {
    mocks.userFindById.mockReturnValue(leanResult({ _id: 'user-2', isAdmin: false }));

    const { deleteGlobalUserAccount } = await import('../auth/delete-user.js');
    await deleteGlobalUserAccount('actor-1', 'user-2');

    expect(mocks.membershipDeleteMany).toHaveBeenCalledWith({ userId: 'user-2' });
    expect(mocks.tokenDeleteMany).toHaveBeenCalledWith({ userId: 'user-2' });
    expect(mocks.apiKeyUpdateMany).toHaveBeenCalled();
    expect(mocks.userDeleteOne).toHaveBeenCalledWith({ _id: 'user-2' });
  });
});
