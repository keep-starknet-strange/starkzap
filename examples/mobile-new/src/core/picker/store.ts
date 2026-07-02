import { create } from "zustand";

export interface PickerConfig {
  title?: string;
  options: { label: string; value: string }[];
  selected?: string;
  onSelect: (value: string) => void;
}

// Holds the config for the picker sheet route. Callbacks live here (not in
// route params, which must be serializable).
interface PickerStore {
  config: PickerConfig | null;
  open: (config: PickerConfig) => void;
  close: () => void;
}

export const usePickerStore = create<PickerStore>((set) => ({
  config: null,
  open: (config) => set({ config }),
  close: () => set({ config: null }),
}));
