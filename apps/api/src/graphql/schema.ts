export const typeDefs = `#graphql
  scalar JSON

  type User { id: ID!, email: String!, status: String!, isAdmin: Boolean! }
  type Site { id: ID!, name: String!, url: String!, role: String }
  type Membership { id: ID!, userId: ID!, siteId: ID!, role: String! }
  type SiteAccess { siteId: ID!, siteName: String!, role: String! }
  type GlobalUser { id: ID!, email: String!, status: String!, isAdmin: Boolean!, access: [SiteAccess!]! }
  type ContentType { id: ID!, siteId: ID!, name: String!, slug: String!, fields: JSON!, options: JSON! }
  type EntryEditor { id: ID!, email: String! }
  type Entry { id: ID!, siteId: ID!, contentTypeId: ID!, slug: String, data: JSON!, updatedAt: String!, lastEditedBy: EntryEditor }
  type AuthPayload { token: String!, user: User! }

  type AssetVariantUrls {
    original: String!
    web: String!
    thumbnail: String!
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
    variants: AssetVariantUrls!
    createdAt: String!
    updatedAt: String!
  }

  input FieldInput {
    key: String!
    label: String!
    type: String!
    required: Boolean
    config: JSON
  }

  type Query {
    me: User
    listMySites: [Site!]!
    globalUsers(role: String, siteId: ID, status: String, isAdmin: Boolean): [GlobalUser!]!
    contentTypes(siteId: ID!): [ContentType!]!
    entries(siteId: ID!, contentTypeId: ID!, limit: Int, offset: Int): [Entry!]!
    listAssets(siteId: ID!, query: String, limit: Int, offset: Int): [Asset!]!
  }

  type Mutation {
    register(email: String!, password: String!): AuthPayload!
    login(email: String!, password: String!, siteId: ID): AuthPayload!

    createSite(name: String!, url: String!): Site!
    createGlobalUser(email: String!, password: String!, status: String, isAdmin: Boolean): GlobalUser!
    updateUserStatus(userId: ID!, status: String!): GlobalUser!
    setUserAdmin(userId: ID!, isAdmin: Boolean!): GlobalUser!
    setUserSiteRole(userId: ID!, siteId: ID!, role: String!): GlobalUser!
    removeUserSiteAccess(userId: ID!, siteId: ID!): GlobalUser!
    inviteUser(siteId: ID!, email: String!, role: String!): Membership!
    setRole(siteId: ID!, userId: ID!, role: String!): Membership!

    createContentType(siteId: ID!, name: String!, slug: String!, fields: [FieldInput!]!, options: JSON): ContentType!
    updateContentType(id: ID!, siteId: ID!, name: String, slug: String, fields: [FieldInput!], options: JSON): ContentType!
    deleteContentType(id: ID!, siteId: ID!): Boolean!

    createEntry(siteId: ID!, contentTypeId: ID!, slug: String, data: JSON!): Entry!
    updateEntry(id: ID!, siteId: ID!, slug: String, data: JSON): Entry!
    deleteEntry(id: ID!, siteId: ID!): Boolean!

    uploadAsset(siteId: ID!, fileBase64: String!, filename: String!, mimeType: String!, alt: String, title: String): Asset!
    updateAssetMeta(id: ID!, siteId: ID!, alt: String, title: String): Asset!
    deleteAsset(id: ID!, siteId: ID!): Boolean!
  }
`;
