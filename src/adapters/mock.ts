import { BluetoothError } from "../errors";
import { normalizeUuid, uuidEquals } from "../uuid";
import type {
  BluetoothAdapter,
  BluetoothCharacteristic,
  BluetoothConnection,
  BluetoothDevice,
  RequestDeviceOptions,
  Unsubscribe,
} from "../types";

const ADAPTER_ID = "mock";

export type MockCharacteristicSpec = {
  uuid: string;
  /** Initial value; reads return the current value. */
  value?: Uint8Array;
  writable?: boolean;
  notifies?: boolean;
};

export type MockServiceSpec = {
  uuid: string;
  characteristics: MockCharacteristicSpec[];
};

export type MockDeviceSpec = {
  id: string;
  name?: string;
  services: MockServiceSpec[];
};

export type MockAdapterOptions = {
  devices: MockDeviceSpec[];
  /** Report the adapter as unavailable to exercise selection fallbacks. */
  available?: boolean;
  /** Reason surfaced by describeAvailability() when `available` is false. */
  unavailableReason?: string;
};

/** Handle for driving a mock device from tests or demos. */
export type MockDeviceHandle = {
  /** Push a notification to subscribers of a characteristic. */
  notify(characteristicUuid: string, value: Uint8Array): void;
  /** Read what was last written to a characteristic. */
  lastWrite(characteristicUuid: string): Uint8Array | undefined;
  /** Simulate the device dropping the connection. */
  simulateDisconnect(): void;
};

export type MockAdapter = BluetoothAdapter & {
  /** Get the test handle for a device by id. */
  device(id: string): MockDeviceHandle;
};

type CharacteristicState = {
  spec: MockCharacteristicSpec;
  value: Uint8Array;
  lastWrite: Uint8Array | undefined;
  listeners: Set<(value: DataView) => void>;
};

type DeviceState = {
  spec: MockDeviceSpec;
  connected: boolean;
  characteristics: Map<string, CharacteristicState>;
  disconnectListeners: Set<() => void>;
};

function toDataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * A deterministic in-memory adapter for testing BLE flows without hardware.
 * Behaviour follows the same contract as every other adapter.
 */
export function createMockAdapter(options: MockAdapterOptions): MockAdapter {
  const states = new Map<string, DeviceState>();
  for (const spec of options.devices) {
    const characteristics = new Map<string, CharacteristicState>();
    for (const service of spec.services) {
      for (const c of service.characteristics) {
        characteristics.set(normalizeUuid(c.uuid), {
          spec: c,
          value: c.value ?? new Uint8Array(0),
          lastWrite: undefined,
          listeners: new Set(),
        });
      }
    }
    states.set(spec.id, {
      spec,
      connected: false,
      characteristics,
      disconnectListeners: new Set(),
    });
  }

  function buildDevice(state: DeviceState): BluetoothDevice {
    const buildCharacteristic = (
      c: CharacteristicState,
    ): BluetoothCharacteristic => ({
      uuid: normalizeUuid(c.spec.uuid),
      async readValue() {
        if (!state.connected) {
          throw new BluetoothError({
            code: "DISCONNECTED",
            message: "Cannot read: device is disconnected.",
            operation: "readValue",
            adapterId: ADAPTER_ID,
            recoverable: true,
          });
        }
        return toDataView(c.value);
      },
      async writeValue(value) {
        if (!state.connected) {
          throw new BluetoothError({
            code: "DISCONNECTED",
            message: "Cannot write: device is disconnected.",
            operation: "writeValue",
            adapterId: ADAPTER_ID,
            recoverable: true,
          });
        }
        if (!c.spec.writable) {
          throw new BluetoothError({
            code: "WRITE_FAILED",
            message: `Characteristic ${c.spec.uuid} is not writable.`,
            operation: "writeValue",
            adapterId: ADAPTER_ID,
          });
        }
        const bytes = ArrayBuffer.isView(value)
          ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
          : new Uint8Array(value);
        c.lastWrite = bytes.slice();
        c.value = bytes.slice();
      },
      async subscribe(listener) {
        if (!c.spec.notifies) {
          throw new BluetoothError({
            code: "SUBSCRIPTION_FAILED",
            message: `Characteristic ${c.spec.uuid} does not notify.`,
            operation: "subscribe",
            adapterId: ADAPTER_ID,
          });
        }
        c.listeners.add(listener);
        return () => c.listeners.delete(listener);
      },
    });

    const connection: BluetoothConnection = {
      get connected() {
        return state.connected;
      },
      async getPrimaryService(uuid) {
        const service = state.spec.services.find((s) =>
          uuidEquals(s.uuid, uuid),
        );
        if (!state.connected || !service) {
          throw new BluetoothError({
            code: state.connected ? "SERVICE_NOT_FOUND" : "DISCONNECTED",
            message: state.connected
              ? `Service ${uuid} not found on mock device "${state.spec.id}".`
              : "Cannot discover services: device is disconnected.",
            operation: "getPrimaryService",
            adapterId: ADAPTER_ID,
          });
        }
        return {
          uuid: normalizeUuid(service.uuid),
          async getCharacteristic(characteristicUuid) {
            const c = state.characteristics.get(
              normalizeUuid(characteristicUuid),
            );
            const inService = service.characteristics.some((sc) =>
              uuidEquals(sc.uuid, characteristicUuid),
            );
            if (!c || !inService) {
              throw new BluetoothError({
                code: "CHARACTERISTIC_NOT_FOUND",
                message: `Characteristic ${characteristicUuid} not found in service ${uuid}.`,
                operation: "getCharacteristic",
                adapterId: ADAPTER_ID,
              });
            }
            return buildCharacteristic(c);
          },
        };
      },
      async disconnect() {
        disconnect();
      },
    };

    const disconnect = () => {
      if (!state.connected) return;
      state.connected = false;
      for (const c of state.characteristics.values()) c.listeners.clear();
      for (const listener of state.disconnectListeners) listener();
    };

    return {
      id: state.spec.id,
      name: state.spec.name,
      get connected() {
        return state.connected;
      },
      async connect() {
        state.connected = true;
        return connection;
      },
      async disconnect() {
        disconnect();
      },
      on(event, listener): Unsubscribe {
        if (event !== "disconnect") return () => {};
        state.disconnectListeners.add(listener);
        return () => state.disconnectListeners.delete(listener);
      },
    };
  }

  return {
    id: ADAPTER_ID,
    isAvailable() {
      return options.available ?? true;
    },
    describeAvailability() {
      const available = options.available ?? true;
      if (available) return { available: true };
      return {
        available: false,
        reason:
          options.unavailableReason ??
          "Mock adapter was constructed with `available: false`.",
      };
    },
    async capabilities() {
      return {
        requestDevice: true,
        notifications: true,
        writeWithoutResponse: true,
        requiresUserGesture: false,
      };
    },
    async requestDevice(requestOptions: RequestDeviceOptions) {
      const matches = (state: DeviceState): boolean => {
        if (requestOptions.acceptAllDevices) return true;
        const filters = requestOptions.filters ?? [];
        if (filters.length === 0) return true;
        return filters.some((f) => {
          if (f.name && state.spec.name !== f.name) return false;
          if (f.namePrefix && !state.spec.name?.startsWith(f.namePrefix))
            return false;
          if (
            f.services &&
            !f.services.every((uuid) =>
              state.spec.services.some((s) => uuidEquals(s.uuid, uuid)),
            )
          )
            return false;
          return true;
        });
      };
      const state = [...states.values()].find(matches);
      if (!state) {
        throw new BluetoothError({
          code: "DEVICE_NOT_FOUND",
          message: "No mock device matches the given filters.",
          operation: "requestDevice",
          adapterId: ADAPTER_ID,
        });
      }
      return buildDevice(state);
    },
    device(id) {
      const state = states.get(id);
      if (!state) throw new Error(`Unknown mock device: ${id}`);
      return {
        notify(characteristicUuid, value) {
          const c = state.characteristics.get(normalizeUuid(characteristicUuid));
          if (!c || !state.connected) return;
          c.value = value.slice();
          for (const listener of c.listeners) listener(toDataView(value));
        },
        lastWrite(characteristicUuid) {
          return state.characteristics.get(normalizeUuid(characteristicUuid))
            ?.lastWrite;
        },
        simulateDisconnect() {
          if (!state.connected) return;
          state.connected = false;
          for (const c of state.characteristics.values()) c.listeners.clear();
          for (const listener of state.disconnectListeners) listener();
        },
      };
    },
  };
}
