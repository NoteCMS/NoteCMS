import type { Types } from 'mongoose';
import { ContentTypeModel } from '../db/models/ContentType.js';
import { MembershipModel } from '../db/models/Membership.js';
import { SiteModel } from '../db/models/Site.js';
import { UserModel } from '../db/models/User.js';
import { env } from './env.js';

/** Creates the admin user (no password until set via GraphQL) and demo site when BOOTSTRAP_ADMIN_EMAIL is set. Idempotent. */
export async function ensureBootstrapAdmin(): Promise<void> {
  const raw = env.bootstrapAdminEmail?.trim().toLowerCase();
  if (!raw) return;

  let user = await UserModel.findOne({ email: raw });
  if (!user) {
    user = await UserModel.create({
      email: raw,
      isAdmin: true,
    });
    await seedDemoWorkspace(user._id as Types.ObjectId);
    return;
  }

  if (!user.isAdmin) {
    await UserModel.findByIdAndUpdate(user._id, { isAdmin: true });
  }

  const site = await SiteModel.findOne({ url: 'demo.local' });
  if (!site) await seedDemoWorkspace(user._id as Types.ObjectId);
}

async function seedDemoWorkspace(ownerId: Types.ObjectId) {
  let site = await SiteModel.findOne({ url: 'demo.local' });
  if (!site) {
    site = await SiteModel.create({ name: 'Demo Site', url: 'demo.local', ownerId });
  }

  await MembershipModel.findOneAndUpdate(
    { userId: ownerId, siteId: site._id },
    { role: 'owner' },
    { upsert: true },
  );

  await ContentTypeModel.findOneAndUpdate(
    { siteId: site._id, slug: 'pages' },
    {
      name: 'Pages',
      fields: [
        { key: 'title', label: 'Title', type: 'text', required: true },
        { key: 'body', label: 'Body', type: 'textarea' },
        {
          key: 'sections',
          label: 'Sections',
          type: 'repeater',
          config: {
            fields: [
              { key: 'heading', label: 'Heading', type: 'text', required: true },
              { key: 'content', label: 'Content', type: 'textarea' },
            ],
          },
        },
      ],
    },
    { upsert: true },
  );
}
