import { describe, expect, it } from "vitest";
import { videoBitrate } from "./bitrate";

describe("videoBitrate", () => {
  it("quem faz a mímica manda melhor que os outros, na mesma mesa", () => {
    for (let n = 1; n <= 7; n++) expect(videoBitrate(true, n)).toBeGreaterThan(videoBitrate(false, n));
  });

  it("o total que cada um sobe não passa do orçamento (≈4 Mbps o mimer, ≈0,9 Mbps os outros)", () => {
    for (let n = 1; n <= 7; n++) {
      expect(videoBitrate(true, n) * n).toBeLessThanOrEqual(Math.max(4_000_000, 250_000 * n));
      expect(videoBitrate(false, n) * n).toBeLessThanOrEqual(Math.max(900_000, 60_000 * n));
    }
  });

  it("com poucas pessoas bate no teto; com a mesa cheia, reparte e não cai abaixo do mínimo", () => {
    expect(videoBitrate(true, 1)).toBe(1_200_000);
    expect(videoBitrate(true, 3)).toBe(1_200_000);
    expect(videoBitrate(true, 7)).toBe(571_428);
    expect(videoBitrate(false, 1)).toBe(300_000);
    expect(videoBitrate(false, 7)).toBe(128_571);
    expect(videoBitrate(true, 100)).toBe(250_000);
    expect(videoBitrate(false, 100)).toBe(60_000);
  });

  it("zero conexões é tratado como uma", () => {
    expect(videoBitrate(true, 0)).toBe(videoBitrate(true, 1));
  });

  it("quanto mais gente, nunca sobe", () => {
    for (const hq of [true, false]) for (let n = 1; n < 8; n++) expect(videoBitrate(hq, n + 1)).toBeLessThanOrEqual(videoBitrate(hq, n));
  });
});
