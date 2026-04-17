export type Role = 'owner' | 'admin' | 'editor' | 'viewer';
export type Status = 'active' | 'disabled';
export type FieldType = 'text' | 'textarea' | 'wysiwyg' | 'url' | 'number' | 'boolean' | 'date' | 'select' | 'repeater' | 'image';
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty'
  | 'gt'
  | 'lt';

export type Site = { id: string; name: string; url: string; role?: string };
export type Access = { siteId: string; siteName: string; role: Role };
export type GlobalUser = { id: string; email: string; status: Status; isAdmin: boolean; access: Access[] };

export type VisibilityRule = {
  id: string;
  fieldKey: string;
  operator: ConditionOperator;
  value?: string;
};

export type VisibilityGroup = {
  id: string;
  relation: 'all' | 'any';
  rules: VisibilityRule[];
};

export type VisibilityConfig = {
  relation: 'all' | 'any';
  groups: VisibilityGroup[];
};

/** Stored on the entry: which asset to use. Variant/derivatives are chosen when rendering (optional legacy `variant` may still exist on old data). */
export type ImageFieldValue = {
  assetId: string;
  variant?: 'original' | 'web' | 'thumbnail' | 'small' | 'medium' | 'large' | 'xlarge';
  altOverride?: string;
};

export type ContentField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  config?: {
    options?: string[];
    fields?: ContentField[];
    contentTypeId?: string;
    visibility?: VisibilityConfig;
  };
};

export type ContentType = {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  fields: ContentField[];
  options?: {
    showInSidebar?: boolean;
    sidebarLabel?: string;
    sidebarOrder?: number;
    hasSlug?: boolean;
  };
};

export type FocalPoint = {
  x: number;
  y: number;
};

export type Asset = {
  id: string;
  siteId: string;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  alt: string;
  title: string;
  focalPoint: FocalPoint;
  variants: {
    original: string;
    web: string;
    thumbnail: string;
    small: string | null;
    medium: string | null;
    large: string;
    xlarge: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type Entry = {
  id: string;
  siteId: string;
  contentTypeId: string;
  name: string;
  slug: string | null;
  data: Record<string, unknown>;
  updatedAt: string;
  lastEditedBy: {
    id: string;
    email: string;
  } | null;
};

export type AccessDraft = Record<string, { enabled: boolean; role: Role }>;
