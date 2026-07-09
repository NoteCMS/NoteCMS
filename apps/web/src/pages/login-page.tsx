import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LoadErrorAlert } from '@/components/load-error-alert';
import { ModeToggle } from '@/components/mode-toggle';
import { NoteWordmark } from '@/components/note-wordmark';
import { buildPageTitle, useDocumentTitle } from '@/lib/page-title';
import type { PublicAuthView, TokenLinkStatus } from '@/hooks/use-auth';
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
  publicAuthView: PublicAuthView;
  authStep: 'login' | 'setPassword' | 'forgotPasswordSent';
  email: string;
  password: string;
  newPassword: string;
  confirmPassword: string;
  bootstrapSecret: string;
  setupRequiresSecret: boolean;
  mailConfigured: boolean;
  error: string;
  isSubmitting: boolean;
  tokenLinkStatus: TokenLinkStatus;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onBootstrapSecretChange: (value: string) => void;
  onLoginSubmit: (event: FormEvent) => void;
  onSetPasswordSubmit: (event: FormEvent) => void;
  onForgotPasswordSubmit: (event: FormEvent) => void;
  onCompleteTokenPasswordSubmit: (event: FormEvent) => void;
  onBackToLogin: () => void;
};

export function LoginPage({
  publicAuthView,
  authStep,
  email,
  password,
  newPassword,
  confirmPassword,
  bootstrapSecret,
  setupRequiresSecret,
  mailConfigured,
  error,
  isSubmitting,
  tokenLinkStatus,
  onEmailChange,
  onPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onBootstrapSecretChange,
  onLoginSubmit,
  onSetPasswordSubmit,
  onForgotPasswordSubmit,
  onCompleteTokenPasswordSubmit,
  onBackToLogin,
}: LoginPageProps) {
  const pageTitle =
    publicAuthView === 'forgotPassword'
      ? 'Forgot password'
      : publicAuthView === 'invitePassword'
        ? 'Set your password'
        : publicAuthView === 'resetPassword'
          ? 'Reset password'
          : authStep === 'setPassword'
            ? 'Choose password'
            : 'Sign in';
  useDocumentTitle(buildPageTitle(pageTitle));

  if (publicAuthView === 'forgotPassword') {
    if (authStep === 'forgotPasswordSent') {
      return (
        <AuthShell>
          <AuthCard description="Check your email">
            <div className="space-y-4 text-left text-sm text-muted-foreground">
              <p>
                If an account exists for <span className="font-medium text-foreground">{email}</span>, we sent a link
                to reset your password.
              </p>
              <p>The link expires after a while. Did not get it? Check spam or try again in a few minutes.</p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/">Back to sign in</Link>
              </Button>
            </div>
          </AuthCard>
        </AuthShell>
      );
    }

    return (
      <AuthShell>
        <AuthCard description="We'll email you a link to reset your password">
          <form className="space-y-4 text-left" onSubmit={onForgotPasswordSubmit}>
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
            {!mailConfigured ? (
              <p className="text-xs text-muted-foreground">
                Password reset is not set up on this server. Ask whoever runs your workspace.
              </p>
            ) : null}
            {error ? <LoadErrorAlert compact title="Can't send email" message={error} /> : null}
            <div className="space-y-3 pt-2">
              <Button type="submit" className="w-full" disabled={isSubmitting || !mailConfigured}>
                {isSubmitting ? 'Sending...' : 'Send reset link'}
              </Button>
              <Button asChild type="button" variant="ghost" className="w-full">
                <Link to="/">Back to sign in</Link>
              </Button>
            </div>
          </form>
        </AuthCard>
      </AuthShell>
    );
  }

  if (publicAuthView === 'resetPassword' || publicAuthView === 'invitePassword') {
    if (tokenLinkStatus === 'loading' || tokenLinkStatus === 'idle') {
      return (
        <AuthShell>
          <AuthCard description="Checking your link…">
            <p className="text-sm text-muted-foreground">One moment.</p>
          </AuthCard>
        </AuthShell>
      );
    }

    if (tokenLinkStatus !== 'valid') {
      const isInvite = publicAuthView === 'invitePassword';
      const description =
        tokenLinkStatus === 'used'
          ? 'This link was already used'
          : tokenLinkStatus === 'expired'
            ? 'This link has expired'
            : 'This link is not valid';

      const body =
        tokenLinkStatus === 'used'
          ? isInvite
            ? 'You already set a password for this account. Sign in to continue.'
            : 'This reset link was already used. Request a new one if you still need to change your password.'
          : tokenLinkStatus === 'expired'
            ? isInvite
              ? 'Ask your workspace admin to send a new invite.'
              : 'Request a new reset link from the sign-in page.'
            : isInvite
              ? 'The invite link may be incomplete or no longer available. Ask your workspace admin for a new one.'
              : 'The link may be incomplete or no longer available. Request a new reset link from the sign-in page.';

      return (
        <AuthShell>
          <AuthCard description={description}>
            <div className="space-y-4 text-left text-sm text-muted-foreground">
              <p>{body}</p>
              <div className="space-y-3 pt-2">
                {!isInvite && tokenLinkStatus !== 'missing' ? (
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/forgot-password">Request a new reset link</Link>
                  </Button>
                ) : null}
                <Button asChild className="w-full">
                  <Link to="/">Back to sign in</Link>
                </Button>
              </div>
            </div>
          </AuthCard>
        </AuthShell>
      );
    }

    return (
      <AuthShell>
        <AuthCard
          description={
            publicAuthView === 'invitePassword'
              ? 'Choose a password for your new account'
              : 'Choose a new password'
          }
        >
          <form className="space-y-4 text-left" onSubmit={onCompleteTokenPasswordSubmit}>
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
            {error ? <LoadErrorAlert compact title="Can't save password" message={error} /> : null}
            <div className="space-y-3 pt-2">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save and sign in'}
              </Button>
              <Button asChild type="button" variant="ghost" className="w-full">
                <Link to="/">Back to sign in</Link>
              </Button>
            </div>
          </form>
        </AuthCard>
      </AuthShell>
    );
  }

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
          <div className="space-y-2">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              aria-label="Password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            No password yet? Leave blank if you are setting up this server for the first time.
          </p>
          {!mailConfigured ? (
            <p className="text-center text-xs text-muted-foreground">
              Password reset by email is not set up on this server yet.
            </p>
          ) : null}
          {error ? <LoadErrorAlert compact title="Can't sign in" message={error} /> : null}
          <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
          <p className="text-center text-sm">
            <Link
              to="/forgot-password"
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Reset password
            </Link>
          </p>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
