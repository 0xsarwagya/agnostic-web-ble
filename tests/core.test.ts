import { describe, expect, it } from "vitest";

import { createBluetooth } from "../src/bluetooth";
import { createMockAdapter } from "../src/adapters/mock";
import { isBluetoothError } from "../src/errors";
import { normalizeUuid, uuidEquals } from "../src/uuid";

const emptyMock = (id: string, available: boolean) => {
  const adapter = createMockAdapter({ devices: [], available });
  return { ...adapter, id };
};

describe("adapter selection", () => {
  it("selects the first available adapter, deterministically", async () => {
    const bluetooth = createBluetooth({
      adapters: [emptyMock("a", false), emptyMock("b", true), emptyMock("c", true)],
    });
    expect(bluetooth.adapter).toBeNull();
    const adapter = await bluetooth.selectAdapter();
    expect(adapter.id).toBe("b");
    expect(bluetooth.adapter?.id).toBe("b");
  });

  it("fails with UNAVAILABLE when no adapter is available", async () => {
    const bluetooth = createBluetooth({ adapters: [emptyMock("a", false)] });
    const failure = await bluetooth
      .capabilities()
      .then(() => null)
      .catch((e: unknown) => e);
    expect(isBluetoothError(failure)).toBe(true);
    if (isBluetoothError(failure)) {
      expect(failure.code).toBe("UNAVAILABLE");
      expect(failure.message).toContain("a");
    }
  });

  it("requires at least one adapter", () => {
    expect(() => createBluetooth({ adapters: [] })).toThrowError(
      /at least one adapter/,
    );
  });
});

describe("uuid normalization", () => {
  it("normalizes short forms to the 128-bit base", () => {
    expect(normalizeUuid("180f")).toBe("0000180f-0000-1000-8000-00805f9b34fb");
    expect(normalizeUuid("0x180F")).toBe(
      "0000180f-0000-1000-8000-00805f9b34fb",
    );
    expect(normalizeUuid(0x2a19)).toBe(
      "00002a19-0000-1000-8000-00805f9b34fb",
    );
  });

  it("lowercases full uuids and compares equal across forms", () => {
    expect(uuidEquals("180F", "0000180f-0000-1000-8000-00805F9B34FB")).toBe(
      true,
    );
  });

  it("rejects invalid uuids", () => {
    expect(() => normalizeUuid("not-a-uuid")).toThrowError(/Invalid/);
    expect(() => normalizeUuid(-1)).toThrowError(/Invalid/);
  });
});
