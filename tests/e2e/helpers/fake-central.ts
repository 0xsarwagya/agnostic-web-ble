import type { CDPSession, Page } from "@playwright/test";

/**
 * CDP BluetoothEmulation wrapper.
 *
 * Emulates a preconnected peripheral advertising the standard Battery
 * Service (0x180f) with a Battery Level characteristic (0x2a19) that
 * responds to reads with 0x64 (100%).
 *
 * Chromium-only. Callers must gate on browserName === "chromium".
 *
 * Reference: https://chromedevtools.github.io/devtools-protocol/tot/BluetoothEmulation/
 *
 * NOTE: the exact event names and response methods in the BluetoothEmulation
 * CDP domain have shifted across Chromium releases. If your Playwright's
 * bundled Chromium drifts from what's implemented here, pin @playwright/test
 * to a known-good version and update this helper accordingly.
 */

export const BATTERY_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";
export const BATTERY_LEVEL_UUID = "00002a19-0000-1000-8000-00805f9b34fb";
export const FAKE_PERIPHERAL_ADDRESS = "09:09:09:09:09:09";
export const FAKE_PERIPHERAL_NAME = "Fake Battery Device";

const GATT_SUCCESS = 0;
const BATTERY_LEVEL_PERCENT = 0x64;

export interface FakeCentral {
  readonly session: CDPSession;
  autoAcceptChooser(): void;
  pushNotification(value: Uint8Array): Promise<void>;
  teardown(): Promise<void>;
}

export async function installFakeCentral(page: Page): Promise<FakeCentral> {
  const context = page.context();
  const session = await context.newCDPSession(page);

  await session.send("BluetoothEmulation.enable" as never, {
    state: "powered-on",
    leSupported: true,
  } as never);

  await session.send(
    "BluetoothEmulation.simulatePreconnectedPeripheral" as never,
    {
      address: FAKE_PERIPHERAL_ADDRESS,
      name: FAKE_PERIPHERAL_NAME,
      manufacturerData: [],
      knownServiceUuids: [BATTERY_SERVICE_UUID],
    } as never,
  );

  const addService = (await session.send(
    "BluetoothEmulation.addService" as never,
    {
      address: FAKE_PERIPHERAL_ADDRESS,
      serviceUuid: BATTERY_SERVICE_UUID,
    } as never,
  )) as { serviceId: string };

  const addChar = (await session.send(
    "BluetoothEmulation.addCharacteristic" as never,
    {
      serviceId: addService.serviceId,
      characteristicUuid: BATTERY_LEVEL_UUID,
      properties: {
        broadcast: false,
        read: true,
        writeWithoutResponse: false,
        write: false,
        notify: true,
        indicate: false,
        authenticatedSignedWrites: false,
        extendedProperties: false,
      },
    } as never,
  )) as { characteristicId: string };

  const characteristicId = addChar.characteristicId;

  session.on(
    "BluetoothEmulation.characteristicOperationReceived" as never,
    (async (evt: { type: string; characteristicId: string }) => {
      if (evt.characteristicId !== characteristicId) return;
      if (evt.type === "read") {
        await session.send(
          "BluetoothEmulation.simulateCharacteristicOperationResponse" as never,
          {
            characteristicId,
            type: "read",
            code: GATT_SUCCESS,
            data: base64(new Uint8Array([BATTERY_LEVEL_PERCENT])),
          } as never,
        );
      } else if (
        evt.type === "subscribe-to-notifications" ||
        evt.type === "unsubscribe-from-notifications"
      ) {
        await session.send(
          "BluetoothEmulation.simulateCharacteristicOperationResponse" as never,
          {
            characteristicId,
            type: evt.type,
            code: GATT_SUCCESS,
            data: "",
          } as never,
        );
      }
    }) as never,
  );

  session.on(
    "BluetoothEmulation.gattOperationReceived" as never,
    (async (evt: { type: string; address: string }) => {
      if (evt.address !== FAKE_PERIPHERAL_ADDRESS) return;
      await session.send(
        "BluetoothEmulation.simulateGATTOperationResponse" as never,
        {
          address: FAKE_PERIPHERAL_ADDRESS,
          type: evt.type,
          code: GATT_SUCCESS,
        } as never,
      );
    }) as never,
  );

  return {
    session,
    autoAcceptChooser() {
      void session.send("DeviceAccess.enable" as never).catch(() => {});
      session.on(
        "DeviceAccess.deviceRequestPrompted" as never,
        (async (evt: {
          id: string;
          devices: Array<{ id: string; name: string }>;
        }) => {
          const match =
            evt.devices.find((d) => d.name === FAKE_PERIPHERAL_NAME) ??
            evt.devices[0];
          if (!match) {
            await session.send("DeviceAccess.cancelPrompt" as never, {
              id: evt.id,
            } as never);
            return;
          }
          await session.send("DeviceAccess.selectPrompt" as never, {
            id: evt.id,
            deviceId: match.id,
          } as never);
        }) as never,
      );
    },
    async pushNotification(value: Uint8Array) {
      await session.send(
        "BluetoothEmulation.simulateCharacteristicOperationResponse" as never,
        {
          characteristicId,
          type: "read",
          code: GATT_SUCCESS,
          data: base64(value),
        } as never,
      );
    },
    async teardown() {
      try {
        await session.send(
          "BluetoothEmulation.simulateGATTDisconnection" as never,
          { address: FAKE_PERIPHERAL_ADDRESS } as never,
        );
      } catch {
        /* peripheral may already be gone */
      }
      try {
        await session.send("BluetoothEmulation.disable" as never);
      } catch {
        /* domain may already be disabled */
      }
      await session.detach().catch(() => {});
    },
  };
}

function base64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
