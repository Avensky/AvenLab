import { create } from 'zustand';
import type { WorldLayout } from '../document/layoutDocument';
import type { excavateRoute } from '../generation/excavation';

export type ExcavationPreview = ReturnType<typeof excavateRoute> & { base: WorldLayout };
export const useExcavationPreview = create<{ preview: ExcavationPreview | null }>(() => ({ preview: null }));
