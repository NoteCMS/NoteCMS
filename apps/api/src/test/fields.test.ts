import { describe, expect, it } from 'vitest';
import { validateEntryData } from '../domain/fields/validator.js';

describe('field validation', () => {
  it('supports nested repeater fields', () => {
    const fields = [
      {
        key: 'sections',
        label: 'Sections',
        type: 'repeater',
        config: {
          fields: [
            { key: 'title', label: 'Title', type: 'text', required: true },
            {
              key: 'items',
              label: 'Items',
              type: 'repeater',
              config: { fields: [{ key: 'name', label: 'Name', type: 'text', required: true }] },
            },
          ],
        },
      },
    ] as any;

    expect(() =>
      validateEntryData(fields, {
        sections: [{ title: 'A', items: [{ name: 'Nested' }] }],
      }),
    ).not.toThrow();
  });

  it('accepts both absolute and relative URLs for url fields', () => {
    const fields = [{ key: 'link', label: 'Link', type: 'url' }] as any;
    expect(() => validateEntryData(fields, { link: 'https://example.com/about' })).not.toThrow();
    expect(() => validateEntryData(fields, { link: '/about' })).not.toThrow();
  });

  it('rejects invalid url values for url fields', () => {
    const fields = [{ key: 'link', label: 'Link', type: 'url' }] as any;
    expect(() => validateEntryData(fields, { link: 'notaurl' })).toThrow();
  });

  it('does not require a field when conditional visibility is not satisfied', () => {
    const fields = [
      {
        key: 'toggle',
        label: 'Toggle',
        type: 'text',
      },
      {
        key: 'extra',
        label: 'Extra',
        type: 'text',
        required: true,
        config: {
          visibility: {
            relation: 'all',
            groups: [
              {
                relation: 'all',
                rules: [{ fieldKey: 'toggle', operator: 'equals', value: 'yes' }],
              },
            ],
          },
        },
      },
    ] as any;

    expect(() => validateEntryData(fields, { toggle: 'no' })).not.toThrow();
    expect(() => validateEntryData(fields, { toggle: 'no', extra: '' })).not.toThrow();
    expect(() => validateEntryData(fields, { toggle: 'yes' })).toThrow(/extra is required/);
    expect(() => validateEntryData(fields, { toggle: 'yes', extra: 'ok' })).not.toThrow();
  });

  it('applies conditional required inside repeater rows', () => {
    const fields = [
      {
        key: 'rows',
        label: 'Rows',
        type: 'repeater',
        config: {
          fields: [
            { key: 'kind', label: 'Kind', type: 'text' },
            {
              key: 'detail',
              label: 'Detail',
              type: 'text',
              required: true,
              config: {
                visibility: {
                  relation: 'all',
                  groups: [
                    {
                      relation: 'all',
                      rules: [{ fieldKey: 'kind', operator: 'equals', value: 'a' }],
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    ] as any;

    expect(() => validateEntryData(fields, { rows: [{ kind: 'b' }] })).not.toThrow();
    expect(() => validateEntryData(fields, { rows: [{ kind: 'a' }] })).toThrow(/detail is required/);
    expect(() => validateEntryData(fields, { rows: [{ kind: 'a', detail: 'x' }] })).not.toThrow();
  });
});
