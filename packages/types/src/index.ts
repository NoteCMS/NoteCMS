export type Role = 'owner' | 'editor' | 'viewer';

/** Entry visibility for API keys and static snapshots (see CMS lifecycle docs). */
export type EntryLifecycleStatus = 'draft' | 'published';

export type FieldDefinition = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'select' | 'repeater' | 'image' | 'entries';
  required?: boolean;
  config?: Record<string, unknown>;
};
