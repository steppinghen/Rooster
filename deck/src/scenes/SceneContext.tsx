import { createContext, useContext } from 'react';
import type { FamilySettings } from '../lib/familySettings';

/** What scenes need from the family: its settings (dog pin and names, winter dates). */
export const FamilySettingsContext = createContext<FamilySettings>({});

export function useFamilySettings(): FamilySettings {
  return useContext(FamilySettingsContext);
}
