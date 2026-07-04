import { BluetoothError, type BluetoothOperation } from "../errors";
import { normalizeUuid } from "../uuid";
import type {
  BluetoothAdapter,
  BluetoothCharacteristic,
  BluetoothConnection,
  BluetoothDevice,
  BluetoothService,
  RequestDeviceOptions,
  Unsubscribe,
} from "../types";

const ADAPTER_ID = "native-web-bluetooth";

type NativeDevice = globalThis.BluetoothDevice;
type NativeServer = globalThis.BluetoothRemoteGATTServer;
type NativeService = globalThis.BluetoothRemoteGATTService;
type NativeCharacteristic = globalThis.BluetoothRemoteGATTCharacteristic;

function wrapError(
  cause: unknown,
  operation: BluetoothOperation,
  fallbackCode:
    | "READ_FAILED"
    | "WRITE_FAILED"
    | "SUBSCRIPTION_FAILED"
    | "CONNECTION_FAILED"
    | "ADAPTER_ERROR",
): BluetoothError {
  if (cause instanceof BluetoothError) return cause;
  const name = cause instanceof DOMException ? cause.name : "";
  const message =
    cause instanceof Error ? cause.message : "Unknown Web Bluetooth failure";
  const code =
    name === "NotFoundError"
      ? "DEVICE_NOT_FOUND"
      : name === "SecurityError"
        ? "PERMISSION_DENIED"
        : name === "NotAllowedError"
          ? "PERMISSION_DENIED"
          : name === "NetworkError"
            ? "CONNECTION_FAILED"
            : name === "InvalidStateError"
              ? "DISCONNECTED"
              : name === "AbortError"
                ? "TIMEOUT"
                : fallbackCode;
  return new BluetoothError({
    code,
    message,
    operation,
    adapterId: ADAPTER_ID,
    recoverable: code === "CONNECTION_FAILED" || code === "DISCONNECTED",
    cause,
  });
}

function wrapCharacteristic(
  native: NativeCharacteristic,
): BluetoothCharacteristic {
  return {
    uuid: normalizeUuid(native.uuid),
    async readValue() {
      try {
        return await native.readValue();
      } catch (cause) {
        throw wrapError(cause, "readValue", "READ_FAILED");
      }
    },
    async writeValue(value, options = {}) {
      try {
        if (options.withoutResponse) {
          await native.writeValueWithoutResponse(value);
        } else {
          await native.writeValueWithResponse(value);
        }
      } catch (cause) {
        throw wrapError(cause, "writeValue", "WRITE_FAILED");
      }
    },
    async subscribe(listener) {
      const onChange = () => {
        if (native.value) listener(native.value);
      };
      try {
        native.addEventListener("characteristicvaluechanged", onChange);
        await native.startNotifications();
      } catch (cause) {
        native.removeEventListener("characteristicvaluechanged", onChange);
        throw wrapError(cause, "subscribe", "SUBSCRIPTION_FAILED");
      }
      return () => {
        native.removeEventListener("characteristicvaluechanged", onChange);
        native.stopNotifications().catch(() => {
          /* device may already be gone; unsubscribing is best-effort */
        });
      };
    },
  };
}

function wrapService(native: NativeService): BluetoothService {
  return {
    uuid: normalizeUuid(native.uuid),
    async getCharacteristic(uuid) {
      try {
        return wrapCharacteristic(
          await native.getCharacteristic(normalizeUuid(uuid)),
        );
      } catch (cause) {
        const error = wrapError(cause, "getCharacteristic", "ADAPTER_ERROR");
        throw error.code === "DEVICE_NOT_FOUND"
          ? new BluetoothError({
              code: "CHARACTERISTIC_NOT_FOUND",
              message: `Characteristic ${uuid} not found.`,
              operation: "getCharacteristic",
              adapterId: ADAPTER_ID,
              cause,
            })
          : error;
      }
    },
  };
}

function wrapConnection(server: NativeServer): BluetoothConnection {
  return {
    get connected() {
      return server.connected;
    },
    async getPrimaryService(uuid) {
      try {
        return wrapService(
          await server.getPrimaryService(normalizeUuid(uuid)),
        );
      } catch (cause) {
        const error = wrapError(cause, "getPrimaryService", "ADAPTER_ERROR");
        throw error.code === "DEVICE_NOT_FOUND"
          ? new BluetoothError({
              code: "SERVICE_NOT_FOUND",
              message: `Service ${uuid} not found. Did you list it in filters or optionalServices?`,
              operation: "getPrimaryService",
              adapterId: ADAPTER_ID,
              cause,
            })
          : error;
      }
    },
    async disconnect() {
      server.disconnect();
    },
  };
}

function wrapDevice(native: NativeDevice): BluetoothDevice {
  return {
    id: native.id,
    name: native.name ?? undefined,
    get connected() {
      return native.gatt?.connected ?? false;
    },
    async connect() {
      if (!native.gatt) {
        throw new BluetoothError({
          code: "CONNECTION_FAILED",
          message: "This device does not expose a GATT server.",
          operation: "connect",
          adapterId: ADAPTER_ID,
        });
      }
      try {
        return wrapConnection(await native.gatt.connect());
      } catch (cause) {
        throw wrapError(cause, "connect", "CONNECTION_FAILED");
      }
    },
    async disconnect() {
      native.gatt?.disconnect();
    },
    on(event, listener): Unsubscribe {
      if (event !== "disconnect") return () => {};
      const handler = () => listener();
      native.addEventListener("gattserverdisconnected", handler);
      return () =>
        native.removeEventListener("gattserverdisconnected", handler);
    },
  };
}

/** Adapter backed by the browser's native Web Bluetooth implementation. */
export function nativeWebBluetoothAdapter(): BluetoothAdapter {
  return {
    id: ADAPTER_ID,
    isAvailable() {
      return (
        typeof navigator !== "undefined" && navigator.bluetooth !== undefined
      );
    },
    async capabilities() {
      return {
        requestDevice: true,
        notifications: true,
        writeWithoutResponse: true,
        requiresUserGesture: true,
      };
    },
    async requestDevice(options: RequestDeviceOptions) {
      if (typeof navigator === "undefined" || !navigator.bluetooth) {
        throw new BluetoothError({
          code: "UNSUPPORTED",
          message: "Web Bluetooth is not available in this runtime.",
          operation: "requestDevice",
          adapterId: ADAPTER_ID,
        });
      }
      const filters = options.filters?.map((f) => ({
        ...(f.services ? { services: f.services.map(normalizeUuid) } : {}),
        ...(f.name ? { name: f.name } : {}),
        ...(f.namePrefix ? { namePrefix: f.namePrefix } : {}),
      }));
      try {
        const native = await navigator.bluetooth.requestDevice({
          ...(options.acceptAllDevices
            ? { acceptAllDevices: true }
            : { filters: filters ?? [] }),
          ...(options.optionalServices
            ? { optionalServices: options.optionalServices.map(normalizeUuid) }
            : {}),
        });
        return wrapDevice(native);
      } catch (cause) {
        throw wrapError(cause, "requestDevice", "ADAPTER_ERROR");
      }
    },
  };
}
