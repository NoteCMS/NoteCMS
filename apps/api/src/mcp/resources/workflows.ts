export const WORKFLOWS_MARKDOWN = `# Note CMS — agent workflows

Copy-paste patterns for common tasks. Adjust ids from **your** \`notecms_list_content_types\` / list tools.

---

## 1. Orient in a new workspace

\`\`\`
1. notecms_api_key_info
2. notecms_list_content_types
3. notecms_get_site_settings
4. notecms_list_entries (per contentTypeId you care about)
\`\`\`

---

## 2. Add a new page (draft → publish)

\`\`\`
1. notecms_list_content_types → find Pages type: contentTypeId, fields, options.hasSlug
2. (optional) notecms_upload_asset → hero image → assetId
3. notecms_create_entry {
     contentTypeId, name, slug (if hasSlug),
     data: { …field keys from schema… },
     metaTitle?, metaDescription? (when type has meta taxonomy)
   }
4. notecms_publish_entry { id: "<new-entry-id>" }
\`\`\`

Verify: \`notecms_get_entry\` → \`lifecycleStatus: "published"\`.

---

## 3. Update live content safely

**Required agent rule — never publish blind after an update.**

\`\`\`
1. notecms_get_entry { id }                     # read current draft data (+ meta)
2. notecms_update_entry { id, data: { …merged changes… } }   # only send fields you change
3. notecms_get_entry { id }                     # verify draft again (or export bundle)
4. Assert data.blocks.length > 0 when the page had body content
5. notecms_publish_entry { id }
6. Check response.verification.blockCount and publishedDataHash
\`\`\`

Published entries with draft edits show \`hasUnpublishedChanges: true\` after step 2.

**Never** send \`data: null\` or partial \`data\` without merging from step 1 — the API rejects null data and publish blocks empty drafts when live content exists.

---

## 4. Replace hero image

\`\`\`
1. notecms_upload_asset { fileBase64, filename, mimeType, focalX?, focalY? }
2. notecms_get_entry { id }
3. notecms_update_entry { id, data: { …existing data…, hero: { assetId: "<new-id>", variant: "large" } } }
4. notecms_publish_entry { id }
\`\`\`

---

## 5. Add a content type (schema)

Only when the project needs a new collection — prefer using existing types.

\`\`\`
notecms_create_content_type {
  name: "Blog posts",
  slug: "posts",
  fields: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "body", label: "Body", type: "wysiwyg", required: true },
    { key: "cover", label: "Cover", type: "image" }
  ],
  options: {
    hasSlug: true,
    showInSidebar: true,
    permalinkTemplate: "/blog/:slug"
  }
}
\`\`\`

Then create entries with the returned type \`id\`.

---

## 6. Wire navigation (menu)

\`\`\`
1. notecms_list_entries → collect entry ids for menu targets
2. notecms_get_site_settings → read current menuEntries
3. notecms_update_site_settings {
     input: {
       menuEntries: { "main-0": "<entryId>", "main-1": "<entryId>" }
     }
   }
\`\`\`

Slot keys follow pattern \`main-0\`, \`main-1\`, … (see existing settings). Wrong ids break menu links.

---

## 7. Incremental sync (read-only agent)

For a static site builder polling for changes:

\`\`\`
notecms_list_entries {
  contentTypeId,
  updatedSince: "<last-sync-iso>",
  limit: 200
}
\`\`\`

Use read-only API key. Track max \`updatedAt\` from results.

---

## 8. Staging content type export (backup)

\`\`\`
notecms_export_site_bundle {
  siteSettings: false,
  contentTypes: true,
  contentTypeSlugsForEntries: ["pages", "posts"],
  assets: true
}
\`\`\`

Save JSON off-site. **Do not** import to production without explicit user approval.

---

## When things fail

| Error | Likely cause |
|-------|----------------|
| \`Access denied: API key lacks scope\` | Add scope in dashboard or use a different key |
| \`Unauthorized\` / acting user | Write key needs \`actingUserId\` (site member) |
| \`siteId does not match\` | Remove \`siteId\` or pass the key’s site |
| \`MCP is not available\` | \`mcpEnabled: false\` on site settings |
| \`Field X is required\` | Fix \`data\` shape — see \`note-cms://docs/field-types\` |
| \`Another published entry already uses this slug\` | Pick a unique slug or unpublish the other entry (GraphQL) |
| \`Refusing to publish: draft data is empty\` | Re-fetch entry, merge full \`data\`, verify blocks, then publish |
| \`Cannot set entry data to null\` | Omit \`data\` or send merged content — never \`data: null\` |
`;
