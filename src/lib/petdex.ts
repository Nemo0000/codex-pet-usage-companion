import type { PetdexPet } from "../types";

export const PETDEX_PAGE_SIZE = 8;

export interface PetdexKindOption {
  value: string;
  count: number;
}

export function getPetdexKinds(pets: PetdexPet[]): PetdexKindOption[] {
  const counts = new Map<string, number>();
  for (const pet of pets) {
    const kind = pet.kind.trim().toLowerCase();
    if (!kind) continue;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

export function filterPetdexPets(pets: PetdexPet[], query: string, kind: string): PetdexPet[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const normalizedKind = kind.trim().toLocaleLowerCase();
  return pets.filter((pet) => {
    if (normalizedKind && pet.kind.toLocaleLowerCase() !== normalizedKind) return false;
    if (!normalizedQuery) return true;
    return [pet.displayName, pet.slug, pet.submittedBy, pet.kind]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
}

export function pagePetdexPets(
  pets: PetdexPet[],
  page: number,
  pageSize = PETDEX_PAGE_SIZE,
): { page: number; pageCount: number; items: PetdexPet[] } {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(pets.length / safePageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page)), pageCount);
  const start = (safePage - 1) * safePageSize;
  return {
    page: safePage,
    pageCount,
    items: pets.slice(start, start + safePageSize),
  };
}
