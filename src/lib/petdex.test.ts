import { describe, expect, it } from "vitest";
import type { PetdexPet } from "../types";
import { filterPetdexPets, getPetdexKinds, pagePetdexPets } from "./petdex";

const pets: PetdexPet[] = [
  {
    slug: "quiet-cat",
    displayName: "Quiet Cat",
    kind: "animal",
    submittedBy: "Nemo",
    spritesheetUrl: "https://assets.petdex.dev/cat.webp",
    spriteVersionNumber: 2,
    installed: false,
  },
  {
    slug: "orbit-bot",
    displayName: "Orbit Bot",
    kind: "mascot",
    submittedBy: "Ada",
    spritesheetUrl: "https://assets.petdex.dev/orbit.webp",
    spriteVersionNumber: 1,
    installed: true,
  },
];

describe("Petdex gallery helpers", () => {
  it("searches names, slugs, submitters, and kinds", () => {
    expect(filterPetdexPets(pets, "nemo", "")).toEqual([pets[0]]);
    expect(filterPetdexPets(pets, "orbit-bot", "")).toEqual([pets[1]]);
    expect(filterPetdexPets(pets, "", "animal")).toEqual([pets[0]]);
  });

  it("counts and sorts kind filters", () => {
    expect(getPetdexKinds([...pets, { ...pets[0], slug: "cat-two" }])).toEqual([
      { value: "animal", count: 2 },
      { value: "mascot", count: 1 },
    ]);
  });

  it("clamps pagination to a valid page", () => {
    expect(pagePetdexPets(pets, 9, 1)).toEqual({ page: 2, pageCount: 2, items: [pets[1]] });
    expect(pagePetdexPets([], 1)).toEqual({ page: 1, pageCount: 1, items: [] });
  });
});
