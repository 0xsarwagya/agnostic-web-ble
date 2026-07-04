import { BluetoothError } from "./errors";
import type {
  BluetoothAdapter,
  BluetoothCapabilities,
  BluetoothDevice,
  RequestDeviceOptions,
} from "./types";

export type CreateBluetoothOptions =
  | { adapter: BluetoothAdapter; adapters?: never }
  | { adapters: BluetoothAdapter[]; adapter?: never };

export interface Bluetooth {
  /**
   * The adapter selected for this runtime, or null before selection has run.
   * Selection happens on the first operation (or via `selectAdapter()`).
   */
  readonly adapter: BluetoothAdapter | null;
  /** Resolve adapter selection explicitly. Deterministic: first available wins. */
  selectAdapter(): Promise<BluetoothAdapter>;
  capabilities(): Promise<BluetoothCapabilities>;
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
}

export function createBluetooth(options: CreateBluetoothOptions): Bluetooth {
  const candidates = options.adapter ? [options.adapter] : options.adapters;
  if (!candidates || candidates.length === 0) {
    throw new BluetoothError({
      code: "ADAPTER_ERROR",
      message: "createBluetooth requires at least one adapter.",
      operation: "capabilities",
    });
  }

  let selected: BluetoothAdapter | null = null;
  let selecting: Promise<BluetoothAdapter> | null = null;

  const selectAdapter = (): Promise<BluetoothAdapter> => {
    if (selected) return Promise.resolve(selected);
    selecting ??= (async () => {
      for (const adapter of candidates) {
        if (await adapter.isAvailable()) {
          selected = adapter;
          return adapter;
        }
      }
      selecting = null;
      throw new BluetoothError({
        code: "UNAVAILABLE",
        message: `No available Bluetooth adapter in this runtime (tried: ${candidates
          .map((a) => a.id)
          .join(", ")}).`,
        operation: "capabilities",
        recoverable: false,
      });
    })();
    return selecting;
  };

  return {
    get adapter() {
      return selected;
    },
    selectAdapter,
    async capabilities() {
      const adapter = await selectAdapter();
      return adapter.capabilities();
    },
    async requestDevice(requestOptions = {}) {
      const adapter = await selectAdapter();
      return adapter.requestDevice(requestOptions);
    },
  };
}
