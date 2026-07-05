export type Unsubscribe = () => void;

/** Honest capability report for the selected adapter in the current runtime. */
export type BluetoothCapabilities = {
  requestDevice: boolean;
  notifications: boolean;
  writeWithoutResponse: boolean;
  /** true when device access requires a user gesture (e.g. a click). */
  requiresUserGesture: boolean;
};

export type DeviceFilter = {
  services?: string[];
  name?: string;
  namePrefix?: string;
};

export type RequestDeviceOptions = {
  filters?: DeviceFilter[];
  optionalServices?: string[];
  acceptAllDevices?: boolean;
  signal?: AbortSignal;
};

export interface BluetoothCharacteristic {
  readonly uuid: string;
  readValue(): Promise<DataView>;
  writeValue(
    value: BufferSource,
    options?: { withoutResponse?: boolean },
  ): Promise<void>;
  subscribe(listener: (value: DataView) => void): Promise<Unsubscribe>;
}

export interface BluetoothService {
  readonly uuid: string;
  getCharacteristic(uuid: string): Promise<BluetoothCharacteristic>;
}

export interface BluetoothConnection {
  readonly connected: boolean;
  getPrimaryService(uuid: string): Promise<BluetoothService>;
  disconnect(): Promise<void>;
}

export interface BluetoothDevice {
  readonly id: string;
  readonly name: string | undefined;
  readonly connected: boolean;
  connect(): Promise<BluetoothConnection>;
  disconnect(): Promise<void>;
  on(event: "disconnect", listener: () => void): Unsubscribe;
}

/**
 * Structured availability report. Lets callers explain to users *why*
 * an adapter cannot run in this environment before `requestDevice()` is
 * called. Optional — adapters that don't implement it fall back to
 * `isAvailable()` at the client layer.
 */
export type AdapterAvailability = {
  available: boolean;
  /** Human-readable reason when `available` is false. */
  reason?: string;
  /** Docs link that explains the limitation and how to work around it. */
  docsUrl?: string;
};

export interface BluetoothAdapter {
  /** Stable identifier, e.g. "native-web-bluetooth". */
  readonly id: string;
  isAvailable(): boolean | Promise<boolean>;
  /**
   * Optional richer availability report. Callers may use this to render
   * an honest unsupported-runtime UI without calling `requestDevice()`.
   */
  describeAvailability?(): AdapterAvailability | Promise<AdapterAvailability>;
  capabilities(): Promise<BluetoothCapabilities>;
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
}
