'use strict';
// todo(mg) in package.json packen
const rpc = require('node-json-rpc');
const co = require('co');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
chai.use(chaiAsPromised);
const assert = require('assert');

const eth = web3.eth;

const PERCENTAGE_CERTIFICATE_AUTHORITIES = 0.05;
const PERCENTAGE_PRODUCERS = 0.5;


var options = {
    // int port of rpc server, default 5080 for http or 5433 for https 
    port: 8545,
    // string domain name or ip of rpc server, default '127.0.0.1' 
    host: 'localhost'
};

// Create a server object with options 
var client = new rpc.Client(options);


contract('Etherex', function(accounts) {


    var stateUpdates;
    var beginningBlock;

    var certificateAuthorities;
    var producers;
    var consumers;
    var etherex;
    var reserveProducers;
    var reserveConsumers;

    var priceMultiplier;
    var reserveBidPriceMultiplier;
    var reserveAskPriceMultiplier;
    var volumeMultiplier;



    beforeEach(function() {
        return co(function*() {
            // default account
            eth.defaultAccount = accounts[0];
            // certificate authorities
            certificateAuthorities = accounts.slice(0, PERCENTAGE_CERTIFICATE_AUTHORITIES * accounts.length);
            // all accounts
            accounts = accounts.slice(PERCENTAGE_CERTIFICATE_AUTHORITIES * accounts.length, accounts.length);
            // producers
            producers = accounts.slice(0, 0.25 * accounts.length);
            // consumers
            consumers = accounts.slice(0.25 * accounts.length, 0.5 * accounts.length);
            // reserve producers 
            reserveProducers = accounts.slice(0.5 * accounts.length, 0.75 * accounts.length);
            // reserve consumers
            reserveConsumers = accounts.slice(0.75 * accounts.length, accounts.length);

            priceMultiplier = 100;
            reserveBidPriceMultiplier = 50;
            reserveAskPriceMultiplier = 100;
            volumeMultiplier = 100;

            etherex = yield Etherex.new();

            //Event listener for the StateUpdate event
            stateUpdates = etherex.StateUpdate();

            //The block where the test began
            beginningBlock = eth.blockNumber;

            stateUpdates.watch(function(error, result) {

                if (error == null) {
                    var args = result.args;

                    var blocks = args.blockNumber - args.startBlock;

                    if (args.blockNumber - args.startBlock >= 50) {
                        assert(args.newState.toNumber() == 0, "State is 1 in 3/3 of period, args: " + args.startBlock + " " + args.blockNumber + " blocks: " + blocks);
                        
                    } else if (args.blockNumber - args.startBlock >= 25 && args.blockNumber - args.startBlock < 50) {
                        assert(args.newState.toNumber() == 1, "State is 0 in 2/3 of period, args: " + args.startBlock + " " + args.blockNumber + " blocks: " + blocks);
                        
                    } else {
                        assert(args.newState.toNumber() == 0, "State is 1 in 1/3 of period, args: " + args.startBlock + " " + args.blockNumber + " blocks: " + blocks);
                        
                    }

                } else {
                    assert(false, "Error: " + error)
                }

                //Here we check also if the period had changed to 1, if this was succsessful, then
                //the states and periods work
                if (args.blockNumber - beginningBlock == 76) {
                    assert(args.period == 1 && args.newState == 0, "Period in block 76 did not change to 1.");
                    console.log("Finished 75 blocks");
                }
            });

            assert(certificateAuthorities[0]);
            yield etherex.registerCertificateAuthority(certificateAuthorities[0], { from: accounts[0] });
            for (var i = 0; i < producers.length; i++) {
                assert(producers[i]);
                yield etherex.registerProducer(producers[i], { from: certificateAuthorities[0] });
                var usertype = (yield etherex.getUserType(producers[i])).toNumber();
                assert.equal(usertype, 2);
            }
            for (var i = 0; i < reserveProducers.length; i++) {
                assert(reserveProducers[i]);
                yield etherex.registerProducer(reserveProducers[i], { from: certificateAuthorities[0] });
                var usertype = (yield etherex.getUserType(reserveProducers[i])).toNumber();
                assert.equal(usertype, 2);
            }
            for (var i = 0; i < consumers.length; i++) {
                assert(consumers[i]);
                yield etherex.registerConsumer(consumers[i], { from: certificateAuthorities[0] });
                var usertype = (yield etherex.getUserType(consumers[i])).toNumber();
                assert.equal(usertype, 1);
            }
            for (var i = 0; i < reserveConsumers.length; i++) {
                assert(reserveConsumers[i]);
                yield etherex.registerConsumer(reserveConsumers[i], { from: certificateAuthorities[0] });
                var usertype = (yield etherex.getUserType(reserveConsumers[i])).toNumber();
                assert.equal(usertype, 1);
            }
        });
    });


    afterEach(function() {
        stateUpdates.stopWatching();
    });


    it('runs 5 cycles', function() {
        return co(function*() {

            var matchingPrice = 0;
            var stateBefore;
            var stateAfter;
            var currPeriod;

            // due to the registration calls in beforeall the startBlock in the contract does not equal the  blocknumber and has to be reser manually
            yield etherex.init();

            // run order and reserve order emission multiple times 
            for (var j = 0; j < 5; j++) {

                currPeriod = (yield etherex.getCurrentPeriod()).toNumber();

                // altogether 25 blocks get mined
                for (var i = 0; i < 5; i++) {
                    yield mine();
                }
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: consumers[i] });
                }
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitAsk(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: producers[i] });
                }

                matchingPrice = yield etherex.getMatchingPrices.call(currPeriod);
                assert.equal(matchingPrice, 800, "matching price should be 800");

                for (var i = 0; i < 5; i++) {
                    yield mine();
                }

                // Emit Reserve Orders
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: reserveConsumers[i] });
                }
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitAsk(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: reserveProducers[i] });
                }

                var bidReservePrice = yield etherex.getBidReservePrice.call(currPeriod);
                var askReservePrice = yield etherex.getAskReservePrice.call(currPeriod);

                assert.equal(bidReservePrice.toNumber(), 1000);
                assert.equal(askReservePrice.toNumber(), 400);

                // 25 blocks need to be mined so that the new period starts
                for (var i = 0; i < 24; i++) {
                    yield mine();
                }
                // since mine() does not inform the contract about the current blockNumber, we  have to call an empty function with updateState modifier so that contract gets informed about the current block and can mange the state
                yield etherex.testUpdateState();
            }
        }); 
    }); 
});


// helper functions

function getBlockNumber() {
    return new Promise(function(resolve, reject) {
        eth.getBlockNumber(function(err, res) {
            if (err) {
                console.log(err);
                return reject(err);
            }
            return resolve(res);
        });
    });
}

function mine() {
    return new Promise(function(resolve, reject) {
        client.call({ "jsonrpc": "2.0", "method": "evm_mine", "id": 0 }, function(err, res) {
            if (err) {
                console.log(err);
                return reject(err);
            }
            return resolve();
        });
    });
}
