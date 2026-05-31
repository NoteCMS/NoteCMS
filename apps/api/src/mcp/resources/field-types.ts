export const FIELD_TYPES_MARKDOWN = `# Note CMS — field types & entry \`data\`

Entry **\`data\`** is a JSON object: keys = field \`key\` from the content type \`fields\` array. Always load the schema with \`notecms_list_content_types\` before writing.

---

## Scalar fields

| Type | Stored value | Example |
|------|--------------|---------|
| \`text\` | string | \`"Hello"\` |
| \`textarea\` | string (plain) | \`"Long text…"\` |
| \`wysiwyg\` | string (HTML) | \`"<p>Rich <strong>text</strong></p>"\` |
| \`url\` | string | \`"https://example.com"\` or \`"/about"\` (site-relative ok) |
| \`number\` | number | \`42\` |
| \`boolean\` | boolean | \`true\` |
| \`date\` | string | ISO date string |
| \`select\` | string | Must be one of \`config.options[]\` |

---

## \`image\`

Object referencing a media library asset:

\`\`\`json
{
  "hero": {
    "assetId": "674a1b2c3d4e5f6789012345",
    "variant": "large"
  }
}
\`\`\`

- \`assetId\` (required): from \`notecms_upload_asset\` or \`notecms_list_assets\`.
- \`variant\` (optional): \`original\` | \`web\` | \`thumbnail\` | \`small\` | \`medium\` | \`large\` | \`xlarge\`. Default behavior on frontend uses \`large\` / \`web\`.

Upload flow: **upload asset → copy \`id\` → set \`data.hero.assetId\` → update entry → publish**.

---

## \`repeater\`

Array of objects; nested shape from \`field.config.fields\` (same field definition format).

\`\`\`json
{
  "blocks": [
    { "title": "Block 1", "body": "…" },
    { "title": "Block 2", "body": "…" }
  ]
}
\`\`\`

Each array item is validated against nested fields. Empty array is valid unless the repeater is required.

**CTA repeater variant:** \`config.contentTypeId\` instead of nested fields — stores linked entries (advanced; prefer manual \`entries\` field for clarity).

---

## \`entries\` (entry picker)

References other entries by **id** string.

**Manual mode** (default):

\`\`\`json
{
  "featuredProjects": ["674a…", "674b…"]
}
\`

- Array of entry ids from the content type in \`config.contentTypeId\`.
- Max items: \`config.maxItems\` (default 10, max 50).

**Latest mode** (\`config.mode: "latest"\`):

- Server resolves entries at **read** time — stored \`data\` should be **omitted** or \`[]\`.
- Do not write manual ids into latest-mode fields.

---

## Visibility (conditional fields)

Fields may have \`config.visibility\` (rules on other field values). Hidden fields are not required even when \`required: true\`. If validation fails unexpectedly, check sibling field values that control visibility.

---

## Slugs & names

| Field | Notes |
|-------|-------|
| \`name\` | Display title (top-level on entry, not inside \`data\`). |
| \`slug\` | URL segment — only when content type \`options.hasSlug\` is true. Lowercase, unique per type when published. |
| \`metaTitle\` / \`metaDescription\` | SEO fields (top-level on entry, **not** inside \`data\`). Enabled when \`options.metaTaxonomy.enabled\` is true, or always for slug \`pages\`. Use MCP args \`metaTitle\` / \`metaDescription\` or GraphQL \`meta { title description }\`. |

---

## Example: create a page entry

After \`notecms_list_content_types\` returns a Pages type:

\`\`\`json
{
  "contentTypeId": "<pages-type-id>",
  "name": "About us",
  "slug": "about",
  "data": {
    "headline": "About us",
    "body": "<p>We build things.</p>",
    "hero": { "assetId": "<asset-id>", "variant": "large" }
  }
}
\`\`\`

Then \`notecms_publish_entry\` with the returned entry \`id\`.

---

## Validation errors

Messages like \`Field hero requires assetId\` or \`Field status must match configured option\` mean \`data\` does not match the schema. Re-read \`fields\` on the content type and fix types/shapes — do not retry blindly.
`;
