import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { gqlRequest } from '@/api/graphql';
import { LoadErrorAlert } from '@/components/load-error-alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Item, ItemContent, ItemGroup } from '@/components/ui/item';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { buildPageTitle, useDocumentTitle } from '@/lib/page-title';
import type { Site } from '@/types/app';

type AccountSettingsPageProps = {
  token: string;
  userEmail: string;
  userDisplayName: string | null;
  sites: Site[];
  workspaceSiteId: string;
  onProfileUpdated: () => Promise<void>;
};

function AccountPasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  visible,
  onToggleVisible,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  visible: boolean;
  onToggleVisible: () => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <InputGroup className="min-w-0">
          <InputGroupInput
            id={id}
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={autoComplete}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onToggleVisible}
              aria-label={visible ? 'Hide password' : 'Show password'}
            >
              {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </FieldContent>
    </Field>
  );
}

export function AccountSettingsPage({
  token,
  userEmail,
  userDisplayName,
  sites,
  workspaceSiteId,
  onProfileUpdated,
}: AccountSettingsPageProps) {
  const activeSite = sites.find((site) => site.id === workspaceSiteId);
  useDocumentTitle(buildPageTitle('Your account', activeSite?.name?.trim() || 'Workspace'));

  const [displayNameDraft, setDisplayNameDraft] = useState(userDisplayName ?? '');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    setDisplayNameDraft(userDisplayName ?? '');
  }, [userDisplayName]);

  async function onSaveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileError('');
    setProfileMessage('');
    setProfileSaving(true);
    try {
      await gqlRequest<{ updateMyProfile: { displayName: string | null } }>(
        token,
        'mutation($displayName:String!){ updateMyProfile(displayName:$displayName){ id displayName } }',
        { displayName: displayNameDraft.trim() },
      );
      setProfileMessage('Saved.');
      await onProfileUpdated();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Couldn't save that—try again.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    if (newPassword !== confirmPassword) {
      setPasswordError("The two new passwords don't match.");
      return;
    }
    setPasswordSaving(true);
    try {
      await gqlRequest<{ changeMyPassword: boolean }>(
        token,
        'mutation($c:String!,$n:String!){ changeMyPassword(currentPassword:$c,newPassword:$n) }',
        { c: currentPassword, n: newPassword },
      );
      setPasswordMessage('Your password is updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Couldn't update that—try again.");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="grid w-full gap-4 lg:grid-cols-2 lg:items-start">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>This is how you’ll show up in the app.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSaveProfile} className="space-y-4">
              {profileError ? <LoadErrorAlert message={profileError} compact /> : null}
              {profileMessage ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {profileMessage}
                </p>
              ) : null}
              <ItemGroup className="gap-3">
                <Item variant="muted" className="w-full flex-col items-stretch gap-4">
                  <ItemContent className="w-full gap-4">
                    <div className="flex flex-col gap-6">
                      <Field>
                        <FieldLabel htmlFor="account-email">Email</FieldLabel>
                        <FieldContent>
                          <Input id="account-email" value={userEmail} disabled className="bg-muted/50" />
                          <FieldDescription>To change your email, ask whoever runs your workspace.</FieldDescription>
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="account-display-name">Name</FieldLabel>
                        <FieldContent>
                          <Input
                            id="account-display-name"
                            value={displayNameDraft}
                            onChange={(e) => setDisplayNameDraft(e.target.value)}
                            placeholder="Your name"
                            maxLength={80}
                            autoComplete="name"
                          />
                          <FieldDescription>Leave empty and we’ll use your email.</FieldDescription>
                        </FieldContent>
                      </Field>
                    </div>
                  </ItemContent>
                </Item>
              </ItemGroup>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="submit" disabled={profileSaving}>
                  {profileSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Something you’ll remember, with letters and numbers.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onChangePassword} className="space-y-4">
              {passwordError ? <LoadErrorAlert message={passwordError} compact /> : null}
              {passwordMessage ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {passwordMessage}
                </p>
              ) : null}
              <ItemGroup className="gap-3">
                <Item variant="muted" className="w-full flex-col items-stretch gap-4">
                  <ItemContent className="w-full gap-4">
                    <AccountPasswordField
                      id="account-current-password"
                      label="Current password"
                      value={currentPassword}
                      onChange={setCurrentPassword}
                      autoComplete="current-password"
                      visible={showCurrentPassword}
                      onToggleVisible={() => setShowCurrentPassword((v) => !v)}
                    />
                    <AccountPasswordField
                      id="account-new-password"
                      label="New password"
                      value={newPassword}
                      onChange={setNewPassword}
                      autoComplete="new-password"
                      visible={showNewPassword}
                      onToggleVisible={() => setShowNewPassword((v) => !v)}
                    />
                    <AccountPasswordField
                      id="account-confirm-password"
                      label="Same password again"
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      autoComplete="new-password"
                      visible={showConfirmPassword}
                      onToggleVisible={() => setShowConfirmPassword((v) => !v)}
                    />
                  </ItemContent>
                </Item>
              </ItemGroup>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="submit" disabled={passwordSaving}>
                  {passwordSaving ? 'Updating…' : 'Change password'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
