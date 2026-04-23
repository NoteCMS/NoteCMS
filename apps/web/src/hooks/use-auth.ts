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
};

type BootstrapStatusResponse = {
  bootstrapAuthStatus: { initialPasswordRequiresSecret: boolean };
};

function getDefaultName(email: string) {
  const base = email.split('@')[0] ?? 'User';
  return base.slice(0, 1).toUpperCase() + base.slice(1);
}

function resolvedDisplayLabel(email: string, displayName: string | null) {
  const trimmed = typeof displayName === 'string' ? displayName.trim() : '';
  if (trimmed) return trimmed;
  return getDefaultName(email);
}

export function useAuth() {
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
  const [authStep, setAuthStep] = useState<'login' | 'setPassword'>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidatingSession, setIsValidatingSession] = useState(false);
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
          '{ bootstrapAuthStatus { initialPasswordRequiresSecret } }',
        );
        if (!cancelled) setSetupRequiresSecret(data.bootstrapAuthStatus.initialPasswordRequiresSecret);
      } catch {
        if (!cancelled) setSetupRequiresSecret(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      setToken(data.login.token);
      setUserEmail(data.login.user?.email ?? email);
      setIsAdmin(Boolean(data.login.user?.isAdmin));
      setUserDisplayName(data.login.user?.displayName ?? null);
      await loadSites(data.login.token);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed');
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
      setToken(data.setInitialPassword.token);
      setUserEmail(data.setInitialPassword.user.email);
      setIsAdmin(Boolean(data.setInitialPassword.user.isAdmin));
      setUserDisplayName(data.setInitialPassword.user.displayName ?? null);
      setAuthStep('login');
      setNewPassword('');
      setConfirmPassword('');
      setBootstrapSecret('');
      await loadSites(data.setInitialPassword.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set password');
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
    authStep,
    setAuthStep,
    isSubmitting,
    isValidatingSession,
    error,
    sites,
    refreshSites,
    refreshProfile,
    handleLogin,
    handleSetInitialPassword,
    cancelPasswordSetup,
    handleLogout,
  };
}
