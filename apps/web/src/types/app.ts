export type Role = 'owner' | 'admin' | 'editor' | 'viewer';
export type Status = 'active' | 'disabled';

export type Site = { id: string; name: string; url: string; role?: string };
export type Access = { siteId: string; siteName: string; role: Role };
export type GlobalUser = { id: string; email: string; status: Status; isAdmin: boolean; access: Access[] };

export type AccessDraft = Record<string, { enabled: boolean; role: Role }>;
