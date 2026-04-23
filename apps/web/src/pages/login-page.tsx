import type { FormEvent } from 'react';
import { LoadErrorAlert } from '@/components/load-error-alert';
import { ModeToggle } from '@/components/mode-toggle';
import { buildPageTitle, useDocumentTitle } from '@/lib/page-title';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type LoginPageProps = {
  authStep: 'login' | 'setPassword';
  email: string;
  password: string;
  newPassword: string;
  confirmPassword: string;
  bootstrapSecret: string;
  setupRequiresSecret: boolean;
  error: string;
  isSubmitting: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onBootstrapSecretChange: (value: string) => void;
  onLoginSubmit: (event: FormEvent) => void;
  onSetPasswordSubmit: (event: FormEvent) => void;
  onBackToLogin: () => void;
};

export function LoginPage({
  authStep,
  email,
  password,
  newPassword,
  confirmPassword,
  bootstrapSecret,
  setupRequiresSecret,
  error,
  isSubmitting,
  onEmailChange,
  onPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onBootstrapSecretChange,
  onLoginSubmit,
  onSetPasswordSubmit,
  onBackToLogin,
}: LoginPageProps) {
  useDocumentTitle(buildPageTitle(authStep === 'setPassword' ? 'Choose password' : 'Sign in'));

  if (authStep === 'setPassword') {
    return (
      <div className="relative flex min-h-svh items-center justify-center bg-background p-4">
        <div className="absolute top-4 right-4 z-10">
          <ModeToggle />
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Set your password</CardTitle>
            <CardDescription>
              This account does not have a password yet. Choose one to finish signing in ({email}).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSetPasswordSubmit}>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => onNewPasswordChange(event.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => onConfirmPasswordChange(event.target.value)}
                  required
                  minLength={8}
                />
              </div>
              {setupRequiresSecret ? (
                <div className="space-y-2">
                  <Label htmlFor="bootstrap-secret">Setup key</Label>
                  <Input
                    id="bootstrap-secret"
                    type="password"
                    autoComplete="off"
                    value={bootstrapSecret}
                    onChange={(event) => onBootstrapSecretChange(event.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional lock: must match BOOTSTRAP_SECRET on the API if your deployment sets it.
                  </p>
                </div>
              ) : null}
              {error ? <LoadErrorAlert compact title="Can't sign in" message={error} /> : null}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save password and continue'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={onBackToLogin}>
                Back to sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4 z-10">
        <ModeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>Sign in to your Note CMS dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onLoginSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty if you have not set a password yet (you will be asked to create one).
              </p>
            </div>
            {error ? <LoadErrorAlert compact title="Can't sign in" message={error} /> : null}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
