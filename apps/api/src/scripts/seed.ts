import { ensureBootstrapAdmin } from '../config/bootstrap.js';
import { env } from '../config/env.js';
import { connectDb } from '../db/mongoose.js';

await connectDb();
await ensureBootstrapAdmin();
if (env.bootstrapAdminEmail) {
  console.log(
    `Bootstrap admin ensured for ${env.bootstrapAdminEmail}. Sign in with a blank password once, then set your password.`,
  );
} else {
  console.log('BOOTSTRAP_ADMIN_EMAIL is not set; nothing to seed.');
}
process.exit(0);
