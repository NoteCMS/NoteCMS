export const typeDefs = `#graphql
  scalar JSON

  type User { id: ID!, email: String!, status: String!, isAdmin: Boolean! }
  type Site { id: ID!, name: String!, url: String!, role: String }
  type Membership { id: ID!, userId: ID!, siteId: ID!, role: String! }
  type SiteAccess { siteId: ID!, siteName: String!, role: String! }
  type GlobalUser { id: ID!, email: String!, status: String!, isAdmin: Boolean!, access: [SiteAccess!]! }
  type ContentType { id: ID!, siteId: ID!, name: String!, slug: String!, fields: JSON!, options: JSON! }
  type EntryEditor { id: ID!, email: String! }
  type Entry { id: ID!, siteId: ID!, contentTypeId: ID!, name: String!, slug: String, data: JSON!, updatedAt: String!, lastEditedBy: EntryEditor }
  type AuthPayload { token: String!, user: User! }

  type LoginPayload {
    token: String
    requiresPasswordSetup: Boolean!
    user: User
  }

  type BootstrapAuthStatus {
    initialPasswordRequiresSecret: Boolean!
  }

  type AssetVariantUrls {
    original: String!
    web: String!
    thumbnail: String!
    small: String
    medium: String
    large: String!
    xlarge: String
  }

  type FocalPoint {
    x: Float!
    y: Float!
  }

  type Asset {
    id: ID!
    siteId: ID!
    uploadedBy: ID!
    filename: String!
    mimeType: String!
    sizeBytes: Int!
    width: Int
    height: Int
    alt: String!
    title: String!
    focalPoint: FocalPoint!
    variants: AssetVariantUrls!
    createdAt: String!
    updatedAt: String!
  }

  type ApiKey {
    id: ID!
    siteId: ID!
    name: String!
    keyHint: String!
    scopes: [String!]!
    actingUserId: ID
    createdAt: String!
    lastUsedAt: String
  }

  """Metadata for the caller when authenticated with a site API key."""
  type ApiKeyInfo {
    siteId: ID!
    scopes: [String!]!
    name: String!
    keyHint: String!
  }

  type CreateApiKeyPayload {
    apiKey: ApiKey!
    token: String!
  }

  type MenuSlotResolved {
    slot: String!
    entry: Entry
  }

  type SiteSettings {
    id: ID
    siteId: ID!
    logoAssetId: ID
    faviconAssetId: ID
    siteTitle: String
    menuEntries: JSON!
    """When false, the Streamable HTTP MCP route at /api/mcp rejects traffic for this workspace."""
    mcpEnabled: Boolean!
    logo: Asset
    favicon: Asset
    menusResolved: [MenuSlotResolved!]!
  }

  input SiteSettingsInput {
    logoAssetId: ID
    faviconAssetId: ID
    siteTitle: String
    menuEntries: JSON
    mcpEnabled: Boolean
  }

  input FieldInput {
    key: String!
    label: String!
    type: String!
    required: Boolean
    config: JSON
  }

  input SiteBundlePartOptions {
    siteSettings: Boolean!
    contentTypes: Boolean!
    contentTypeSlugsForEntries: [String!]!
    assets: Boolean!
  }

  type SiteImportSummary {
    contentTypesUpserted: Int!
    entriesCreated: Int!
    entriesUpdated: Int!
    assetsImported: Int!
    siteSettingsApplied: Boolean!
  }

  type Query {
    bootstrapAuthStatus: BootstrapAuthStatus!
    me: User
    listMySites: [Site!]!
    globalUsers(role: String, siteId: ID, status: String, isAdmin: Boolean): [GlobalUser!]!
    apiKeyInfo: ApiKeyInfo!
    contentTypes(siteId: ID): [ContentType!]!
    """limit and offset are capped server-side (see API docs / list limits)."""
    entries(siteId: ID, contentTypeId: ID!, limit: Int, offset: Int): [Entry!]!
    entry(id: ID!, siteId: ID): Entry
    entryBySlug(siteId: ID, contentTypeSlug: String!, slug: String!): Entry
    """The query argument matches filename as a case-insensitive substring (not a regex). limit/offset are capped."""
    listAssets(siteId: ID, query: String, limit: Int, offset: Int): [Asset!]!
    apiKeys(siteId: ID!): [ApiKey!]!
    siteSettings(siteId: ID): SiteSettings!
    exportSiteBundle(siteId: ID, options: SiteBundlePartOptions!): JSON!
  }

  type Mutation {
    register(email: String!, password: String!): AuthPayload!
    login(email: String!, password: String, siteId: ID): LoginPayload!
    setInitialPassword(email: String!, newPassword: String!, bootstrapSecret: String): AuthPayload!


    createSite(name: String!, url: String!): Site!
    updateSite(siteId: ID!, name: String, url: String): Site!
    createGlobalUser(email: String!, password: String!, status: String, isAdmin: Boolean): GlobalUser!
    updateUserStatus(userId: ID!, status: String!): GlobalUser!
    setUserAdmin(userId: ID!, isAdmin: Boolean!): GlobalUser!
    setUserSiteRole(userId: ID!, siteId: ID!, role: String!): GlobalUser!
    removeUserSiteAccess(userId: ID!, siteId: ID!): GlobalUser!
    inviteUser(siteId: ID!, email: String!, role: String!): Membership!
    setRole(siteId: ID!, userId: ID!, role: String!): Membership!

    createContentType(siteId: ID, name: String!, slug: String!, fields: [FieldInput!]!, options: JSON): ContentType!
    updateContentType(id: ID!, siteId: ID, name: String, slug: String, fields: [FieldInput!], options: JSON): ContentType!
    deleteContentType(id: ID!, siteId: ID): Boolean!

    createEntry(siteId: ID, contentTypeId: ID!, name: String!, slug: String, data: JSON!): Entry!
    updateEntry(id: ID!, siteId: ID, name: String, slug: String, data: JSON): Entry!
    deleteEntry(id: ID!, siteId: ID): Boolean!

    uploadAsset(siteId: ID, fileBase64: String!, filename: String!, mimeType: String!, alt: String, title: String): Asset!
    updateAssetMeta(id: ID!, siteId: ID, alt: String, title: String, focalX: Float, focalY: Float): Asset!
    deleteAsset(id: ID!, siteId: ID): Boolean!

    createApiKey(siteId: ID!, name: String!, scopes: [String!]!, actingUserId: ID): CreateApiKeyPayload!
    revokeApiKey(id: ID!, siteId: ID!): Boolean!

    updateSiteSettings(siteId: ID, input: SiteSettingsInput!): SiteSettings!
    importSiteBundle(siteId: ID, bundle: JSON!, options: SiteBundlePartOptions!): SiteImportSummary!
  }
`;
