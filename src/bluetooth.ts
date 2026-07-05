import { describeRuntime } from "./env";
import { BluetoothError } from "./errors";
import type {
  AdapterAvailability,
  BluetoothAdapter,
  BluetoothCapabilities,
  BluetoothDevice,
  RequestDeviceOptions,
} from "./types";

const COMPATIBILITY_DOCS_URL =
  "https://oss.sarwagya.wtf/agnostic-web-ble/docs/compatibility";

const AVAILABILITY_TIMEOUT_MS = 2000;

export type CreateBluetoothOptions =
  | { adapter: BluetoothAdapter; adapters?: never }
  | { adapters: BluetoothAdapter[]; adapter?: never };

export type AdapterAvailabilityReport = AdapterAvailability & {
  /** Which adapter this report came from. */
  adapterId: string;
};

export interface Bluetooth {
  /**
   * The adapter selected for this runtime, or null before selection has run.
   * Selection happens on the first operation (or via `selectAdapter()`).
   */
  readonly adapter: BluetoothAdapter | null;
  /** Resolve adapter selection explicitly. Deterministic: first available wins. */
  selectAdapter(): Promise<BluetoothAdapter>;
  /**
   * Inspect availability of every configured adapter *without* attempting a
   * connection or triggering a user gesture. Safe to call at page load —
   * useful for rendering an honest "not supported here" state.
   */
  describeAvailability(): Promise<AdapterAvailabilityReport[]>;
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

  const withTimeout = async <T>(
    task: Promise<T> | T,
    onTimeout: () => T,
  ): Promise<T> => {
    const promise = Promise.resolve(task);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(onTimeout()), AVAILABILITY_TIMEOUT_MS);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  const describeOne = async (
    adapter: BluetoothAdapter,
  ): Promise<AdapterAvailabilityReport> => {
    try {
      if (adapter.describeAvailability) {
        const report = await withTimeout(adapter.describeAvailability(), () => ({
          available: false,
          reason: "describeAvailability() timed out",
        }));
        return { adapterId: adapter.id, ...report };
      }
      const available = await withTimeout(adapter.isAvailable(), () => false);
      return { adapterId: adapter.id, available };
    } catch (err) {
      return {
        adapterId: adapter.id,
        available: false,
        reason: `isAvailable() threw: ${(err as Error)?.message ?? String(err)}`,
      };
    }
  };

  const describeAvailability = async (): Promise<
    AdapterAvailabilityReport[]
  > => Promise.all(candidates.map(describeOne));

  const selectAdapter = (): Promise<BluetoothAdapter> => {
    if (selected) return Promise.resolve(selected);
    selecting ??= (async () => {
      const reports: AdapterAvailabilityReport[] = [];
      for (const adapter of candidates) {
        const report = await describeOne(adapter);
        reports.push(report);
        if (report.available) {
          selected = adapter;
          return adapter;
        }
      }
      selecting = null;

      const summary = reports
        .map((r) => (r.reason ? `${r.adapterId} (${r.reason})` : r.adapterId))
        .join(", ");
      const firstDocsUrl =
        reports.find((r) => r.docsUrl)?.docsUrl ?? COMPATIBILITY_DOCS_URL;

      throw new BluetoothError({
        code: "UNAVAILABLE",
        message:
          `No Bluetooth adapter is available in this runtime. ` +
          `Tried: ${summary}. See ${firstDocsUrl} for adapters that work on your browser. ` +
          `[${describeRuntime()}]`,
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
    describeAvailability,
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
