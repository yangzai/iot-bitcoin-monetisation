# Bitcoin Monetisation for IoT Appliances
Continuous Assessment for SG5233 Internet of things technology.
Raspberry Pi (RPi) running [Johnny-five](johnny-five.io).
Bitcoin network over [Toshi](toshi.io), transaction signing using [Bitcore](bitcore.io).

## Setup
1. For RPi v1 and v2 (not sure about v3) install [WiringPi](wiringpi.com/download-and-install).

2. For RPi v2 and up (ARMv7), install the latest NodeJS from [NodeSource](github.com/nodesource/distributions)
following their Debian instructions. For RPi v1, install the latest ARMv6 binaries from
[NodeJS Downloads](nodejs.org/en/download).

3. Create `config.json` file based on `config.json.sample`.

4. Run `sudo node main.js` for development mode or run with environment
`sudo NODE_ENV=production node main.js` for production mode.

5. Upon initial run `wallet.json` will be created.
Create a backup for this file, especially if you are using real Bitcoins.