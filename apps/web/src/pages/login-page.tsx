import type { FormEvent, ReactNode } from 'react';
import { LoadErrorAlert } from '@/components/load-error-alert';
import { ModeToggle } from '@/components/mode-toggle';
import { NoteWordmark } from '@/components/note-wordmark';
import { buildPageTitle, useDocumentTitle } from '@/lib/page-title';
import { Button } from '@/components/ui/button';
import { Card, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh items-center justify-center bg-muted p-4 sm:p-6">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ModeToggle />
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

type AuthCardProps = {
  description: ReactNode;
  children: ReactNode;
};

function AuthCard({ description, children }: AuthCardProps) {
  return (
    <Card className="w-full">
      <div className="space-y-8 text-center">
        <div className="space-y-1.5">
          <NoteWordmark className="text-5xl sm:text-5xl" />
          <CardDescription>{description}</CardDescription>
        </div>
        {children}
      </div>
    </Card>
  );
}

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
      <AuthShell>
        <AuthCard description={<>Set a password for {email}</>}>
          <form className="space-y-4 text-left" onSubmit={onSetPasswordSubmit}>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="New password"
              aria-label="New password"
              value={newPassword}
              onChange={(event) => onNewPasswordChange(event.target.value)}
              required
              minLength={8}
            />
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Confirm password"
              aria-label="Confirm password"
              value={confirmPassword}
              onChange={(event) => onConfirmPasswordChange(event.target.value)}
              required
              minLength={8}
            />
            {setupRequiresSecret ? (
              <>
                <Input
                  id="bootstrap-secret"
                  type="password"
                  autoComplete="off"
                  placeholder="Setup key"
                  aria-label="Setup key"
                  value={bootstrapSecret}
                  onChange={(event) => onBootstrapSecretChange(event.target.value)}
                  required
                />
                <p className="text-center text-xs text-muted-foreground">
                  Required when your server uses a setup key.
                </p>
              </>
            ) : null}
            {error ? <LoadErrorAlert compact title="Can't sign in" message={error} /> : null}
            <div className="space-y-3 pt-2">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save and continue'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={onBackToLogin}>
                Back to sign in
              </Button>
            </div>
          </form>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthCard description="Sign in to continue">
        <form className="space-y-4 text-left" onSubmit={onLoginSubmit}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="Email"
            aria-label="Email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            required
            autoFocus
          />
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
          />
          <p className="text-center text-xs text-muted-foreground">
            No password yet? Leave blank to set one.
          </p>
          {error ? <LoadErrorAlert compact title="Can't sign in" message={error} /> : null}
          <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
