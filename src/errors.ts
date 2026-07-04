export type BluetoothErrorCode =
  | "UNSUPPORTED"
  | "UNAVAILABLE"
  | "PERMISSION_DENIED"
  | "DEVICE_NOT_FOUND"
  | "CONNECTION_FAILED"
  | "DISCONNECTED"
  | "SERVICE_NOT_FOUND"
  | "CHARACTERISTIC_NOT_FOUND"
  | "READ_FAILED"
  | "WRITE_FAILED"
  | "SUBSCRIPTION_FAILED"
  | "TIMEOUT"
  | "ADAPTER_ERROR"
  | "UNKNOWN";

export type BluetoothOperation =
  | "requestDevice"
  | "connect"
  | "disconnect"
  | "getPrimaryService"
  | "getCharacteristic"
  | "readValue"
  | "writeValue"
  | "subscribe"
  | "unsubscribe"
  | "capabilities";

export class BluetoothError extends Error {
  readonly code: BluetoothErrorCode;
  readonly operation: BluetoothOperation;
  readonly adapterId: string | undefined;
  readonly recoverable: boolean;

  constructor(options: {
    code: BluetoothErrorCode;
    message: string;
    operation: BluetoothOperation;
    adapterId?: string;
    recoverable?: boolean;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "BluetoothError";
    this.code = options.code;
    this.operation = options.operation;
    this.adapterId = options.adapterId;
    this.recoverable = options.recoverable ?? false;
  }
}

export function isBluetoothError(value: unknown): value is BluetoothError {
  return value instanceof BluetoothError;
}
