const BLUETOOTH_BASE_SUFFIX = "-0000-1000-8000-00805f9b34fb";
const FULL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHORT_UUID = /^(0x)?[0-9a-f]{1,8}$/i;

/**
 * Normalize a BLE UUID to its lowercase 128-bit form.
 * Accepts full UUIDs, 16/32-bit short forms ("0x180f", "180f"), and numbers.
 */
export function normalizeUuid(uuid: string | number): string {
  if (typeof uuid === "number") {
    if (!Number.isInteger(uuid) || uuid < 0 || uuid > 0xffffffff) {
      throw new TypeError(`Invalid Bluetooth UUID number: ${uuid}`);
    }
    return `${uuid.toString(16).padStart(8, "0")}${BLUETOOTH_BASE_SUFFIX}`;
  }
  const value = uuid.trim().toLowerCase();
  if (FULL_UUID.test(value)) return value;
  if (SHORT_UUID.test(value)) {
    const hex = value.replace(/^0x/, "");
    return `${hex.padStart(8, "0")}${BLUETOOTH_BASE_SUFFIX}`;
  }
  throw new TypeError(`Invalid Bluetooth UUID: ${JSON.stringify(uuid)}`);
}

export function uuidEquals(a: string | number, b: string | number): boolean {
  return normalizeUuid(a) === normalizeUuid(b);
}
