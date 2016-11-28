# Bitcoin Monetisation for IoT Appliances
Continuous Assessment for SG5233 Internet of things technology.
Raspberry Pi (RPi) running [Johnny-five](http://johnny-five.io).
Bitcoin network (using [Toshi](https://toshi.io) for testnet and [Blockchain.info](https://blockchain.info) for livenet),
transaction signing using [Bitcore](https://bitcore.io).

## Setup
1. For RPi v1 and v2 (not sure about v3) install [WiringPi](http://wiringpi.com/download-and-install).

2. For RPi v2 and up (ARMv7), install the latest NodeJS from [NodeSource](https://github.com/nodesource/distributions)
following their Debian instructions. For RPi v1, install the latest ARMv6 binaries from
[NodeJS Downloads](https://nodejs.org/en/download).

3. Create `config.json` file based on `config.json.sample`.

4. Wire GPIO13 of the RPi to the relay.

5. Run `sudo node testnet.js` for testnet(development) or run with environment
`sudo node livenet.js` for livenet(production).

6. Upon initial run `wallet.json` will be created.
Create a backup for this file, especially if you are using real Bitcoins.

## REPL Exposed Variables
You can access these variables from the console once the board is ready.
* board - Board object; refer to [Johnny-five's API](http://johnny-five.io/api).
* generateQrcode - Function; prints current Bitcoin address QR code to console.
* collectFunds - Function; sends all unspent outputs to master address.
