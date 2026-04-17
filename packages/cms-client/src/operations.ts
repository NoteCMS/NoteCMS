/** Stable operation strings — extend the selection set if you need more fields in your app. */

export const CONTENT_TYPES = /* GraphQL */ `
  query NoteCmsContentTypes($siteId: ID!) {
    contentTypes(siteId: $siteId) {
      id
      siteId
      name
      slug
      fields
      options
    }
  }
`;

export const ENTRIES = /* GraphQL */ `
  query NoteCmsEntries($siteId: ID!, $contentTypeId: ID!, $limit: Int, $offset: Int) {
    entries(siteId: $siteId, contentTypeId: $contentTypeId, limit: $limit, offset: $offset) {
      id
      siteId
      contentTypeId
      name
      slug
      data
      updatedAt
      lastEditedBy {
        id
        email
      }
    }
  }
`;

export const ENTRY = /* GraphQL */ `
  query NoteCmsEntry($siteId: ID!, $id: ID!) {
    entry(siteId: $siteId, id: $id) {
      id
      siteId
      contentTypeId
      name
      slug
      data
      updatedAt
      lastEditedBy {
        id
        email
      }
    }
  }
`;

export const ENTRY_BY_SLUG = /* GraphQL */ `
  query NoteCmsEntryBySlug($siteId: ID!, $contentTypeSlug: String!, $slug: String!) {
    entryBySlug(siteId: $siteId, contentTypeSlug: $contentTypeSlug, slug: $slug) {
      id
      siteId
      contentTypeId
      name
      slug
      data
      updatedAt
      lastEditedBy {
        id
        email
      }
    }
  }
`;

export const LIST_ASSETS = /* GraphQL */ `
  query NoteCmsListAssets($siteId: ID!, $query: String, $limit: Int, $offset: Int) {
    listAssets(siteId: $siteId, query: $query, limit: $limit, offset: $offset) {
      id
      siteId
      uploadedBy
      filename
      mimeType
      sizeBytes
      width
      height
      alt
      title
      focalPoint {
        x
        y
      }
      variants {
        original
        web
        thumbnail
        small
        medium
        large
        xlarge
      }
      createdAt
      updatedAt
    }
  }
`;
