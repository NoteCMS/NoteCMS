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
});
