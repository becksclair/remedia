import { atom } from "jotai"

type RowSelectionState = Record<string, boolean>

export const tableRowSelectionAtom = atom<RowSelectionState>({})
