export const typeDefs = `#graphql
  scalar JSON

  type User { id: ID!, email: String!, displayName: String, status: String!, isAdmin: Boolean! }
  type Site { id: ID!, name: String!, url: String!, role: String }
  type Membership { id: ID!, userId: ID!, siteId: ID!, role: String! }
  type SiteAccess { siteId: ID!, siteName: String!, role: String! }
  type GlobalUser { id: ID!, email: String!, status: String!, isAdmin: Boolean!, access: [SiteAccess!]! }
  type ContentType { id: ID!, siteId: ID!, name: String!, slug: String!, fields: JSON!, options: JSON! }
  type EntryEditor { id: ID!, email: String! }
  type EntryRevision {
    id: ID!
    entryId: ID!
    siteId: ID!
    revisionNumber: Int!
    kind: String!
    createdAt: String!
    createdById: ID
    payload: JSON!
  }
  type EntryMeta {
    title: String
    description: String
  }

  input EntryMetaInput {
    title: String
    description: String
  }

  type Entry {
    id: ID!
    siteId: ID!
    contentTypeId: ID!
    name: String!
    slug: String
    data: JSON!
    meta: EntryMeta!
    lifecycleStatus: String!
    publishedAt: String
    scheduledPublishAt: String
    scheduledUnpublishAt: String
    deletedAt: String
    hasUnpublishedChanges: Boolean!
    createdAt: String!
    updatedAt: String!
    """Canonical site path (leading slash) from the content type permalink template; null when the type has no URL slug."""
    canonicalPath: String
    lastEditedBy: EntryEditor
  }
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

    """Outbound GitHub repository_dispatch."""
    publishEnabled: Boolean!
    publishGithubOwner: String
    publishGithubRepo: String
    """Canonical https://github.com/owner/repo when both are set."""
    publishGithubRepoUrl: String
    publishEventType: String
    hasPublishPat: Boolean!
    """POST URL for workflow completion (same host as PUBLIC_API_BASE_URL)."""
    publishWebhookPostUrl: String
    hasPublishReturnToken: Boolean!
    publishLastTriggerAt: String
    publishLastTriggerOk: Boolean
    publishLastTriggerStatusCode: Int
    publishLastTriggerMessage: String
    publishLastReturnAt: String
    publishLastReturnStatus: String
    publishLastReturnRunUrl: String
    publishLastReturnPayload: JSON
    """Increments when entries, content types, site settings, or assets change."""
    contentRevision: Int!
    """Written when a successful build completion callback includes structured fields in the detail payload."""
    lastPublishedWatermark: JSON
    """When false, scheduled automatic backups are skipped for this workspace."""
    backupEnabled: Boolean!
  }

  input PublishWebhookInput {
    publishEnabled: Boolean
    """Paste a repo URL (https://github.com/org/repo) or org/repo. Sets owner + repo; overrides separate owner/repo fields when sent."""
    githubRepoUrl: String
    publishGithubOwner: String
    publishGithubRepo: String
    publishEventType: String
    """Plaintext PAT; omit to keep existing. Pass empty string to remove stored token."""
    githubPat: String
  }

  type PublishTriggerResult {
    ok: Boolean!
    statusCode: Int
    message: String!
    triggeredAt: String!
  }

  type PublishReturnWebhookSetup {
    """
    POST this URL from GitHub Actions when the build finishes (JSON body).
    The signing secret is embedded in the query string — store the whole URL as one repository secret (shown only once).
    Authorization: Bearer is optional when using this URL.
    """
    callbackUrl: String!
  }

  enum SiteBuildTriggerRole {
    editor
    owner
  }

  """A GitHub Actions deploy target for a workspace (e.g. production, staging)."""
  type SiteBuild {
    id: ID!
    siteId: ID!
    """URL-safe id unique within the workspace, e.g. production or staging."""
    slug: String!
    label: String!
    sortOrder: Int!
    enabled: Boolean!
    """Minimum site role required to trigger this build. Owners can always trigger."""
    triggerMinRole: SiteBuildTriggerRole!
    publishGithubOwner: String
    publishGithubRepo: String
    publishGithubRepoUrl: String
    publishEventType: String
    hasPublishPat: Boolean!
    publishWebhookPostUrl: String
    hasPublishReturnToken: Boolean!
    publishLastTriggerAt: String
    publishLastTriggerOk: Boolean
    publishLastTriggerStatusCode: Int
    publishLastTriggerMessage: String
    publishLastReturnAt: String
    publishLastReturnStatus: String
    publishLastReturnRunUrl: String
    publishLastReturnPayload: JSON
    lastPublishedWatermark: JSON
  }

  input SiteBuildInput {
    slug: String
    label: String
    sortOrder: Int
    enabled: Boolean
    triggerMinRole: SiteBuildTriggerRole
    githubRepoUrl: String
    publishGithubOwner: String
    publishGithubRepo: String
    publishEventType: String
    """Plaintext PAT; omit to keep existing. Pass empty string to remove stored token."""
    githubPat: String
  }

  input CreateSiteBuildInput {
    slug: String!
    label: String!
    sortOrder: Int
    enabled: Boolean
    triggerMinRole: SiteBuildTriggerRole
    githubRepoUrl: String
    publishGithubOwner: String
    publishGithubRepo: String
    publishEventType: String
    githubPat: String
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

  type SiteBackupSummary {
    contentTypes: Int!
    entries: Int!
    assets: Int!
    siteSettings: Boolean!
  }

  type SiteBackup {
    id: ID!
    siteId: ID!
    tier: String!
    trigger: String!
    status: String!
    label: String
    createdByUserId: ID
    createdAt: String!
    completedAt: String
    sizeBytes: Int!
    errorMessage: String
    bundleVersion: Int!
    summary: SiteBackupSummary!
  }

  type SiteBackupSettings {
    backupEnabled: Boolean!
  }

  input SiteBackupSettingsInput {
    backupEnabled: Boolean
  }

  type SiteRestoreBackupResult {
    preRestoreBackupId: ID!
    summary: SiteImportSummary!
  }

  type PlatformBackup {
    id: ID!
    tier: String!
    trigger: String!
    status: String!
    label: String
    createdByUserId: ID
    createdAt: String!
    completedAt: String
    sizeBytes: Int!
    errorMessage: String
    mongoVersion: String
  }

  type PlatformRestoreResult {
    ok: Boolean!
  }

  type WorkspaceContentTypeBreakdown {
    contentTypeId: ID!
    name: String!
    slug: String!
    entryCount: Int!
  }

  """Roll-up counts and activity for the dashboard (indexed queries; safe for large sites)."""
  type WorkspaceOverview {
    contentTypeCount: Int!
    entryCount: Int!
    assetCount: Int!
    memberCount: Int!
    """Public site title from branding settings, when set."""
    siteTitle: String
    """ISO 8601 timestamp of the most recently updated entry, if any."""
    lastEntryActivity: String
    byContentType: [WorkspaceContentTypeBreakdown!]!
  }

  type Query {
    bootstrapAuthStatus: BootstrapAuthStatus!
    me: User
    listMySites: [Site!]!
    globalUsers(role: String, siteId: ID, status: String, isAdmin: Boolean): [GlobalUser!]!
    apiKeyInfo: ApiKeyInfo!
    contentTypes(siteId: ID): [ContentType!]!
    workspaceOverview(siteId: ID): WorkspaceOverview!
    """
    limit and offset are capped server-side (see API docs / list limits).
    Incremental sync: pass updatedSince (ISO 8601) to return only rows with updatedAt greater than that time (published consumer lists still respect lifecycle; combine with pagination as usual).
    Search is not implemented in the API; index content out-of-band (e.g. from content webhooks or batch export) when you need search.
    """
    entries(
      siteId: ID
      contentTypeId: ID!
      limit: Int
      offset: Int
      includeDrafts: Boolean
      includeDeleted: Boolean
      updatedSince: String
    ): [Entry!]!
    entry(id: ID!, siteId: ID): Entry
    entryBySlug(siteId: ID, contentTypeSlug: String!, slug: String!): Entry
    """
    Published-consumer route list for static generation (entries + optional archives). Throws if two nodes share the same path.
    Requires entries:read for API keys.
    """
    buildRouteManifest(siteId: ID): JSON!
    """Slugify base and append -2, -3, … until unused among non-deleted entries of this type (working slug field)."""
    suggestSlug(siteId: ID, contentTypeId: ID!, base: String!, excludeEntryId: ID): String!
    entryRevisions(entryId: ID!, siteId: ID, limit: Int, offset: Int): [EntryRevision!]!
    entryRevision(id: ID!, siteId: ID): EntryRevision
    """The query argument matches filename as a case-insensitive substring (not a regex). limit/offset are capped."""
    listAssets(siteId: ID, query: String, limit: Int, offset: Int): [Asset!]!
    apiKeys(siteId: ID!): [ApiKey!]!
    siteSettings(siteId: ID): SiteSettings!
    siteBuilds(siteId: ID): [SiteBuild!]!
    siteBuild(siteId: ID, id: ID!): SiteBuild
    exportSiteBundle(siteId: ID, options: SiteBundlePartOptions!): JSON!
    siteBackups(siteId: ID, limit: Int, offset: Int): [SiteBackup!]!
    exportSiteBackupJson(siteId: ID, backupId: ID!): JSON!
    platformBackups(limit: Int, offset: Int): [PlatformBackup!]!
    platformMaintenanceMode: Boolean!
  }

  type Mutation {
    register(email: String!, password: String!): AuthPayload!
    login(email: String!, password: String, siteId: ID): LoginPayload!
    setInitialPassword(email: String!, newPassword: String!, bootstrapSecret: String): AuthPayload!

    """Update the signed-in user's display name. Pass an empty string to clear it."""
    updateMyProfile(displayName: String!): User!
    changeMyPassword(currentPassword: String!, newPassword: String!): Boolean!

    createSite(name: String!, url: String!): Site!
    updateSite(siteId: ID!, name: String, url: String): Site!
    createGlobalUser(email: String!, password: String!, status: String, isAdmin: Boolean): GlobalUser!
    """Create a user with access to one site (never platform isAdmin). Site owners: viewer or editor only. Platform administrators may also set site owner."""
    createSiteUser(siteId: ID!, email: String!, password: String!, role: String!): GlobalUser!
    updateUserStatus(userId: ID!, status: String!): GlobalUser!
    setUserAdmin(userId: ID!, isAdmin: Boolean!): GlobalUser!
    setUserSiteRole(userId: ID!, siteId: ID!, role: String!): GlobalUser!
    removeUserSiteAccess(userId: ID!, siteId: ID!): GlobalUser!
    inviteUser(siteId: ID!, email: String!, role: String!): Membership!
    setRole(siteId: ID!, userId: ID!, role: String!): Membership!

    createContentType(siteId: ID, name: String!, slug: String!, fields: [FieldInput!]!, options: JSON): ContentType!
    updateContentType(id: ID!, siteId: ID, name: String, slug: String, fields: [FieldInput!], options: JSON): ContentType!
    deleteContentType(id: ID!, siteId: ID): Boolean!

    createEntry(siteId: ID, contentTypeId: ID!, name: String!, slug: String, data: JSON!, meta: EntryMetaInput): Entry!
    updateEntry(id: ID!, siteId: ID, name: String, slug: String, data: JSON, meta: EntryMetaInput): Entry!
    """Soft-delete: sets deletedAt. Use restoreEntry to undo."""
    deleteEntry(id: ID!, siteId: ID): Boolean!
    publishEntry(id: ID!, siteId: ID): Entry!
    unpublishEntry(id: ID!, siteId: ID): Entry!
    restoreEntry(id: ID!, siteId: ID): Entry!
    rollbackEntryToRevision(revisionId: ID!, siteId: ID): Entry!
    schedulePublishEntry(id: ID!, siteId: ID, at: String!): Entry!
    cancelScheduledPublish(id: ID!, siteId: ID): Entry!
    scheduleUnpublishEntry(id: ID!, siteId: ID, at: String!): Entry!
    cancelScheduledUnpublish(id: ID!, siteId: ID): Entry!

    uploadAsset(siteId: ID, fileBase64: String!, filename: String!, mimeType: String!, alt: String, title: String, focalX: Float, focalY: Float): Asset!
    updateAssetMeta(id: ID!, siteId: ID, alt: String, title: String, focalX: Float, focalY: Float): Asset!
    deleteAsset(id: ID!, siteId: ID): Boolean!

    createApiKey(siteId: ID!, name: String!, scopes: [String!]!, actingUserId: ID): CreateApiKeyPayload!
    revokeApiKey(id: ID!, siteId: ID!): Boolean!

    updateSiteSettings(siteId: ID, input: SiteSettingsInput!): SiteSettings!

    """Site owner or platform admin: configure outbound GitHub dispatch + optional return webhook."""
    updatePublishWebhook(siteId: ID, input: PublishWebhookInput!): SiteSettings!
    """Editor or higher: trigger repository_dispatch for this workspace."""
    triggerPublishWebhook(siteId: ID!): PublishTriggerResult!
    """Site owner or platform admin: generate a completion callback URL with embedded secret (invalidates previous)."""
    rotatePublishReturnWebhook(siteId: ID!): PublishReturnWebhookSetup!
    """Site owner or platform admin: disable inbound return webhook."""
    disablePublishReturnWebhook(siteId: ID!): SiteSettings!

    """Site owner or platform admin: create a GitHub Actions build target."""
    createSiteBuild(siteId: ID, input: CreateSiteBuildInput!): SiteBuild!
    """Site owner or platform admin: update a build target."""
    updateSiteBuild(siteId: ID, id: ID!, input: SiteBuildInput!): SiteBuild!
    """Site owner or platform admin: remove a build target."""
    deleteSiteBuild(siteId: ID, id: ID!): Boolean!
    """Trigger a build when the signed-in user meets triggerMinRole for that target."""
    triggerSiteBuild(siteId: ID, id: ID!): PublishTriggerResult!
    """Site owner or platform admin: generate a per-build completion callback URL."""
    rotateSiteBuildReturnWebhook(siteId: ID, id: ID!): PublishReturnWebhookSetup!
    """Site owner or platform admin: disable a build completion callback."""
    disableSiteBuildReturnWebhook(siteId: ID, id: ID!): SiteBuild!

    importSiteBundle(siteId: ID, bundle: JSON!, options: SiteBundlePartOptions!): SiteImportSummary!

    createSiteBackup(siteId: ID, label: String): SiteBackup!
    restoreSiteBackup(siteId: ID, backupId: ID!): SiteRestoreBackupResult!
    deleteSiteBackup(siteId: ID, backupId: ID!): Boolean!
    updateSiteBackupSettings(siteId: ID, input: SiteBackupSettingsInput!): SiteBackupSettings!

    createPlatformBackup(label: String): PlatformBackup!
    restorePlatformBackup(backupId: ID!, confirmId: ID!): PlatformRestoreResult!
    deletePlatformBackup(backupId: ID!): Boolean!
  }
`;
