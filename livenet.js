// board setup
var raspi = require('raspi-io');
var five = require('johnny-five');
var board = new five.Board({
    io: new raspi()
});
const RELAY_PIN = 'GPIO13';
var relay;

// general setup
var config = require('./config')['production'];
var fs = require('fs');
var co = require('co');
var _ = require('lodash');
var fetch = require('node-fetch');
var qrcode = require('qrcode-terminal');

// bitcore + blockchain.info setup
const TX_FEE = 12000;
const SATOSHI_PER_SEC = 20000; //satoshis per sec
var earned = 0, balance = 0;
var runTimeoutId, pingIntervalId;
var bitcore = require('bitcore-lib');
var Transaction = bitcore.Transaction;
var Address = bitcore.Address;
var PrivateKey = bitcore.PrivateKey;
var blockchain = require('blockchain.info');
var blockexplorer = blockchain.blockexplorer;
var pushtx = blockchain.pushtx;
var Socket = blockchain.Socket;
var mySocket;

// load wallet
try {
    var privateKey = PrivateKey.fromWIF(require('./wallet').wif);
} catch (e) {
    privateKey = new PrivateKey();
    writeWallet = fs.writeFile('wallet.json', JSON.stringify({wif: privateKey.toWIF()}));
}

var publicKey = privateKey.toPublicKey();
var address = publicKey.toAddress();
var masterAddress = Address(config.masterAddress);

function run() {
    var value = 0;

    function onCompleted() {
        earned += value;
        value = balance - earned;
        if (value <= 0) {
            //turn off
            if (relay) relay.close();
            return runTimeoutId = null;
        }

        //value = time*rate/1000
        var time = value / SATOSHI_PER_SEC * 1000;
        console.log('run time:', time);
        //turn on
        if (relay) relay.open();
        runTimeoutId = setTimeout(onCompleted, time);
    }

    onCompleted();
}

var collectFunds = co.wrap(function* () {
    try {
        clearTimeout(runTimeoutId);
        runTimeoutId = null;

        var unspentsPromise = blockexplorer.getUnspentOutputs(address);

        var unspents = (yield unspentsPromise).unspent_outputs;
        var amount = 0;
        var utxos = unspents.map(u => {

            amount += u.value;

            return new Transaction.UnspentOutput({
                txid: u.tx_hash_big_endian,
                vout: u.tx_output_n,
                scriptPubKey: u.script,
                address: address,
                satoshis: u.value
            });
        });

        /* TODO: collect unconfirmed tx as well
        when better API support is provided */

        console.log("Unspent: ",utxos);

        if (utxos.length < 1) return;

        var sendAmount = amount - TX_FEE;

        console.log("Send Amount: ", sendAmount);

        var newTx = new Transaction()
            .from(utxos)
            .to(masterAddress, sendAmount)
            .change(address)
            .fee(TX_FEE)
            .sign(privateKey);

        var serialized = newTx.serialize();
        console.log(serialized);

        console.log(newTx._getHash());
        var message = yield pushtx.pushtx(serialized);
        console.log('sent, tx message:', message);

    } catch (e) { console.error(e); }
});

// QR
function generateQrcode() {
    var text = `bitcoin:${address}`;
    qrcode.generate(text);
    console.log(text);
}

function setup() {
    mySocket = new Socket();
    mySocket.onOpen(() => {
        console.log('ws open');
        generateQrcode();
    });
    mySocket.onClose(() => {
        console.log('ws close');
        clearInterval(pingIntervalId);
        pingIntervalId = null;
        setup();
    });
    mySocket.onTransaction((t) => {
        var outputs = t.out
            .filter(o => o.addr === address.toString());

        if (!outputs.length) return;

        console.log('received, tx hash:', t.hash);
        balance = outputs.map(o => o.value)
            .reduce((p, c) => p + c, balance);

        if (!runTimeoutId && (balance - earned) > 0)
            run();
        /* TODO: Inactivity induces websocket disconnection.
        Until solution is provided by API,
        address filter is not possible */
    }/*, {
        addresses: [address]
    }*/);
}

board.on('ready', function () {
    relay = new five.Relay({
        pin: RELAY_PIN,
        type: 'NC'
    });
    relay.open().close();

    this.repl.inject({relay, collectFunds, generateQrcode});

    setup();
});