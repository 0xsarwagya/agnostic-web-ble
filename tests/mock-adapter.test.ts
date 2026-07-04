import { describe, expect, it } from "vitest";

import { createMockAdapter } from "../src/adapters/mock";
import { isBluetoothError } from "../src/errors";
import { runAdapterContractTests } from "./adapter-contract";

const SERVICE = "0000180f-0000-1000-8000-00805f9b34fb";
const CHARACTERISTIC = "00002a19-0000-1000-8000-00805f9b34fb";

function factory() {
  return createMockAdapter({
    devices: [
      {
        id: "sensor-1",
        name: "Mock Sensor",
        services: [
          {
            uuid: SERVICE,
            characteristics: [
              {
                uuid: CHARACTERISTIC,
                value: new Uint8Array([72]),
                writable: true,
                notifies: true,
              },
            ],
          },
        ],
      },
    ],
  });
}

runAdapterContractTests({
  name: "mock",
  factory,
  serviceUuid: SERVICE,
  characteristicUuid: CHARACTERISTIC,
});

describe("mock adapter specifics", () => {
  it("delivers pushed notifications to subscribers", async () => {
    const adapter = factory();
    const device = await adapter.requestDevice({ acceptAllDevices: true });
    const connection = await device.connect();
    const characteristic = await (
      await connection.getPrimaryService(SERVICE)
    ).getCharacteristic(CHARACTERISTIC);

    const received: number[] = [];
    await characteristic.subscribe((value) => received.push(value.getUint8(0)));
    adapter.device("sensor-1").notify(CHARACTERISTIC, new Uint8Array([42]));
    expect(received).toEqual([42]);
  });

  it("records writes for assertion", async () => {
    const adapter = factory();
    const device = await adapter.requestDevice({ acceptAllDevices: true });
    const connection = await device.connect();
    const characteristic = await (
      await connection.getPrimaryService(SERVICE)
    ).getCharacteristic(CHARACTERISTIC);

    await characteristic.writeValue(new Uint8Array([7, 8]));
    expect([
      ...(adapter.device("sensor-1").lastWrite(CHARACTERISTIC) ?? []),
    ]).toEqual([7, 8]);
  });

  it("simulated disconnects notify listeners and fail subsequent reads", async () => {
    const adapter = factory();
    const device = await adapter.requestDevice({ acceptAllDevices: true });
    const connection = await device.connect();
    const characteristic = await (
      await connection.getPrimaryService(SERVICE)
    ).getCharacteristic(CHARACTERISTIC);

    let dropped = false;
    device.on("disconnect", () => {
      dropped = true;
    });
    adapter.device("sensor-1").simulateDisconnect();
    expect(dropped).toBe(true);

    const failure = await characteristic
      .readValue()
      .then(() => null)
      .catch((e: unknown) => e);
    expect(isBluetoothError(failure)).toBe(true);
    if (isBluetoothError(failure)) expect(failure.code).toBe("DISCONNECTED");
  });

  it("rejects unmatched filters with DEVICE_NOT_FOUND", async () => {
    const adapter = factory();
    const failure = await adapter
      .requestDevice({ filters: [{ name: "Nope" }] })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(isBluetoothError(failure)).toBe(true);
    if (isBluetoothError(failure)) expect(failure.code).toBe("DEVICE_NOT_FOUND");
  });
});
