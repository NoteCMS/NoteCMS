export type ApiKeyPrincipal = {
  id: string;
  siteId: string;
  scopes: string[];
};

export type RequestContext = {
  userId?: string;
  apiKey?: ApiKeyPrincipal;
  /** Present when the JWT payload includes an optional workspace id (login with site). */
  jwtSiteId?: string;
};
