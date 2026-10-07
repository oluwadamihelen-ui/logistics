import { describe, it, expect } from "vitest";
import { NG_LOCATIONS, NG_STATES, builtInCities, citiesFor } from "@/lib/locations/ng";
import { customCitiesByState } from "@/lib/locations/custom";
import { makeTenant } from "./helpers";

describe("state → city lists", () => {
  it("covers 36 states + FCT, each with cities, with no duplicates inside a state", () => {
    expect(NG_STATES).toHaveLength(37);
    for (const [state, cities] of Object.entries(NG_LOCATIONS)) {
      expect(cities.length, state).toBeGreaterThan(3);
      expect(new Set(cities.map((c) => c.toLowerCase())).size, state).toBe(cities.length);
    }
  });
  it("includes the areas the default delivery zones rely on", () => {
    for (const c of ["Ikeja", "Yaba", "Surulere", "Maryland", "Ikorodu", "Lekki", "Victoria Island", "Ikoyi", "Ajah"]) expect(builtInCities("Lagos")).toContain(c);
    for (const c of ["Abuja", "Wuse", "Garki", "Maitama"]) expect(builtInCities("FCT")).toContain(c);
  });
  it("matches states case-insensitively; unknown states have no cities", () => {
    expect(builtInCities("lagos")).toContain("Ikeja");
    expect(builtInCities("Atlantis")).toEqual([]);
  });
  it("merges company-added cities, de-duplicated (case-insensitive) and sorted", () => {
    const list = citiesFor("Lagos", ["Alpha Estate", "ikeja", "Zebra Close"]);
    expect(list.filter((c) => c.toLowerCase() === "ikeja")).toHaveLength(1);
    expect(list).toContain("Alpha Estate");
    expect([...list].sort((a, b) => a.localeCompare(b))).toEqual(list);
  });
  it("custom cities are per company", async () => {
    const A = await makeTenant("CityA"), B = await makeTenant("CityB");
    await A.svc.db.cityOption.create({ data: { state: "Lagos", name: "Gowon Estate" } as any });
    expect((await customCitiesByState(A.svc.db)).Lagos).toEqual(["Gowon Estate"]);
    expect(await customCitiesByState(B.svc.db)).toEqual({});
    await expect(A.svc.db.cityOption.create({ data: { state: "Lagos", name: "Gowon Estate" } as any })).rejects.toThrow(); // unique per company+state
  });
});
