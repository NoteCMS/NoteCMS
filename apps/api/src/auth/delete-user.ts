import { ApiKeyModel } from '../db/models/ApiKey.js';
import { AuthEmailTokenModel } from '../db/models/AuthEmailToken.js';
import { MembershipModel } from '../db/models/Membership.js';
import { SiteModel } from '../db/models/Site.js';
import { UserModel } from '../db/models/User.js';

export async function deleteGlobalUserAccount(actorUserId: string, targetUserId: string): Promise<void> {
  if (actorUserId === targetUserId) {
    throw new Error('You cannot delete your own account');
  }

  const target = await UserModel.findById(targetUserId).lean();
  if (!target) throw new Error('User not found');

  if (target.isAdmin) {
    const adminCount = await UserModel.countDocuments({ isAdmin: true });
    if (adminCount <= 1) {
      throw new Error('This is the only platform administrator. Assign another admin first.');
    }
  }

  const ownedSites = await SiteModel.find({ ownerId: targetUserId }).select({ name: 1 }).lean();
  if (ownedSites.length > 0) {
    const names = ownedSites.map((site) => site.name).join(', ');
    throw new Error(
      `This user is the registered owner of ${names}. Transfer site ownership before deleting their account.`,
    );
  }

  const ownerMemberships = await MembershipModel.find({ userId: targetUserId, role: 'owner' }).lean();
  for (const membership of ownerMemberships) {
    const ownerCount = await MembershipModel.countDocuments({ siteId: membership.siteId, role: 'owner' });
    if (ownerCount <= 1) {
      const site = await SiteModel.findById(membership.siteId).select({ name: 1 }).lean();
      const siteName = site?.name ?? 'a workspace';
      throw new Error(`This user is the only owner of ${siteName}. Assign another owner before deleting their account.`);
    }
  }

  await MembershipModel.deleteMany({ userId: targetUserId });
  await AuthEmailTokenModel.deleteMany({ userId: targetUserId });
  await ApiKeyModel.updateMany(
    { actingUserId: targetUserId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  await UserModel.deleteOne({ _id: targetUserId });
}
