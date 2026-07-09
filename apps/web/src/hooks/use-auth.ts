import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { gqlRequest } from '@/api/graphql';
import type { Site } from '@/types/app';

const TOKEN_KEY = 'notecms_token';
const USER_EMAIL_KEY = 'notecms_user_email';

const ME_QUERY = '{ me { email isAdmin displayName } }';

type MePayload = { me: { email: string; isAdmin: boolean; displayName: string | null } };

type LoginResponse = {
  login: {
    token: string | null;
    requiresPasswordSetup: boolean;
    user: { email: string; isAdmin: boolean; displayName: string | null } | null;
  };
};

type AuthPayloadResponse = {
  setInitialPassword: {
    token: string;
    user: { email: string; isAdmin: boolean; displayName: string | null };
  };
  completePasswordReset: {
    token: string;
    user: { email: string; isAdmin: boolean; displayName: string | null };
  };
  completeAccountInvite: {
    token: string;
    user: { email: string; isAdmin: boolean; displayName: string | null };
  };
};

type BootstrapStatusResponse = {
  bootstrapAuthStatus: { initialPasswordRequiresSecret: boolean };
  mailConfigStatus: { enabled: boolean; configured: boolean };
};

export type PublicAuthView = 'login' | 'forgotPassword' | 'resetPassword' | 'invitePassword';

export type TokenLinkStatus = 'idle' | 'loading' | 'valid' | 'used' | 'expired' | 'invalid' | 'missing';

function getDefaultName(email: string) {
  const base = email.split('@')[0] ?? 'User';
  return base.slice(0, 1).toUpperCase() + base.slice(1);
}

function resolvedDisplayLabel(email: string, displayName: string | null) {
  const trimmed = typeof displayName === 'string' ? displayName.trim() : '';
  if (trimmed) return trimmed;
  return getDefaultName(email);
}

function authErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Could not sign in. Try again.';

  if (/networkerror|failed to fetch|load failed/i.test(error.message)) {
    return 'Could not reach the server. Check that the API is running and try again.';
  }

  switch (error.message) {
    case 'Invalid credentials':
      return 'Wrong email or password.';
    case 'Login failed':
      return 'Could not sign in. Try again.';
    case 'Check your email for a link to set your password.':
      return 'Check your email for a link to set your password.';
  }

  return error.message;
}

export function useAuth(publicAuthView: PublicAuthView = 'login', resetToken: string | null = null) {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [userEmail, setUserEmail] = useState<string>(() => localStorage.getItem(USER_EMAIL_KEY) ?? '');
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [setupRequiresSecret, setSetupRequiresSecret] = useState(false);
  const [mailConfigured, setMailConfigured] = useState(false);
  const [authStep, setAuthStep] = useState<'login' | 'setPassword' | 'forgotPasswordSent'>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidatingSession, setIsValidatingSession] = useState(false);
  const [tokenLinkStatus, setTokenLinkStatus] = useState<TokenLinkStatus>('idle');
  const [error, setError] = useState('');
  const [sites, setSites] = useState<Site[]>([]);

  useEffect(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }, [token]);

  useEffect(() => {
    if (userEmail) localStorage.setItem(USER_EMAIL_KEY, userEmail);
    else localStorage.removeItem(USER_EMAIL_KEY);
  }, [userEmail]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await gqlRequest<BootstrapStatusResponse>(
          '',
          '{ bootstrapAuthStatus { initialPasswordRequiresSecret } mailConfigStatus { enabled configured } }',
        );
        if (!cancelled) {
          setSetupRequiresSecret(data.bootstrapAuthStatus.initialPasswordRequiresSecret);
          setMailConfigured(data.mailConfigStatus.configured);
        }
      } catch {
        if (!cancelled) {
          setSetupRequiresSecret(false);
          setMailConfigured(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (publicAuthView !== 'resetPassword' && publicAuthView !== 'invitePassword') {
      setTokenLinkStatus('idle');
      return;
    }

    const trimmed = resetToken?.trim() ?? '';
    if (!trimmed) {
      setTokenLinkStatus('missing');
      return;
    }

    let cancelled = false;
    setTokenLinkStatus('loading');

    const purpose = publicAuthView === 'invitePassword' ? 'account_invite' : 'password_reset';

    void (async () => {
      try {
        const data = await gqlRequest<{ emailTokenStatus: TokenLinkStatus }>(
          '',
          'query($token:String!,$purpose:String!){ emailTokenStatus(token:$token,purpose:$purpose) }',
          { token: trimmed, purpose },
        );
        if (!cancelled) setTokenLinkStatus(data.emailTokenStatus);
      } catch {
        if (!cancelled) setTokenLinkStatus('invalid');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicAuthView, resetToken]);

  const userName = useMemo(
    () => resolvedDisplayLabel(userEmail || email, userDisplayName),
    [userEmail, email, userDisplayName],
  );

  async function loadSites(authToken: string) {
    const data = await gqlRequest<{ listMySites: Site[] }>(authToken, '{ listMySites { id name url role } }');
    setSites(data.listMySites);
  }

  const loadMe = useCallback(async (authToken: string) => {
    const data = await gqlRequest<MePayload>(authToken, ME_QUERY);
    if (!data.me?.email) throw new Error('Invalid session');
    setUserEmail(data.me.email);
    setIsAdmin(Boolean(data.me.isAdmin));
    setUserDisplayName(data.me.displayName ?? null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    await loadMe(token);
  }, [token, loadMe]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function validateSession() {
      setIsValidatingSession(true);
      try {
        await loadMe(token);
        if (!cancelled) await loadSites(token);
      } catch {
        if (!cancelled) {
          setToken('');
          setUserEmail('');
          setUserDisplayName(null);
          setIsAdmin(false);
          setSites([]);
        }
      } finally {
        if (!cancelled) setIsValidatingSession(false);
      }
    }

    void validateSession();

    return () => {
      cancelled = true;
    };
  }, [token, loadMe]);

  async function finishAuthFromPayload(payload: {
    token: string;
    user: { email: string; isAdmin: boolean; displayName: string | null };
  }) {
    setToken(payload.token);
    setUserEmail(payload.user.email);
    setIsAdmin(Boolean(payload.user.isAdmin));
    setUserDisplayName(payload.user.displayName ?? null);
    setAuthStep('login');
    setNewPassword('');
    setConfirmPassword('');
    setBootstrapSecret('');
    setPassword('');
    await loadSites(payload.token);
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const data = await gqlRequest<LoginResponse>(
        '',
        'mutation($email:String!,$password:String){ login(email:$email,password:$password){ token requiresPasswordSetup user { email isAdmin displayName } } }',
        { email, password },
      );
      if (data.login.requiresPasswordSetup) {
        setAuthStep('setPassword');
        if (data.login.user?.email) setEmail(data.login.user.email);
        setUserDisplayName(data.login.user?.displayName ?? null);
        return;
      }
      if (!data.login.token) throw new Error('Login failed');
      await finishAuthFromPayload({
        token: data.login.token,
        user: data.login.user ?? { email, isAdmin: false, displayName: null },
      });
    } catch (loginError) {
      setError(authErrorMessage(loginError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetInitialPassword(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setIsSubmitting(true);
    try {
      const variables: { email: string; newPassword: string; bootstrapSecret?: string } = {
        email,
        newPassword,
      };
      if (setupRequiresSecret) {
        variables.bootstrapSecret = bootstrapSecret.trim();
      }
      const data = await gqlRequest<AuthPayloadResponse>(
        '',
        'mutation($email:String!,$newPassword:String!,$bootstrapSecret:String){ setInitialPassword(email:$email,newPassword:$newPassword,bootstrapSecret:$bootstrapSecret){ token user { email isAdmin displayName } } }',
        variables,
      );
      await finishAuthFromPayload(data.setInitialPassword);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRequestPasswordReset(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!mailConfigured) {
      setError('Password reset is not set up on this server. Ask whoever runs your workspace.');
      return;
    }
    setIsSubmitting(true);
    try {
      await gqlRequest(
        '',
        'mutation($email:String!){ requestPasswordReset(email:$email){ ok } }',
        { email },
      );
      setAuthStep('forgotPasswordSent');
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCompletePasswordWithToken(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!resetToken?.trim()) {
      setError('This link is missing a token. Request a new one from the sign-in page.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setIsSubmitting(true);
    try {
      const mutation =
        publicAuthView === 'invitePassword'
          ? 'mutation($token:String!,$newPassword:String!){ completeAccountInvite(token:$token,newPassword:$newPassword){ token user { email isAdmin displayName } } }'
          : 'mutation($token:String!,$newPassword:String!){ completePasswordReset(token:$token,newPassword:$newPassword){ token user { email isAdmin displayName } } }';
      const field = publicAuthView === 'invitePassword' ? 'completeAccountInvite' : 'completePasswordReset';
      const data = await gqlRequest<AuthPayloadResponse>('', mutation, { token: resetToken, newPassword });
      await finishAuthFromPayload(data[field]);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  function cancelPasswordSetup() {
    setAuthStep('login');
    setNewPassword('');
    setConfirmPassword('');
    setBootstrapSecret('');
    setError('');
  }

  function handleLogout() {
    setToken('');
    setUserEmail('');
    setUserDisplayName(null);
    setIsAdmin(false);
    setSites([]);
    setAuthStep('login');
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setBootstrapSecret('');
  }

  async function refreshSites() {
    if (!token) return;
    await loadSites(token);
  }

  return {
    token,
    userEmail,
    userDisplayName,
    userName,
    isAdmin,
    email,
    password,
    setEmail,
    setPassword,
    newPassword,
    confirmPassword,
    setNewPassword,
    setConfirmPassword,
    bootstrapSecret,
    setBootstrapSecret,
    setupRequiresSecret,
    mailConfigured,
    publicAuthView,
    resetToken,
    authStep,
    setAuthStep,
    isSubmitting,
    isValidatingSession,
    tokenLinkStatus,
    error,
    sites,
    refreshSites,
    refreshProfile,
    handleLogin,
    handleSetInitialPassword,
    handleRequestPasswordReset,
    handleCompletePasswordWithToken,
    cancelPasswordSetup,
    handleLogout,
  };
}
