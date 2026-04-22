/** JSON values as returned by the CMS GraphQL `JSON` scalar */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type ContentType = {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  /** Field definitions as stored by the CMS (usually an array of field objects). */
  fields: Json;
  options: Json;
};

export type EntryEditor = {
  id: string;
  email: string;
};

export type Entry = {
  id: string;
  siteId: string;
  contentTypeId: string;
  name: string;
  slug: string | null;
  data: Json;
  updatedAt: string;
  lastEditedBy: EntryEditor | null;
};

export type AssetVariantUrls = {
  original: string;
  web: string;
  thumbnail: string;
  small: string | null;
  medium: string | null;
  large: string;
  xlarge: string | null;
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
  variants: AssetVariantUrls;
  createdAt: string;
  updatedAt: string;
};

/** Branding assets on `siteSettings` when logo/favicon are set (subset of {@link Asset}). */
export type SiteBrandingAsset = {
  id: string;
  filename: string;
  mimeType: string;
  alt: string;
  title?: string;
  variants: {
    web: string;
    thumbnail: string;
  };
};

export type MenuSlotResolved = {
  slot: string;
  entry: Entry | null;
};

export type SiteSettings = {
  id: string | null;
  siteId: string;
  logoAssetId: string | null;
  faviconAssetId: string | null;
  siteTitle: string | null;
  /** When false, the API rejects MCP requests for this workspace. Omitted in older API responses (treat as true). */
  mcpEnabled?: boolean;
  /** Raw slot key → entry id map from the API. Prefer {@link SiteSettings.menusResolved} for rendering. */
  menuEntries: Json;
  logo: SiteBrandingAsset | null;
  favicon: SiteBrandingAsset | null;
  menusResolved: MenuSlotResolved[];
};
