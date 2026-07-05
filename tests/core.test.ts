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
      expect(failure.operation).toBe("capabilities");
      expect(failure.message).toContain("a");
      expect(failure.message).toContain(
        "https://oss.sarwagya.wtf/agnostic-web-ble/docs/compatibility",
      );
      expect(failure.message).toMatch(/\[[^\]]+\]$/);
    }
  });

  it("surfaces adapter reason when available", async () => {
    const bluetooth = createBluetooth({
      adapters: [
        createMockAdapter({
          devices: [],
          available: false,
          unavailableReason: "test-a",
        }),
      ],
    });
    try {
      await bluetooth.selectAdapter();
      expect.fail("should have thrown");
    } catch (err) {
      if (!isBluetoothError(err)) throw err;
      expect(err.message).toContain("test-a");
    }
  });

  it("selection is retriable after failure", async () => {
    let flip = false;
    const adapter = {
      id: "flipping",
      isAvailable: () => flip,
      capabilities: async () => ({
        requestDevice: true,
        notifications: true,
        writeWithoutResponse: true,
        requiresUserGesture: false,
      }),
      requestDevice: async () => {
        throw new Error("unused");
      },
    };
    const bluetooth = createBluetooth({ adapters: [adapter] });
    await expect(bluetooth.selectAdapter()).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    flip = true;
    await expect(bluetooth.selectAdapter()).resolves.toBe(adapter);
  });

  it("requires at least one adapter", () => {
    expect(() => createBluetooth({ adapters: [] })).toThrowError(
      /at least one adapter/,
    );
  });
});

describe("describeAvailability", () => {
  it("reports each candidate without triggering selection", async () => {
    const bluetooth = createBluetooth({
      adapters: [
        createMockAdapter({
          devices: [],
          available: false,
          unavailableReason: "nope",
        }),
        createMockAdapter({ devices: [] }),
      ],
    });
    const reports = await bluetooth.describeAvailability();
    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({ available: false, reason: "nope" });
    expect(reports[1]).toMatchObject({ available: true });
    expect(bluetooth.adapter).toBeNull();
  });

  it("falls back to isAvailable() for adapters without describeAvailability", async () => {
    const legacyAdapter = {
      id: "legacy",
      isAvailable: () => false,
      capabilities: async () => ({
        requestDevice: true,
        notifications: true,
        writeWithoutResponse: true,
        requiresUserGesture: false,
      }),
      requestDevice: async () => {
        throw new Error("unused");
      },
    };
    const bluetooth = createBluetooth({ adapters: [legacyAdapter] });
    const [report] = await bluetooth.describeAvailability();
    expect(report).toEqual({ adapterId: "legacy", available: false });
  });

  it("continues past adapters whose isAvailable throws", async () => {
    const bluetooth = createBluetooth({
      adapters: [
        {
          id: "throws",
          isAvailable: () => {
            throw new Error("boom");
          },
          capabilities: async () => ({
            requestDevice: true,
            notifications: true,
            writeWithoutResponse: true,
            requiresUserGesture: false,
          }),
          requestDevice: async () => {
            throw new Error("unused");
          },
        },
        createMockAdapter({ devices: [] }),
      ],
    });
    const adapter = await bluetooth.selectAdapter();
    expect(adapter.id).toBe("mock");
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
