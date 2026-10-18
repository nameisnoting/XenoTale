import { createContext } from 'react';
import type { Room } from '../domain/types';
import type { RisuResult } from '../engine/risu/types';
export const RisuContext = createContext<{
  busy: boolean;
  setActionBusy: (value: boolean) => void;
  commit: (result: RisuResult, expected: Room) => Promise<void>;
} | null>(null);
