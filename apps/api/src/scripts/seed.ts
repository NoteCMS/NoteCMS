import { connectDb } from '../db/mongoose.js';
import { UserModel } from '../db/models/User.js';
import { SiteModel } from '../db/models/Site.js';
import { MembershipModel } from '../db/models/Membership.js';
import { ContentTypeModel } from '../db/models/ContentType.js';
import { hashPassword } from '../auth/security.js';

await connectDb();

const email = 'owner@note.local';
let user = await UserModel.findOne({ email });
if (!user) {
  user = await UserModel.create({ email, passwordHash: await hashPassword('password123'), isAdmin: true });
} else if (!user.isAdmin) {
  user = await UserModel.findByIdAndUpdate(user._id, { isAdmin: true }, { new: true });
}
if (!user) throw new Error('Failed to initialize seed owner user');

let site = await SiteModel.findOne({ url: 'demo.local' });
if (!site) {
  site = await SiteModel.create({ name: 'Demo Site', url: 'demo.local', ownerId: user._id });
}

await MembershipModel.findOneAndUpdate(
  { userId: user._id, siteId: site._id },
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

console.log('Seed complete: owner@note.local / password123');
process.exit(0);
