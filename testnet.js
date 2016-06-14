// board setup
var raspi = require('raspi-io');
var five = require('johnny-five');
var board = new five.Board({
    io: new raspi()
});
const RELAY_PIN = 'GPIO13';
var relay;

// general setup
var config = require('./config')['development'];
var fs = require('fs');
var co = require('co');
var _ = require('lodash');
var fetch = require('node-fetch');
var qrcode = require('qrcode-terminal');

// bitcore + toshi setup
const WSS_URL = `wss://${config.toshiNetworkString}.toshi.io`;
const HTTPS_URL = `https://${config.toshiNetworkString}.toshi.io`;
const ADDRESS_API_URL = `${HTTPS_URL}/api/v0/addresses`;
const TX_FEE = 12000;
const SATOSHI_PER_SEC = 20000; //satoshis per sec
var earned = 0, balance = 0;
var runTimeoutId, pingIntervalId;
var bitcore = require('bitcore-lib');
var Networks = bitcore.Networks;
var Transaction = bitcore.Transaction;
var Address = bitcore.Address;
var PrivateKey = bitcore.PrivateKey;
var WebSocket = require('ws'), ws;

// load wallet
try {
    var privateKey = PrivateKey.fromWIF(require('./wallet').wif);
} catch (e) {
    privateKey = new PrivateKey();
    writeWallet = fs.writeFile('wallet.json', JSON.stringify({wif: privateKey.toWIF()}));
}

var publicKey = privateKey.toPublicKey();
var address = publicKey.toAddress(Networks.testnet);
var masterAddress = Address(config.masterAddress);

// toshi api promisified
var getBalance = h => fetch(`${ADDRESS_API_URL}/${h}`).then(r => r.json());
var getAddressTransactions = h => fetch(`${ADDRESS_API_URL}/${h}/transactions`).then(r => r.json());
var unspentOutputs = h => fetch(`${ADDRESS_API_URL}/${h}/unspent_outputs`).then(r => r.json());
var broadcastTransaction = signed => {
    return fetch(`${HTTPS_URL}/api/v0/transactions`, {
        method: 'POST',
        body: JSON.stringify({ hex: signed })
    }).then(r => r.json())
};

// toshi ws methods
function onOpen() {
    console.log('ws open');
    generateQrcode();
    ws.send(JSON.stringify({ subscribe: 'transactions' }));
    pingIntervalId = setInterval(ws.ping.bind(ws), 20000);
}

var onMessage = co.wrap(function* (message) {
    message = JSON.parse(message);
    var data = message.data;
    var subscription = message.subscription;

    if (subscription !== 'transactions') return;

    var isRelavantTx = _.chain(data.outputs)
        .map(o => o.addresses)
        .flatten()
        .some(a => a === address.toString())
        .value();

    if (!isRelavantTx) return;

    console.log('received, tx hash:', data.hash);
    var account = yield getBalance(address.toString());

    balance = account.unconfirmed_balance + account.balance;
    if (!runTimeoutId && (balance - earned) > 0)
        run();
});

function onClose(event) {
    console.log('ws close', event);
    clearInterval(pingIntervalId);
    pingIntervalId = null;
    setup();
}

function setup() {
    ws = new WebSocket(WSS_URL);
    ws.on('open', onOpen);
    ws.on('message', onMessage);
    ws.on('close', onClose);
}

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

        var unspentsPromise = unspentOutputs(address);
        var transactionsPromise = getAddressTransactions(address);

        var unspents = yield unspentsPromise;
        var amount = 0;
        var utxos = unspents.map(u => {

            amount += u.amount;

            return new Transaction.UnspentOutput({
                txid: u.transaction_hash,
                vout: u.output_index,
                scriptPubKey: u.script_hex,
                address: address,
                satoshis: u.amount
            });
        });

        var transactions = yield transactionsPromise;
        var unconfirmed = transactions.unconfirmed_transactions;

        var ucUtxos = _.flatMap(unconfirmed, uc => {
            return _.chain(uc.outputs)
                .map((o, i) => { // filtering 1st will break indexing
                    if (o => o.addresses.every(a => a !== address.toString()))
                        return undefined;

                    console.log(uc.hash, i, o.script_hex, o.amount);
                    amount += o.amount;
                    return new Transaction.UnspentOutput({
                        txid: uc.hash,
                        vout: i,
                        scriptPubKey: o.script_hex,
                        address: address,
                        satoshis: o.amount
                    });
                }).compact().value();
        });

        console.log("Unspent: ",utxos);
        console.log("Unconfirmed: ",ucUtxos);

        if (utxos.length + ucUtxos.length < 1) return;

        var sendAmount = amount - TX_FEE;

        console.log("Send Amount: ", sendAmount);


        var newTx = new Transaction()
            .from(utxos.concat(ucUtxos))
            .to(masterAddress, sendAmount)
            .change(address)
            .fee(TX_FEE)
            .sign(privateKey);

        var serialized = newTx.serialize();
        console.log(serialized);

        var hash = yield broadcastTransaction(serialized);
        console.log('sent, tx hash:', hash);

    } catch (e) { console.error(e); }
});

// QR
function generateQrcode() {
    var text = `bitcoin:${address}`;
    qrcode.generate(text);
    console.log(text);
}

// init
var initPromise = co(function* () {
    var account = yield getBalance(address.toString());
    earned = balance = account.unconfirmed_balance + account.balance;
});

board.on('ready', function () {
    relay = new five.Relay({
        pin: RELAY_PIN,
        type: 'NC'
    });
    relay.open().close();

    this.repl.inject({relay, collectFunds, generateQrcode});
    initPromise.then(setup);
});