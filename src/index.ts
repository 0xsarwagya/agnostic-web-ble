export { createBluetooth } from "./bluetooth";
export type {
  AdapterAvailabilityReport,
  Bluetooth,
  CreateBluetoothOptions,
} from "./bluetooth";
export { BluetoothError, isBluetoothError } from "./errors";
export type { BluetoothErrorCode, BluetoothOperation } from "./errors";
export { normalizeUuid, uuidEquals } from "./uuid";
export type {
  AdapterAvailability,
  BluetoothAdapter,
  BluetoothCapabilities,
  BluetoothCharacteristic,
  BluetoothConnection,
  BluetoothDevice,
  BluetoothService,
  DeviceFilter,
  RequestDeviceOptions,
  Unsubscribe,
} from "./types";
