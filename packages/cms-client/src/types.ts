/** JSON values as returned by the CMS GraphQL `JSON` scalar */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type ContentType = {
  id: string;
  siteId: string;
  name: string;
  slug: string;
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
