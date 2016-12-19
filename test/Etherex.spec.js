'use strict';

const co = require('co');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
chai.use(chaiAsPromised);
const assert = require("assert");

const eth = web3.eth;

const PERCENTAGE_CERTIFICATE_AUTHORITIES = 0.05;
const PERCENTAGE_PRODUCERS = 0.25;

contract('Etherex', function(accounts) {

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



    describe('REGISTER CERTIFICATE AUTHORITIES AND PRODUCERS', function() {
        it('The contract should be deployed to the blockchain', function(done) {
            assert(etherex);
            done();
        });
    });

    describe('REGISTER CERTIFICATE AUTHORITIES AND PRODUCERS', function() {
        it('register certificate authorities - should work', function() {
            return expect(co(function*() {
                assert(accounts[0]);
                for (var i = 0; i < certificateAuthorities.length; i++) {
                    assert(certificateAuthorities[i]);
                    yield etherex.registerCertificateAuthority(certificateAuthorities[i], { from: accounts[0] });
                }
            })).not.to.be.rejected;
        });
    });

    describe('REGISTER CERTIFICATE AUTHORITIES AND PRODUCERS', function() {
        it('register producer by certificate authority - should work', function() {
            return expect(co(function*() {
                assert(certificateAuthorities[0]);
                assert(producers[0]);
                yield etherex.registerCertificateAuthority(certificateAuthorities[0], { from: accounts[0] });
                yield etherex.registerProducer(producers[0], { from: certificateAuthorities[0] });
            })).not.to.be.rejected;
        });
    });

    // todo(mg) fails due to DEBUG flag in modifiers
    describe('REGISTER CERTIFICATE AUTHORITIES AND PRODUCERS', function() {
        it('register producer by consumer - should not work', function() {
            return expect(co(function*() {
                yield etherex.registerProducer(producers[0], { from: consumers[0] });
            })).to.be.rejected;
        });
    });

    // todo(mg) fails due to DEBUG flag in modifiers
    describe('SUBMIT ORDERS', function() {
        it('submit bids by producer - should not work', function() {
            return expect(co(function*() {
                yield etherex.submitBid(1 * priceMultiplier, 1 * volumeMultiplier, { from: producers[0] });
            })).to.be.rejected;
        });
    });

    describe('SUBMIT ORDERS', function() {
        it('insert bids with price in ascending order - should work', function() {
            assert(consumers.length >= 10);
            return expect(co(function*() {
                var orderIds = [];
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: consumers[i] });
                    var lastOrderId = yield etherex.getOrderIdLastOrder.call();
                    orderIds.unshift(lastOrderId.toNumber());
                }

                for (var i = 0; i < orderIds.length; i++) {
                    var orderId = yield etherex.getOrderId.call(orderIds[i]);
                    assert(orderIds[i] === orderId.toNumber());
                    var next = yield etherex.getOrderNext.call(orderIds[i]);
                    assert((i === (orderIds.length - 1) ? 0 : (orderId.toNumber() - 1)) === next.toNumber());
                    var price = yield etherex.getOrderPrice.call(orderIds[i]);
                    assert((orderIds.length - i - 1) * priceMultiplier + 100 === price.toNumber());
                    var volume = yield etherex.getOrderVolume.call(orderIds[i]);
                    assert((orderIds.length - i - 1) * volumeMultiplier + 100 === volume.toNumber());
                }
            })).not.to.be.rejected;
        });
    });

    describe('SUBMIT ORDERS', function() {

        it('insert bids with price in descending order - should work', function() {
            assert(consumers.length >= 10);
            return expect(co(function*() {
                var orderIds = [];
                for (var i = 9; i >= 0; i--) {
                    yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: consumers[i] });
                    var lastOrderId = yield etherex.getOrderIdLastOrder.call();
                    orderIds.push(lastOrderId.toNumber());
                }

                for (var i = 0; i < orderIds.length; i++) {
                    var orderId = yield etherex.getOrderId.call(orderIds[i]);
                    assert(orderIds[i] === orderId.toNumber());
                    var next = yield etherex.getOrderNext.call(orderIds[i]);
                    assert((i === (orderIds.length - 1) ? 0 : (orderId.toNumber() + 1)) === next.toNumber());
                    var price = yield etherex.getOrderPrice.call(orderIds[i]);
                    assert((orderIds.length - i - 1) * priceMultiplier + 100 === price.toNumber());
                    var volume = yield etherex.getOrderVolume.call(orderIds[i]);
                    assert((orderIds.length - i - 1) * volumeMultiplier + 100 === volume.toNumber());
                }
            })).not.to.be.rejected;
        });
    });

    // todo(mg) fails due to DEBUG flag in modifiers
    describe('SUBMIT ORDERS', function() {
        it('submit asks by consumer - should not work', function() {
            return expect(co(function*() {
                yield etherex.submitAsk(1 * priceMultiplier, 1 * volumeMultiplier, { from: consumers[0] });
            })).to.be.rejected;
        });

    });

    describe('SUBMIT ORDERS', function() {

        it('insert asks with price in ascending order - should work', function() {
            assert(producers.length >= 10);
            return expect(co(function*() {
                var orderIds = [];
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitAsk(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: producers[i] });
                    var lastOrderId = yield etherex.getOrderIdLastOrder.call();
                    orderIds.push(lastOrderId.toNumber());
                }

                for (var i = 0; i < orderIds.length; i++) {
                    var orderId = yield etherex.getOrderId.call(orderIds[i]);
                    assert(orderIds[i] === orderId.toNumber());
                    var next = yield etherex.getOrderNext.call(orderIds[i]);
                    assert((i === (orderIds.length - 1) ? 0 : (orderId.toNumber() + 1)) === next.toNumber());
                    var price = yield etherex.getOrderPrice.call(orderIds[i]);
                    assert(i * priceMultiplier + 100 === price.toNumber());
                    var volume = yield etherex.getOrderVolume.call(orderIds[i]);
                    assert(i * volumeMultiplier + 100 === volume.toNumber());
                }
            })).not.to.be.rejected;
        });

    });

    describe('SUBMIT ORDERS', function() {

        it('insert bids with price in descending order - should work', function() {
            assert(producers.length >= 10);
            return expect(co(function*() {
                var orderIds = [];
                for (var i = 9; i >= 0; i--) {
                    yield etherex.submitAsk(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: producers[i] });
                    var lastOrderId = yield etherex.getOrderIdLastOrder.call();
                    orderIds.unshift(lastOrderId.toNumber());
                }

                for (var i = 0; i < orderIds.length; i++) {
                    var orderId = yield etherex.getOrderId.call(orderIds[i]);
                    assert(orderIds[i] === orderId.toNumber());
                    var next = yield etherex.getOrderNext.call(orderIds[i]);
                    assert((i === (orderIds.length - 1) ? 0 : (orderId.toNumber() - 1)) === next.toNumber());
                    var price = yield etherex.getOrderPrice.call(orderIds[i]);
                    assert(i * priceMultiplier + 100 === price.toNumber());
                    var volume = yield etherex.getOrderVolume.call(orderIds[i]);
                    assert(i * volumeMultiplier + 100 === volume.toNumber());
                }
            })).not.to.be.rejected;
        });
    });

    // todo(mg) fails
    describe('MATCH BID AND ASK ORDERS', function() {
        var priceMultiplier = 100;
        var volumeMultiplier = 100;

        it('no orders inserted - no matching price', function() {
            return expect(co(function*() {
                yield etherex.nextState();
                var matchingPrice = yield etherex.getMatchingPrices.call(0);
                assert.equal(matchingPrice.toNumber(), Math.pow(2, 128) - 1);
            })).not.to.be.rejected;
        });
    });

    describe('MATCH BID AND ASK ORDERS', function() {

        var priceMultiplier = 100;
        var volumeMultiplier = 100;

        it('minAsk is greater than maxBid - no matching price', function() {
            return expect(co(function*() {
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: consumers[i] });
                }
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitAsk(1100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: producers[i] });
                }
                yield etherex.nextState();
                var matchingPrice = yield etherex.getMatchingPrices.call(0);
                assert.equal(matchingPrice.toNumber(), Math.pow(2, 128) - 1);
            })).not.to.be.rejected;
        });
    });

    describe('MATCH BID AND ASK ORDERS', function() {

        var priceMultiplier = 100;
        var volumeMultiplier = 100;

        // cumBidVol = 2400, cumAskVol = 2800 => use only portion ask orders
        it('cumBidVol < cumAskVol - should work', function() {
            return expect(co(function*() {
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: consumers[i] });
                }
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitAsk(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: producers[i] });
                }
                yield etherex.nextState();
                var expectedMatchAsks = [{ p: 0, v: 75 }, { p: 1, v: 150 }, { p: 2, v: 225 }, { p: 3, v: 300 }, { p: 4, v: 375 }, { p: 5, v: 450 }, { p: 6, v: 525 }, { p: 7, v: 600 }];
                for (var i = 0; i < expectedMatchAsks.length; i++) {
                    var volume = yield etherex.getMatchedAskOrders.call(0, producers[expectedMatchAsks[i].p]);
                    assert.equal(volume.toNumber(), expectedMatchAsks[i].v);
                }
                var expectedMatchBids = [{ p: 7, v: 800 }, { p: 8, v: 900 }, { p: 9, v: 1000 }];
                for (var i = 0; i < expectedMatchBids.length; i++) {
                    var volume = yield etherex.getMatchedBidOrders.call(0, consumers[expectedMatchBids[i].p]);
                    assert.equal(volume.toNumber(), expectedMatchBids[i].v);
                }
                var matchingPrice = yield etherex.getMatchingPrices.call(0);
                assert.equal(matchingPrice.toNumber(), 800);
            })).not.to.be.rejected;
        });
    });

    describe('MATCH BID AND ASK ORDERS', function() {

        var priceMultiplier = 100;
        var volumeMultiplier = 100;

        // cumBidVol = 4500, cumAskVol = 100 => use only portion bid orders
        it('cumBidVol > cumAskVol - should work', function() {
            return expect(co(function*() {
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: consumers[i] });
                }
                yield etherex.submitAsk(0 * priceMultiplier, 1 * volumeMultiplier, { from: producers[0] });
                yield etherex.nextState();
                var expectedMatchAsks = [{ p: 0, v: 100 }];
                for (var i = 0; i < expectedMatchAsks.length; i++) {
                    var volume = yield etherex.getMatchedAskOrders.call(0, producers[expectedMatchAsks[i].p]);
                    assert.equal(volume.toNumber(), expectedMatchAsks[i].v);
                }
                var expectedMatchBids = [{ p: 0, v: 1 }, { p: 1, v: 3 }, { p: 2, v: 5 }, { p: 3, v: 7 }, { p: 4, v: 9 }, { p: 5, v: 10 }, { p: 6, v: 12 }, { p: 7, v: 14 }, { p: 8, v: 16 }, { p: 9, v: 18 }];
                for (var i = 0; i < expectedMatchBids.length; i++) {
                    var volume = yield etherex.getMatchedBidOrders.call(0, consumers[expectedMatchBids[i].p]);
                    assert.equal(volume.toNumber(), expectedMatchBids[i].v);
                }
                var matchingPrice = yield etherex.getMatchingPrices.call(0);
                assert.equal(matchingPrice.toNumber(), 0);
            })).not.to.be.rejected;
        });
    });

    // todo(ms): will probably fail due to changes in contract. 
    describe.skip('DETERMINE RESERVE BID AND ASK PRICES', function() {

        var priceMultiplier = 100;
        var volumeMultiplier = 100;
        var reserveVolumeMultiplier = 1000000;

        beforeEach(function() {
            return co(function*() {
                for (var i = 1; i < certificateAuthorities.length; i++) {
                    assert(certificateAuthorities[i]);
                    yield etherex.registerCertificateAuthority(certificateAuthorities[i], { from: accounts[0] });
                }
                for (var i = 1; i < producers.length; i++) {
                    assert(producers[i]);
                    assert(consumers[i]);
                    yield etherex.registerSmartMeter(producers[i], consumers[i], { from: certificateAuthorities[0] });
                }
                for (var i = 1; i < 10; i++) {
                    yield etherex.submitBid(i * priceMultiplier, i * volumeMultiplier, { from: consumers[i] });
                    yield etherex.submitAsk(i * priceMultiplier, i * volumeMultiplier, { from: producers[i] });
                }
                yield etherex.matching();
                for (var i = 1; i < 5; i++) {
                    yield etherex.submitBid(i * priceMultiplier, i * reserveVolumeMultiplier, { from: consumers[i] });
                    yield etherex.submitAsk(i * priceMultiplier, i * reserveVolumeMultiplier, { from: producers[i] });
                }
            });
        });

        it('determine reserve ask price', function(done) {
            etherex.determineReserveAskPrice.call().then(function(result) {
                var price = result.toNumber();
                expect(price).to.not.equal(0);
                assert(price <= priceMultiplier * 5, 'Price is larger than max possible price: ' + price);
                //TODO check if price is right
                done();
            });
        });

        it('determine reserve bid price', function(done) {
            etherex.determineReserveBidPrice.call().then(function(result) {
                var price = result.toNumber();
                expect(price).to.not.equal(0);
                assert(price <= priceMultiplier * 10, 'Price is larger than max possible price: ' + price);
                //TODO check if price is right
                done();
            });
        });
    });



    describe("SETTLEMENT", function() {
        it('no energy excess/lack, users stick to their orders - should work', function() {
            return expect(co(function*() {
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: consumers[i] });
                }
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitAsk(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: producers[i] });
                }



                yield etherex.nextState();

                var matchingPrice = yield etherex.getMatchingPrices.call(0);
                assert.equal(matchingPrice.toNumber(), 800);
                yield etherex.submitBid(1, 1, { from: consumers[10] });
                yield etherex.submitAsk(1, 1, { from: producers[10] });

                yield etherex.nextState();

                var sumproduced = 0; 
                for (var i = 0; i <= 7; i++) {
                    var volume = yield etherex.getMatchedAskOrders.call(0, producers[i]);
                    sumproduced += volume.toNumber();
                    yield etherex.settle(producers[i], 1, volume.toNumber(), 0, { from: producers[i] });
                    var collateral = yield etherex.getCollateral.call(producers[i]);
                    assert.equal(collateral.toNumber(), volume.toNumber() * matchingPrice.toNumber());
                }

                var sumconsumed = 0;
                for (var i = 7; i < 10; i++) {
                    var volume = yield etherex.getMatchedBidOrders.call(0, consumers[i]);
                    sumconsumed += volume.toNumber();
                    yield etherex.settle(consumers[i], 2, volume.toNumber(), 0, { from: consumers[i] });
                    var collateral = yield etherex.getCollateral.call(consumers[i]);
                    assert.equal(collateral.toNumber(), -volume.toNumber() * matchingPrice.toNumber());
                }

                var excess = yield etherex.getExcess.call(0);
                assert.equal(excess.toNumber(), 0,"excess not null");
                var lack = yield etherex.getLack.call(0);
                assert.equal(lack.toNumber(), 0,"lack not null");
                var sumProduced = yield etherex.getSumProduced.call(0);
                assert.equal(sumProduced.toNumber(), 2700);
                var sumConsumed = yield etherex.getSumConsumed.call(0);
                assert.equal(sumConsumed.toNumber(), 2700);
                var sumOfCollateral = yield etherex.getSumOfColleteral.call();
                assert.equal(sumOfCollateral.toNumber(), 0,"collateral not null");
                var energyBalance = yield etherex.getEnergyBalance.call(0);
                assert.equal(energyBalance.toNumber(), 0,"energy balance not null");
            })).not.to.be.rejected;
        });

    });


    describe("SETTLEMENT", function() {
        it('energy lack/excess regulated by one reserve order issuer - should work', function() {
            return expect(co(function*() {


                // Emit normal orders 
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: consumers[i] });
                }
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitAsk(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: producers[i] });
                }

                yield etherex.nextState();

                var matchingPrice = yield etherex.getMatchingPrices.call(0);
                assert.equal(matchingPrice.toNumber(), 800);

                // Emit Reserve Orders
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: reserveConsumers[i] });
                }
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitAsk(100 + i * priceMultiplier, 100 + i * volumeMultiplier, { from: reserveProducers[i] });
                }


                yield etherex.nextState();

                var bidReservePrice = yield etherex.getBidReservePrice.call(0);
                var askReservePrice = yield etherex.getAskReservePrice.call(0);

                assert.equal(bidReservePrice.toNumber(), 1000);
                assert.equal(askReservePrice.toNumber(), 400);


                // SETTLEMENT
                var diff;
                var smVolume;
                var collateral;

                var excess = 0;
                var lack = 0;
                var sumConsumed = 0;
                var sumProduced = 0;


                // iteratation throug all eight producers that got matched
                for (var i = 0; i < 8; i++) {
                    var volume = (yield etherex.getMatchedAskOrders.call(0, producers[i])).toNumber();

                    diff = 50;
                    smVolume = 0;
                    collateral = 0;

                    //produced too much energy 
                    if (i < 4) {
                        smVolume = volume + diff;
                        excess += diff;
                        sumProduced += smVolume;
                        yield etherex.settle(producers[i], 1, smVolume, 0, { from: producers[i] });
                        collateral = (yield etherex.getCollateral.call(producers[i])).toNumber();
                        assert.equal(collateral, volume * matchingPrice.toNumber() + diff * bidReservePrice);
                    }
                    //produced too little energy 
                    else {
                        smVolume = volume - diff;
                        lack += diff;
                        sumProduced += smVolume;
                        yield etherex.settle(producers[i], 1, volume - diff, 0, { from: producers[i] });
                        collateral = (yield etherex.getCollateral.call(producers[i])).toNumber();
                        assert.equal(collateral, smVolume * matchingPrice - diff * askReservePrice);
                    }
                }

                // iteration throug all three consumers that got matched
                for (var i = 7; i < 10; i++) {
                    var volume = (yield etherex.getMatchedBidOrders.call(0, consumers[i])).toNumber();
                    diff = 50;
                    smVolume = 0;
                    collateral = 0;

                    //consumed too much
                    if (i < 9) {
                        smVolume = volume + diff;
                        lack += diff;
                        sumConsumed += smVolume;
                        yield etherex.settle(consumers[i], 2, smVolume, 0, { from: consumers[i] });
                        collateral = (yield etherex.getCollateral.call(consumers[i])).toNumber();
                        assert.equal(collateral, -volume * matchingPrice - diff * askReservePrice);

                        //consumed too less 
                    } else {
                        smVolume = volume - diff;
                        excess += diff;
                        sumConsumed += smVolume;

                        yield etherex.settle(consumers[i], 2, smVolume, 0, { from: consumers[i] });
                        collateral = (yield etherex.getCollateral.call(consumers[i])).toNumber();
                        assert.equal(collateral, -volume * matchingPrice + diff * bidReservePrice);
                    }

                }

                assert.equal((yield etherex.getExcess.call(0)).toNumber(), excess);
                assert.equal((yield etherex.getLack.call(0)).toNumber(), lack);

                assert.equal((yield etherex.getSumProduced.call(0)).toNumber(), sumProduced);
                assert.equal((yield etherex.getSumConsumed.call(0)).toNumber(), sumConsumed);

                // one reserve order user regulates the lack or excess 
                if (sumProduced != sumConsumed) {
                    if (sumProduced > sumConsumed) {
                        var diff = sumProduced - sumConsumed;
                        for (var i = 0; i < reserveConsumers.length; i++) {
                            if (yield etherex.isMatchedForBidReserve(reserveConsumers[i], 0)) {
                                yield etherex.settle(reserveConsumers[i], 2, diff, 0, { from: reserveConsumers[i] });
                                break;
                            }
                        }
                    } else {
                        var diff = sumConsumed - sumProduced;
                        for (var i = 0; i < reserveProducers.length; i++) {
                            if (yield etherex.isMatchedForAskReserve(reserveProducers[i], 0)) {
                                yield etherex.settle(reserveProducers[i], 1, diff, 0, { from: reserveProducers[i] });
                                break;
                            }
                        }
                    }
                }

                // every single smart meter needs to call the settle function before endSettle function is executed

                for (var i = 0; i < consumers.length; i++) {
                    yield etherex.settle(consumers[i], 2, 0, 0, { from: consumers[i] });
                }
                for (var i = 0; i < producers.length; i++) {
                    yield etherex.settle(producers[i], 1, 0, 0, { from: producers[i] });
                }
                for (var i = 0; i < reserveProducers.length; i++) {
                    yield etherex.settle(reserveProducers[i], 1, 0, 0, { from: reserveProducers[i] });
                }
                for (var i = 0; i < reserveConsumers.length; i++) {
                    yield etherex.settle(reserveConsumers[i], 1, 0, 0, { from: reserveConsumers[i] });
                }

                var energyBalance = yield etherex.getEnergyBalance.call(0);
                assert.equal(energyBalance.toNumber(), 0);

                var sumOfCollateral = yield etherex.getSumOfColleteral.call();
                chai.assert.closeTo(sumOfCollateral.toNumber(), 0, 100, "collateral should be close to zero"); // closeTo due to numeric errors
            })).not.to.be.rejected;
        });
    });


    describe("SETTLEMENT", function() {
        it('users consume/produce randomly without having emitted any orders at all - should work', function() {
            return expect(co(function*() {


                yield etherex.nextState();

                var matchingPrice = yield etherex.getMatchingPrices.call(0);
                assert.equal(matchingPrice.toNumber(), Math.pow(2, 128) - 1);

                // Emit Reserve Orders
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitBid(100 + i * reserveBidPriceMultiplier, 100 + (9 - i) * volumeMultiplier, { from: reserveConsumers[i] });
                }
                for (var i = 0; i < 10; i++) {
                    yield etherex.submitAsk(500 + i * reserveAskPriceMultiplier, 100 + i * volumeMultiplier, { from: reserveProducers[i] });
                }

                yield etherex.nextState();

                var bidReservePrice = yield etherex.getBidReservePrice.call(0);

                var askReservePrice = yield etherex.getAskReservePrice.call(0);


                assert(bidReservePrice < askReservePrice, "ask price is not greater than bid price");

                // SETTLEMENT
                var diff;
                var smVolume;
                var collateral;
                var bidReservePrice;
                var askReservePrice;

                var excess = 0;
                var lack = 0;
                var sumConsumed = 0;
                var sumProduced = 0;


                for (var i = 0; i < consumers.length; i++) {
                    smVolume = Math.round(Math.random() * 1000);
                    yield etherex.settle(consumers[i], 2, smVolume, 0, { from: consumers[i] });
                    sumConsumed += smVolume;
                    lack += smVolume;
                    collateral = yield etherex.getCollateral(consumers[i]);
                    askReservePrice = yield etherex.getAskReservePrice(0);

                    assert.equal(collateral, -smVolume * askReservePrice);
                }
                for (var i = 0; i < producers.length; i++) {
                    smVolume = Math.round(Math.random() * 1000);
                    yield etherex.settle(producers[i], 1, smVolume, 0, { from: producers[i] });
                    sumProduced += smVolume;
                    excess += smVolume;
                    collateral = yield etherex.getCollateral(producers[i]);
                    bidReservePrice = yield etherex.getBidReservePrice(0);

                    assert.equal(collateral, smVolume * bidReservePrice);
                }

                assert.equal((yield etherex.getExcess.call(0)).toNumber(), excess, "excess");
                assert.equal((yield etherex.getLack.call(0)).toNumber(), lack, "lack");

                assert.equal((yield etherex.getSumProduced.call(0)).toNumber(), sumProduced);
                assert.equal((yield etherex.getSumConsumed.call(0)).toNumber(), sumConsumed);


                var chosenAskReserveUser = 0;
                var chosenBidReserveUser = 0;

                // one reserve order user regulates the lack or excess 
                if (sumProduced != sumConsumed) {
                    if (sumProduced > sumConsumed) {
                        var diff = sumProduced - sumConsumed;
                        for (var i = 0; i < reserveConsumers.length; i++) {
                            if (yield etherex.isMatchedForBidReserve(reserveConsumers[i], 0)) {
                                yield etherex.settle(reserveConsumers[i], 2, diff, 0, { from: reserveConsumers[i] });
                                chosenBidReserveUser = reserveConsumers[i];
                                break;
                            }
                        }
                    } else {
                        var diff = sumConsumed - sumProduced;
                        for (var i = 0; i < reserveProducers.length; i++) {
                            if (yield etherex.isMatchedForAskReserve(reserveProducers[i], 0)) {
                                yield etherex.settle(reserveProducers[i], 1, diff, 0, { from: reserveProducers[i] });
                                chosenAskReserveUser = reserveProducers[i];
                                break;
                            }
                        }
                    }
                }


                var energyBalance = yield etherex.getEnergyBalance.call(0);
                assert.equal(energyBalance.toNumber(), 0, "energy balance should be zero, then the reserve order issuing was successfull");


                for (var i = 0; i < reserveProducers.length; i++) {
                    yield etherex.settle(reserveProducers[i], 1, 0, 0, { from: reserveProducers[i] });
                }
                for (var i = 0; i < reserveConsumers.length; i++) {
                    yield etherex.settle(reserveConsumers[i], 1, 0, 0, { from: reserveConsumers[i] });
                }

                var sumOfCollateral = (yield etherex.getSumOfColleteral()).toNumber();

                var collBidReserve = (yield etherex.getCollateral(chosenBidReserveUser)).toNumber();
                var collAskReserve = (yield etherex.getCollateral(chosenAskReserveUser)).toNumber();
                var reserveBidPrice = (yield etherex.getBidReservePrice(0)).toNumber();
                var reserveAskPrice = (yield etherex.getAskReservePrice(0)).toNumber();
                var shareOfEachUser = (yield etherex.getShare()).toNumber();

                if (collBidReserve != shareOfEachUser) {
                    assert.equal(collBidReserve, -1 * (sumProduced - sumConsumed) * reserveBidPrice + shareOfEachUser, "colleteral bid")
                }
                if (collAskReserve != shareOfEachUser) {
                    assert.equal(collAskReserve, (sumConsumed - sumProduced) * reserveAskPrice + shareOfEachUser, "colleteral ask")
                }

                var energyBalance = yield etherex.getEnergyBalance.call(0);
                assert.equal(energyBalance.toNumber(), 0);
                var sumOfCollateral = yield etherex.getSumOfColleteral.call();
                chai.assert.closeTo(sumOfCollateral.toNumber(), 0, 100, "collateral should be close to zero"); // closeTo due to numeric errors
            })).not.to.be.rejected;
        });
    });


    describe.skip("SETTLEMENT", function() {
        it('no orders emitted - should work', function() {
            return expect(co(function*() {

            })).not.to.be.rejected;
        });
    });


    describe.skip("SETTLEMENT", function() {
        it('energy lack/excess regulated by more than one reserve order issuer - should work', function() {
            return expect(co(function*() {

            })).not.to.be.rejected;
        });
    });
});
