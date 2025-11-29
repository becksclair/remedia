import { atom } from "jotai";
import type { CollectionKind } from "@/utils/media-helpers";

export interface Collection {
  id: string;
  kind: CollectionKind;
  name: string;
  slug: string;
}

export const collectionsAtom = atom<Record<string, Collection>>({});

export const upsertCollectionsAtom = atom(null, (get, set, input: Collection | Collection[]) => {
  const current = get(collectionsAtom);
  const list = Array.isArray(input) ? input : [input];

  if (list.length === 0) return;

  const next = { ...current };
  for (const col of list) {
    next[col.id] = col;
  }

  set(collectionsAtom, next);
});
