import { describe, expect, it } from "vitest";

import { isBluetoothError } from "../src/errors";
import type { BluetoothAdapter } from "../src/types";

/**
 * Behavioural contract every adapter must pass. An adapter is not valid
 * merely because TypeScript says it implements the interface.
 *
 * The factory must return an adapter exposing at least one connectable
 * device with a readable, writable, notifying characteristic in service
 * `serviceUuid` / characteristic `characteristicUuid`.
 */
export function runAdapterContractTests(options: {
  name: string;
  factory: () => BluetoothAdapter;
  serviceUuid: string;
  characteristicUuid: string;
}) {
  const { name, factory, serviceUuid, characteristicUuid } = options;

  describe(`adapter contract: ${name}`, () => {
    it("reports a stable id", () => {
      const adapter = factory();
      expect(adapter.id).toBeTruthy();
      expect(factory().id).toBe(adapter.id);
    });

    it("reports capabilities", async () => {
      const capabilities = await factory().capabilities();
      expect(typeof capabilities.requestDevice).toBe("boolean");
      expect(typeof capabilities.notifications).toBe("boolean");
      expect(typeof capabilities.writeWithoutResponse).toBe("boolean");
      expect(typeof capabilities.requiresUserGesture).toBe("boolean");
    });

    it("completes the full journey: request → connect → read → write → subscribe → disconnect", async () => {
      const adapter = factory();
      const device = await adapter.requestDevice({
        filters: [{ services: [serviceUuid] }],
      });
      expect(device.id).toBeTruthy();
      expect(device.connected).toBe(false);

      const connection = await device.connect();
      expect(device.connected).toBe(true);

      const service = await connection.getPrimaryService(serviceUuid);
      const characteristic =
        await service.getCharacteristic(characteristicUuid);

      const value = await characteristic.readValue();
      expect(value).toBeInstanceOf(DataView);

      await characteristic.writeValue(new Uint8Array([1, 2, 3]));

      const received: DataView[] = [];
      const unsubscribe = await characteristic.subscribe((v) =>
        received.push(v),
      );
      expect(typeof unsubscribe).toBe("function");
      unsubscribe();

      await device.disconnect();
      expect(device.connected).toBe(false);
    });

    it("fires the disconnect event exactly once per registration", async () => {
      const adapter = factory();
      const device = await adapter.requestDevice({
        filters: [{ services: [serviceUuid] }],
      });
      await device.connect();
      let calls = 0;
      const off = device.on("disconnect", () => {
        calls += 1;
      });
      await device.disconnect();
      expect(calls).toBe(1);
      off();
    });

    it("throws a BluetoothError with SERVICE_NOT_FOUND for unknown services", async () => {
      const adapter = factory();
      const device = await adapter.requestDevice({
        filters: [{ services: [serviceUuid] }],
      });
      const connection = await device.connect();
      const failure = await connection
        .getPrimaryService("0000dead-0000-1000-8000-00805f9b34fb")
        .then(() => null)
        .catch((e: unknown) => e);
      expect(isBluetoothError(failure)).toBe(true);
      if (isBluetoothError(failure)) {
        expect(failure.code).toBe("SERVICE_NOT_FOUND");
        expect(failure.operation).toBe("getPrimaryService");
      }
    });
  });
}
