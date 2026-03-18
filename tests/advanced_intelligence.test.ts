import { expect, test, describe } from "bun:test";
import { detectLanguage } from "../utils/content";

describe("Advanced Content Intelligence", () => {
  test("detectLanguage should identify major languages", () => {
    const en = "The quick brown fox jumps over the lazy dog";
    const es = "El veloz zorro marrón salta sobre el perro perezoso";
    const fr = "Le renard brun rapide saute par-dessus le chien paresseux";

    expect(detectLanguage(en)).toBe('English');
    expect(detectLanguage(es)).toBe('Spanish');
    expect(detectLanguage(fr)).toBe('French');
  });

  test("detectLanguage should default to English for low confidence", () => {
    expect(detectLanguage("XYZ ABC 123")).toBe('English');
  });
});
