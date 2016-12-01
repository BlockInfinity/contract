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
  });

  describe('submit orders by consumers', function() {
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

    it('register smart meters by certificate authority - should work', function() {
      return expect(co(function*() {
        assert(certificateAuthorities[0]);
        assert(producers[0]);
        assert(consumers[0]);
        yield etherex.registerCertificateAuthority(certificateAuthorities[0], {from: accounts[0]});
        yield etherex.registerSmartMeter(producers[0], consumers[0], {from: certificateAuthorities[0]});
      })).not.to.be.rejected;
    });

    it('register smart meters by consumer - should not work', function() {
      return expect(co(function*() {
        yield etherex.registerSmartMeter(producers[0], consumers[0], {from: consumers[0]});
      })).to.be.rejected;
    });

    it.skip('basic accounts balance test, every account has some ether', function() {
      for (var i = 0; i < accounts.length; i++) {
        assert(eth.getBalance(accounts[i]) > 0, 'The account ' + accounts[i] + ' does not have a balance > 0');
      }
    });
  });

  describe('submit orders by consumers', function() {

    var priceMultiplier = 100;
    var volumeMultiplier = 100;

    beforeEach(function() {
      return co(function*() {
        for (var i = 0; i < certificateAuthorities.length; i++) {
          assert(certificateAuthorities[i]);
          yield etherex.registerCertificateAuthority(certificateAuthorities[i], {from: accounts[0]});
        }

        for (var i = 0; i < producers.length; i++) {
          assert(producers[i]);
          assert(consumers[i]);
          yield etherex.registerSmartMeter(producers[i], consumers[i], {from: certificateAuthorities[0]});
        }
      });
    });

    afterEach(function() {
      return co(function*() {
        yield etherex.reset();
      });
    });

    it.skip('submit bids by producer - should not work', function() {
      return expect(co(function*() {
        yield etherex.submitBid(1 * priceMultiplier, 1 * volumeMultiplier, {from: producers[0]});
      })).to.be.rejected;
    });

    it('insert bids with price in ascending order - should work', function() {
      assert(consumers.length >= 10);
      return expect(co(function*() {
        var orderIds = [];
        for (var i = 0; i < 10; i++) {
          yield etherex.submitBid(i * priceMultiplier, i * volumeMultiplier, {from: consumers[i]});
          var lastOrderId = yield etherex.getOrderIdLastOrder.call();
          orderIds.unshift(lastOrderId.toNumber());
        }

        for (var i = 0; i < orderIds.length; i++) {
          var orderId = yield etherex.getOrderId.call(orderIds[i]);
          assert(orderIds[i] === orderId.toNumber());
          var nex = yield etherex.getOrderNext.call(orderIds[i]);
          assert((i === (orderIds.length - 1) ? 0 : (orderId.toNumber() - 1)) === nex.toNumber());
          var price = yield etherex.getOrderPrice.call(orderIds[i]);
          assert((orderIds.length - i - 1) * priceMultiplier === price.toNumber());
          var volume = yield etherex.getOrderVolume.call(orderIds[i]);
          assert((orderIds.length - i - 1) * volumeMultiplier === volume.toNumber());
        }
      })).not.to.be.rejected;
    });

    it('insert bids with price in descending order - should work', function() {
      assert(consumers.length >= 10);
      return expect(co(function*() {
        var orderIds = [];
        for (var i = 9; i >= 0; i--) {
          yield etherex.submitBid(i * priceMultiplier, i * volumeMultiplier, {from: consumers[i]});
          var lastOrderId = yield etherex.getOrderIdLastOrder.call();
          orderIds.push(lastOrderId.toNumber());
        }

        for (var i = 0; i < orderIds.length; i++) {
          var orderId = yield etherex.getOrderId.call(orderIds[i]);
          assert(orderIds[i] === orderId.toNumber());
          var nex = yield etherex.getOrderNext.call(orderIds[i]);
          assert((i === (orderIds.length - 1) ? 0 : (orderId.toNumber() + 1)) === nex.toNumber());
          var price = yield etherex.getOrderPrice.call(orderIds[i]);
          assert((orderIds.length - i - 1) * priceMultiplier === price.toNumber());
          var volume = yield etherex.getOrderVolume.call(orderIds[i]);
          assert((orderIds.length - i - 1) * volumeMultiplier === volume.toNumber());
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
          yield etherex.submitAsk(i * priceMultiplier, i * volumeMultiplier, {from: producers[i]});
          var lastOrderId = yield etherex.getOrderIdLastOrder.call();
          orderIds.push(lastOrderId.toNumber());
        }

        for (var i = 0; i < orderIds.length; i++) {
          var orderId = yield etherex.getOrderId.call(orderIds[i]);
          assert(orderIds[i] === orderId.toNumber());
          var nex = yield etherex.getOrderNext.call(orderIds[i]);
          assert((i === (orderIds.length - 1) ? 0 : (orderId.toNumber() + 1)) === nex.toNumber());
          var price = yield etherex.getOrderPrice.call(orderIds[i]);
          assert(i * priceMultiplier === price.toNumber());
          var volume = yield etherex.getOrderVolume.call(orderIds[i]);
          assert(i * volumeMultiplier === volume.toNumber());
        }
      })).not.to.be.rejected;
    });

    it('insert bids with price in descending order - should work', function() {
      assert(producers.length >= 10);
      return expect(co(function*() {
        var orderIds = [];
        for (var i = 9; i >= 0; i--) {
          yield etherex.submitAsk(i * priceMultiplier, i * volumeMultiplier, {from: producers[i]});
          var lastOrderId = yield etherex.getOrderIdLastOrder.call();
          orderIds.unshift(lastOrderId.toNumber());
        }

        for (var i = 0; i < orderIds.length; i++) {
          var orderId = yield etherex.getOrderId.call(orderIds[i]);
          assert(orderIds[i] === orderId.toNumber());
          var nex = yield etherex.getOrderNext.call(orderIds[i]);
          assert((i === (orderIds.length - 1) ? 0 : (orderId.toNumber() - 1)) === nex.toNumber());
          var price = yield etherex.getOrderPrice.call(orderIds[i]);
          assert(i * priceMultiplier === price.toNumber());
          var volume = yield etherex.getOrderVolume.call(orderIds[i]);
          assert(i * volumeMultiplier === volume.toNumber());
        }
      })).not.to.be.rejected;
    });
  });

  describe.skip('match bid and ask orders', function() {

    var priceMultiplier = 100;
    var volumeMultiplier = 100;

    beforeEach(function() {
      return co(function*() {
        for (var i = 0; i < certificateAuthorities.length; i++) {
          assert(certificateAuthorities[i]);
          yield etherex.registerCertificateAuthority(certificateAuthorities[i], {from: accounts[0]});
        }

        for (var i = 0; i < producers.length; i++) {
          assert(producers[i]);
          assert(consumers[i]);
          yield etherex.registerSmartMeter(producers[i], consumers[i], {from: certificateAuthorities[0]});
        }
      });
    });

    it('no orders inserted - no matching price', function() {
      return expect(co(function*() {
        yield etherex.matching();
        var matchingPrice = yield etherex.getMatchingPriceMapping.call(1);
        assert.equal(matchingPrice.toNumber(), Math.pow(2, 128) - 1);
      })).not.to.be.rejected;
    });
  });

  describe.skip('match bid and ask orders', function() {

    var priceMultiplier = 100;
    var volumeMultiplier = 100;

    beforeEach(function() {
      return co(function*() {
        for (var i = 0; i < certificateAuthorities.length; i++) {
          assert(certificateAuthorities[i]);
          yield etherex.registerCertificateAuthority(certificateAuthorities[i], {from: accounts[0]});
        }

        for (var i = 0; i < producers.length; i++) {
          assert(producers[i]);
          assert(consumers[i]);
          yield etherex.registerSmartMeter(producers[i], consumers[i], {from: certificateAuthorities[0]});
        }
      });
    });

    it('minAsk is greater than maxBid - no matching price', function() {
      return expect(co(function*() {
        for (var i = 0; i < 10; i++) {
          yield etherex.submitBid(i * priceMultiplier, i * volumeMultiplier, {from: consumers[i]});
        }
        for (var i = 10; i < 20; i++) {
          yield etherex.submitAsk(i * priceMultiplier, i * volumeMultiplier, {from: producers[i]});
        }
        yield etherex.matching();
        var matchingPrice = yield etherex.getMatchingPriceMapping.call(1);
        assert.equal(matchingPrice.toNumber(), Math.pow(2, 128) - 1);
      })).not.to.be.rejected;
    });
  });

  describe.skip('match bid and ask orders', function() {

    var priceMultiplier = 100;
    var volumeMultiplier = 100;

    beforeEach(function() {
      return co(function*() {
        for (var i = 0; i < certificateAuthorities.length; i++) {
          assert(certificateAuthorities[i]);
          yield etherex.registerCertificateAuthority(certificateAuthorities[i], {from: accounts[0]});
        }

        for (var i = 0; i < producers.length; i++) {
          assert(producers[i]);
          assert(consumers[i]);
          yield etherex.registerSmartMeter(producers[i], consumers[i], {from: certificateAuthorities[0]});
        }
      });
    });

    // cumBidVol = 2400, cumAskVol = 2800 => use only portion ask orders
    it('cumBidVol < cumAskVol - should work', function() {
      return expect(co(function*() {
        for (var i = 0; i < 10; i++) {
          yield etherex.submitBid(i * priceMultiplier, i * volumeMultiplier, {from: consumers[i]});
        }
        for (var i = 0; i < 10; i++) {
          yield etherex.submitAsk(i * priceMultiplier, i * volumeMultiplier, {from: producers[i]});
        }
        yield etherex.matching();
        var expectedMatchAsks = [{p: 0, v: 0}, {p: 1, v: 85}, {p: 2, v: 171}, {p: 3, v: 257}, {p: 4, v: 342}, {p: 5, v: 428}, {p: 6, v: 514}, {p: 7, v: 600}];
        for (var i = 0; i < expectedMatchAsks.length; i++) {
          var volume = yield etherex.getMatchedAskOrderMapping.call(1, producers[expectedMatchAsks[i].p]);
          assert.equal(volume.toNumber(), expectedMatchAsks[i].v);
        }
        var expectedMatchBids = [{p: 7, v: 700}, {p: 8, v: 800}, {p: 9, v: 900}];
        for (var i = 0; i < expectedMatchBids.length; i++) {
          var volume = yield etherex.getMatchedBidOrderMapping.call(1, consumers[expectedMatchBids[i].p]);
          assert.equal(volume.toNumber(), expectedMatchBids[i].v);
        }
        var matchingPrice = yield etherex.getMatchingPriceMapping.call(1);
        assert.equal(matchingPrice.toNumber(), 700);
      })).not.to.be.rejected;
    });
  });

  describe('match bid and ask orders', function() {

    var priceMultiplier = 100;
    var volumeMultiplier = 100;

    beforeEach(function() {
      return co(function*() {
        for (var i = 0; i < certificateAuthorities.length; i++) {
          assert(certificateAuthorities[i]);
          yield etherex.registerCertificateAuthority(certificateAuthorities[i], {from: accounts[0]});
        }

        for (var i = 0; i < producers.length; i++) {
          assert(producers[i]);
          assert(consumers[i]);
          yield etherex.registerSmartMeter(producers[i], consumers[i], {from: certificateAuthorities[0]});
        }
      });
    });

    // cumBidVol = 4500, cumAskVol = 100 => use only portion bid orders
    it('cumBidVol > cumAskVol - should work', function() {
      return expect(co(function*() {
        for (var i = 0; i < 10; i++) {
          yield etherex.submitBid(i * priceMultiplier, i * volumeMultiplier, {from: consumers[i]});
        }
        yield etherex.submitAsk(0 * priceMultiplier, 1 * volumeMultiplier, {from: producers[0]});
        yield etherex.matching();
        var expectedMatchAsks = [{p: 0, v: 100}];
        for (var i = 0; i < expectedMatchAsks.length; i++) {
          var volume = yield etherex.getMatchedAskOrderMapping.call(1, producers[expectedMatchAsks[i].p]);
          assert.equal(volume.toNumber(), expectedMatchAsks[i].v);
        }
        var expectedMatchBids = [{p: 0, v: 0}, {p: 1, v: 2}, {p: 2, v: 4}, {p: 3, v: 6}, {p: 4, v: 8}, {p: 5, v: 11}, {p: 6, v: 13}, {p: 7, v: 15}, {p: 8, v: 17}, {p: 9, v: 20}];
        for (var i = 0; i < expectedMatchBids.length; i++) {
          var volume = yield etherex.getMatchedBidOrderMapping.call(1, consumers[expectedMatchBids[i].p]);
          assert.equal(volume.toNumber(), expectedMatchBids[i].v);
        }
        var matchingPrice = yield etherex.getMatchingPriceMapping.call(1);
        assert.equal(matchingPrice.toNumber(), 0);
      })).not.to.be.rejected;
    });
  });
});
