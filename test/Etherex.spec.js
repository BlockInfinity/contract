'use strict';

const co = require('co');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
chai.use(chaiAsPromised);
const assert = require('assert');

const eth = web3.eth;

const PERCENTAGE_CERTIFICATE_AUTHORITIES = 0.05;
const PERCENTAGE_PRODUCERS = 0.5;

contract('Etherex', function(accounts) {

  var certificateAuthorities;
  var producers;
  var consumers;
  var etherex;

  beforeEach(function() {
    return co(function*() {
      // default account
      eth.defaultAccount = accounts[0];
      // certificate authorities
      certificateAuthorities = accounts.slice(0, PERCENTAGE_CERTIFICATE_AUTHORITIES * accounts.length);
      // all accounts
      accounts = accounts.slice(PERCENTAGE_CERTIFICATE_AUTHORITIES * accounts.length, accounts.length);
      // producers
      producers = accounts.slice(0, PERCENTAGE_PRODUCERS * accounts.length);
      // consumers
      consumers = accounts.slice(PERCENTAGE_PRODUCERS * accounts.length, accounts.length);
      // set up etherex
      etherex = Etherex.deployed();

      assert(certificateAuthorities[0]);
      yield etherex.registerCertificateAuthority(certificateAuthorities[0], {from: accounts[0]});
      for (var i = 0; i < producers.length; i++) {
        assert(producers[i]);
        yield etherex.registerProducer(producers[i], {from: certificateAuthorities[0]});
      }
      for (var i = 0; i < consumers.length; i++) {
        assert(consumers[i]);
        yield etherex.registerConsumer(consumers[i], {from: certificateAuthorities[0]});
      }
    });
  });

  describe.skip('register certificate authorities and producers', function() {
    it('The contract should be deployed to the blockchain', function(done) {
      assert(etherex);
      done();
    });

    it('register certificate authorities - should work', function() {
      return expect(co(function*() {
        assert(accounts[0]);
        for (var i = 0; i < certificateAuthorities.length; i++) {
          assert(certificateAuthorities[i]);
          yield etherex.registerCertificateAuthority(certificateAuthorities[i], {from: accounts[0]});
        }
      })).not.to.be.rejected;
    });

    it('register producer by certificate authority - should work', function() {
      return expect(co(function*() {
        assert(certificateAuthorities[0]);
        assert(producers[0]);
        yield etherex.registerCertificateAuthority(certificateAuthorities[0], {from: accounts[0]});
        yield etherex.registerProducer(producers[0], {from: certificateAuthorities[0]});
      })).not.to.be.rejected;
    });

    it('register producer by consumer - should not work', function() {
      return expect(co(function*() {
        yield etherex.registerProducer(producers[0], {from: consumers[0]});
      })).to.be.rejected;
    });
  });

  describe.skip('submit orders', function() {

    var priceMultiplier = 100;
    var volumeMultiplier = 100;

    it('submit bids by producer - should not work', function() {
      return expect(co(function*() {
        yield etherex.submitBid(1 * priceMultiplier, 1 * volumeMultiplier, {from: producers[0]});
      })).to.be.rejected;
    });

    it('insert bids with price in ascending order - should work', function() {
      assert(consumers.length >= 10);
      return expect(co(function*() {
        var orderIds = [];
        for (var i = 0; i < 10; i++) {
          yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, {from: consumers[i]});
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

    it('insert bids with price in descending order - should work', function() {
      assert(consumers.length >= 10);
      return expect(co(function*() {
        var orderIds = [];
        for (var i = 9; i >= 0; i--) {
          yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, {from: consumers[i]});
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

    it('submit asks by consumer - should not work', function() {
      return expect(co(function*() {
        yield etherex.submitAsk(1 * priceMultiplier, 1 * volumeMultiplier, {from: consumers[0]});
      })).to.be.rejected;
    });

    it('insert asks with price in ascending order - should work', function() {
      assert(producers.length >= 10);
      return expect(co(function*() {
        var orderIds = [];
        for (var i = 0; i < 10; i++) {
          yield etherex.submitAsk(100 + i * priceMultiplier, 100 + i * volumeMultiplier, {from: producers[i]});
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

    it('insert bids with price in descending order - should work', function() {
      assert(producers.length >= 10);
      return expect(co(function*() {
        var orderIds = [];
        for (var i = 9; i >= 0; i--) {
          yield etherex.submitAsk(100 + i * priceMultiplier, 100 + i * volumeMultiplier, {from: producers[i]});
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

  describe.skip('match bid and ask orders', function() {

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

  describe.skip('match bid and ask orders', function() {

    var priceMultiplier = 100;
    var volumeMultiplier = 100;

    it('minAsk is greater than maxBid - no matching price', function() {
      return expect(co(function*() {
        for (var i = 0; i < 10; i++) {
          yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, {from: consumers[i]});
        }
        for (var i = 10; i < 20; i++) {
          yield etherex.submitAsk(100 + i * priceMultiplier, 100 + i * volumeMultiplier, {from: producers[i]});
        }
        yield etherex.nextState();
        var matchingPrice = yield etherex.getMatchingPrices.call(0);
        assert.equal(matchingPrice.toNumber(), Math.pow(2, 128) - 1);
      })).not.to.be.rejected;
    });
  });

  describe.skip('match bid and ask orders', function() {

    var priceMultiplier = 100;
    var volumeMultiplier = 100;

    // cumBidVol = 2400, cumAskVol = 2800 => use only portion ask orders
    it('cumBidVol < cumAskVol - should work', function() {
      return expect(co(function*() {
        for (var i = 0; i < 10; i++) {
          yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, {from: consumers[i]});
        }
        for (var i = 0; i < 10; i++) {
          yield etherex.submitAsk(100 + i * priceMultiplier, 100 + i * volumeMultiplier, {from: producers[i]});
        }
        yield etherex.nextState();
        var expectedMatchAsks = [{p: 0, v: 75}, {p: 1, v: 150}, {p: 2, v: 225}, {p: 3, v: 300}, {p: 4, v: 375}, {p: 5, v: 450}, {p: 6, v: 525}, {p: 7, v: 600}];
        for (var i = 0; i < expectedMatchAsks.length; i++) {
          var volume = yield etherex.getMatchedAskOrders.call(0, producers[expectedMatchAsks[i].p]);
          assert.equal(volume.toNumber(), expectedMatchAsks[i].v);
        }
        var expectedMatchBids = [{p: 7, v: 800}, {p: 8, v: 900}, {p: 9, v: 1000}];
        for (var i = 0; i < expectedMatchBids.length; i++) {
          var volume = yield etherex.getMatchedBidOrders.call(0, consumers[expectedMatchBids[i].p]);
          assert.equal(volume.toNumber(), expectedMatchBids[i].v);
        }
        var matchingPrice = yield etherex.getMatchingPrices.call(0);
        assert.equal(matchingPrice.toNumber(), 800);
      })).not.to.be.rejected;
    });
  });

  describe.skip('match bid and ask orders', function() {

    var priceMultiplier = 100;
    var volumeMultiplier = 100;

    // cumBidVol = 4500, cumAskVol = 100 => use only portion bid orders
    it('cumBidVol > cumAskVol - should work', function() {
      return expect(co(function*() {
        for (var i = 0; i < 10; i++) {
          yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, {from: consumers[i]});
        }
        yield etherex.submitAsk(0 * priceMultiplier, 1 * volumeMultiplier, {from: producers[0]});
        yield etherex.nextState();
        var expectedMatchAsks = [{p: 0, v: 100}];
        for (var i = 0; i < expectedMatchAsks.length; i++) {
          var volume = yield etherex.getMatchedAskOrders.call(0, producers[expectedMatchAsks[i].p]);
          assert.equal(volume.toNumber(), expectedMatchAsks[i].v);
        }
        var expectedMatchBids = [{p: 0, v: 1}, {p: 1, v: 3}, {p: 2, v: 5}, {p: 3, v: 7}, {p: 4, v: 9}, {p: 5, v: 10}, {p: 6, v: 12}, {p: 7, v: 14}, {p: 8, v: 16}, {p: 9, v: 18}];
        for (var i = 0; i < expectedMatchBids.length; i++) {
          var volume = yield etherex.getMatchedBidOrders.call(0, consumers[expectedMatchBids[i].p]);
          assert.equal(volume.toNumber(), expectedMatchBids[i].v);
        }
        var matchingPrice = yield etherex.getMatchingPrices.call(0);
        assert.equal(matchingPrice.toNumber(), 0);
      })).not.to.be.rejected;
    });
  });

  // todo(ms): will probably fail due to changes in contract
  describe.skip('determine reserve bid and ask prices', function() {

    var priceMultiplier = 100;
    var volumeMultiplier = 100;
    var reserveVolumeMultiplier = 1000000;

    beforeEach(function() {
      return co(function*() {
        for (var i = 1; i < certificateAuthorities.length; i++) {
          assert(certificateAuthorities[i]);
          yield etherex.registerCertificateAuthority(certificateAuthorities[i], {from: accounts[0]});
        }
        for (var i = 1; i < producers.length; i++) {
          assert(producers[i]);
          assert(consumers[i]);
          yield etherex.registerSmartMeter(producers[i], consumers[i], {from: certificateAuthorities[0]});
        }
        for (var i = 1; i < 10; i++) {
          yield etherex.submitBid(i * priceMultiplier, i * volumeMultiplier, {from: consumers[i]});
          yield etherex.submitAsk(i * priceMultiplier, i * volumeMultiplier, {from: producers[i]});
        }
        yield etherex.matching();
        for (var i = 1; i < 5; i++) {
          yield etherex.submitBid(i * priceMultiplier, i * reserveVolumeMultiplier, {from: consumers[i]});
          yield etherex.submitAsk(i * priceMultiplier, i * reserveVolumeMultiplier, {from: producers[i]});
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

  describe('settle order', function() {

    var priceMultiplier = 100;
    var volumeMultiplier = 100;

    it('perfect settle - should work', function() {
      return expect(co(function*() {
        for (var i = 0; i < 10; i++) {
          yield etherex.submitBid(100 + i * priceMultiplier, 100 + i * volumeMultiplier, {from: consumers[i]});
        }
        for (var i = 0; i < 10; i++) {
          yield etherex.submitAsk(100 + i * priceMultiplier, 100 + i * volumeMultiplier, {from: producers[i]});
        }

        yield etherex.nextState();

        var matchingPrice = yield etherex.getMatchingPrices.call(0);
        assert.equal(matchingPrice.toNumber(), 800);
        yield etherex.submitBid(1, 1, {from: consumers[10]});
        yield etherex.submitAsk(1, 1, {from: producers[10]});

        yield etherex.nextState();

        for (var i = 0; i < 8; i++) {
          var volume = yield etherex.getMatchedAskOrders.call(0, producers[i]);
          yield etherex.settle(producers[i], 1, volume.toNumber(), 0, {from: producers[i]});
          var collateral = yield etherex.getCollateral.call(producers[i]);
          assert.equal(collateral.toNumber(), volume.toNumber() * matchingPrice.toNumber());
        }
        for (var i = 7; i < 10; i++) {
          var volume = yield etherex.getMatchedBidOrders.call(0, consumers[i]);
          yield etherex.settle(consumers[i], 2, volume.toNumber(), 0, {from: consumers[i]});
          var collateral = yield etherex.getCollateral.call(consumers[i]);
          assert.equal(collateral.toNumber(), -volume.toNumber() * matchingPrice.toNumber());
        }
        var excess = yield etherex.getExcess.call(0);
        assert.equal(excess.toNumber(), 0);
        var lack = yield etherex.getLack.call(0);
        assert.equal(lack.toNumber(), 0);
        var sumProduced = yield etherex.getSumProduced.call(0);
        assert.equal(sumProduced.toNumber(), 2700);
        var sumConsumed = yield etherex.getSumConsumed.call(0);
        assert.equal(sumConsumed.toNumber(), 2700);
        var sumOfCollateral = yield etherex.getSumOfColleteral.call();
        assert.equal(sumOfCollateral.toNumber(), 0);
        var energyBalance = yield etherex.getEnergyBalance.call(0);
        assert.equal(energyBalance.toNumber(), 0);
      })).not.to.be.rejected;
    });
  });

});
