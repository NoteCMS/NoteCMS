import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

export type EntryEditorSecondary =
  | { kind: 'delete'; onClick: () => void }
  | { kind: 'cancel'; onClick: () => void };

export type EntryActionsMenuConfig = {
  visibility: {
    visible: boolean;
    disabled: boolean;
    onToggle: () => void;
  };
  onRequestDelete: () => void;
};

export type EntryDeleteConfirmationConfig = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export type EntryRevisionToolbarConfig = {
  loading: boolean;
  onOpen: () => void;
};

export type EntryEditorToolbarConfig = {
  onSave: () => void;
  saveDisabled: boolean;
  isSaving: boolean;
  secondary: EntryEditorSecondary;
  revisions?: EntryRevisionToolbarConfig;
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
