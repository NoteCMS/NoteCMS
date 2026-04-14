export const typeDefs = `#graphql
  scalar JSON

  type User { id: ID!, email: String!, status: String!, isAdmin: Boolean! }
  type Site { id: ID!, name: String!, url: String!, role: String }
  type Membership { id: ID!, userId: ID!, siteId: ID!, role: String! }
  type SiteAccess { siteId: ID!, siteName: String!, role: String! }
  type GlobalUser { id: ID!, email: String!, status: String!, isAdmin: Boolean!, access: [SiteAccess!]! }
  type ContentType { id: ID!, siteId: ID!, name: String!, slug: String!, fields: JSON! }
  type Entry { id: ID!, siteId: ID!, contentTypeId: ID!, slug: String!, data: JSON! }
  type AuthPayload { token: String!, user: User! }

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

    createContentType(siteId: ID!, name: String!, slug: String!, fields: [FieldInput!]!): ContentType!
    updateContentType(id: ID!, siteId: ID!, name: String, slug: String, fields: [FieldInput!]): ContentType!
    deleteContentType(id: ID!, siteId: ID!): Boolean!

    createEntry(siteId: ID!, contentTypeId: ID!, slug: String!, data: JSON!): Entry!
    updateEntry(id: ID!, siteId: ID!, slug: String, data: JSON): Entry!
    deleteEntry(id: ID!, siteId: ID!): Boolean!
  }
`;
