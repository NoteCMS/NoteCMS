import { consumeEmailToken, invalidateTokensForUser } from './email-tokens.js';
import type { EmailTokenPurpose } from '../db/models/AuthEmailToken.js';
import { UserModel } from '../db/models/User.js';
import { assertStrongPassword } from './password-policy.js';
import { hashPassword, signToken } from './security.js';

function toId<T extends { _id: unknown }>(doc: T) {
  return { ...doc, id: String(doc._id) };
}

export async function completePasswordWithEmailToken(
  rawToken: string,
  newPassword: string,
  purpose: EmailTokenPurpose,
) {
  const { userId } = await consumeEmailToken(rawToken, purpose);
  assertStrongPassword(newPassword);
  const user = await UserModel.findById(userId).lean();
  if (!user) throw new Error('User not found');
  if (user.status !== 'active') throw new Error('This account is not active');

  const updated = await UserModel.findByIdAndUpdate(
    userId,
    { passwordHash: await hashPassword(newPassword) },
    { new: true },
  );
  if (!updated) throw new Error('User not found');

  await invalidateTokensForUser(userId);
  return { token: signToken({ userId }), user: toId(updated.toObject()) };
}
