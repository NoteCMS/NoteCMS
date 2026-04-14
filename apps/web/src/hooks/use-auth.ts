import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { gqlRequest } from '@/api/graphql';
import type { Site } from '@/types/app';

const TOKEN_KEY = 'notecms_token';
const USER_EMAIL_KEY = 'notecms_user_email';

type LoginResponse = {
  login: {
    token: string;
    user: {
      email: string;
      isAdmin: boolean;
    };
  };
};

function getDefaultName(email: string) {
  const base = email.split('@')[0] ?? 'User';
  return base.slice(0, 1).toUpperCase() + base.slice(1);
}

export function useAuth() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [userEmail, setUserEmail] = useState<string>(() => localStorage.getItem(USER_EMAIL_KEY) ?? '');
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState('owner@note.local');
  const [password, setPassword] = useState('password123');
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

  const userName = useMemo(() => getDefaultName(userEmail || email), [userEmail, email]);

  async function loadSites(authToken: string) {
    const data = await gqlRequest<{ listMySites: Site[] }>(authToken, '{ listMySites { id name url role } }');
    setSites(data.listMySites);
  }

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function validateSession() {
      setIsValidatingSession(true);
      try {
        const data = await gqlRequest<{ me: { email: string; isAdmin: boolean } }>(token, '{ me { email isAdmin } }');
        if (!data.me?.email) throw new Error('Invalid session');
        if (!cancelled) {
          setUserEmail(data.me.email);
          setIsAdmin(Boolean(data.me.isAdmin));
          await loadSites(token);
        }
      } catch {
        if (!cancelled) {
          setToken('');
          setUserEmail('');
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
  }, [token]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const data = await gqlRequest<LoginResponse>(
        '',
        'mutation($email:String!,$password:String!){ login(email:$email,password:$password){ token user { email isAdmin } } }',
        { email, password },
      );
      setToken(data.login.token);
      setUserEmail(data.login.user.email);
      setIsAdmin(Boolean(data.login.user.isAdmin));
      await loadSites(data.login.token);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLogout() {
    setToken('');
    setUserEmail('');
    setIsAdmin(false);
    setSites([]);
  }

  async function refreshSites() {
    if (!token) return;
    await loadSites(token);
  }

  return {
    token,
    userEmail,
    userName,
    isAdmin,
    email,
    password,
    setEmail,
    setPassword,
    isSubmitting,
    isValidatingSession,
    error,
    sites,
    refreshSites,
    handleLogin,
    handleLogout,
  };
}
