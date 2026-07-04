# Agnostic Web BLE

Bluetooth Low Energy for the web, whatever your browser might be.

A TypeScript library for using Bluetooth Low Energy across web runtimes
through one consistent API. Your application knows the device. The adapter
knows the runtime.

## Install

```sh
pnpm add @0xsarwagya/agnostic-web-ble
```

## First connection

```ts
import { createBluetooth } from "@0xsarwagya/agnostic-web-ble";
import { nativeWebBluetoothAdapter } from "@0xsarwagya/agnostic-web-ble/adapters/native";

const bluetooth = createBluetooth({
  adapters: [nativeWebBluetoothAdapter()],
});

const device = await bluetooth.requestDevice({
  filters: [{ services: ["180f"] }],
});

const connection = await device.connect();
const service = await connection.getPrimaryService("180f");
const characteristic = await service.getCharacteristic("2a19");

const value = await characteristic.readValue();
console.log("battery level:", value.getUint8(0));
```

No hardware on hand? The mock adapter runs the same application code
deterministically:

```ts
import { createMockAdapter } from "@0xsarwagya/agnostic-web-ble/adapters/mock";

const bluetooth = createBluetooth({
  adapters: [createMockAdapter({ devices: [/* ... */] })],
});
```

## Status

Beta. The adapter contract may still change before 1.0.

## Documentation

https://oss.sarwagya.wtf/agnostic-web-ble/docs

## License

[MIT](./LICENSE)
