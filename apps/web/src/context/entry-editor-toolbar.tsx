import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

export type EntryEditorSecondary =
  | { kind: 'delete'; onClick: () => void }
  | { kind: 'cancel'; onClick: () => void };

export type EntryActionsMenuConfig = {
  revisionsLoading: boolean;
  onOpenRevisions: () => void;
  /** Single publish-related control (publish, publish updates, or unpublish). */
  publishItem: {
    label: string;
    disabled: boolean;
    onSelect: () => void;
  };
  onRequestDelete: () => void;
};

export type EntryDeleteConfirmationConfig = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export type EntryEditorToolbarConfig = {
  onSave: () => void;
  saveDisabled: boolean;
  isSaving: boolean;
  secondary: EntryEditorSecondary;
  /** Existing non-deleted entry: settings menu with revisions, publish cycle, delete. */
  entryActionsMenu?: EntryActionsMenuConfig;
  deleteConfirmation?: EntryDeleteConfirmationConfig;
};

const EntryEditorToolbarStateContext = createContext<EntryEditorToolbarConfig | null>(null);
const EntryEditorToolbarSetterContext = createContext<Dispatch<SetStateAction<EntryEditorToolbarConfig | null>> | null>(
  null,
);

export function EntryEditorToolbarProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<EntryEditorToolbarConfig | null>(null);
  return (
    <EntryEditorToolbarSetterContext.Provider value={setConfig}>
      <EntryEditorToolbarStateContext.Provider value={config}>{children}</EntryEditorToolbarStateContext.Provider>
    </EntryEditorToolbarSetterContext.Provider>
  );
}

/** Stable setter — safe to list in effect dependency arrays. */
export function useEntryEditorToolbarSetter() {
  const set = useContext(EntryEditorToolbarSetterContext);
  if (!set) throw new Error('EntryEditorToolbarProvider is missing');
  return set;
}

export function useEntryEditorToolbarState() {
  return useContext(EntryEditorToolbarStateContext);
}
