'use strict';

const co = require('co');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
chai.use(chaiAsPromised);

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

        for (var i = 0; i < 10; i++) {
          yield etherex.submitBid(i * priceMultiplier, i * volumeMultiplier, {from: consumers[i]});
          yield etherex.submitAsk(i * priceMultiplier, i * volumeMultiplier, {from: producers[i]});
        }
      });
    });

    afterEach(function() {
      return co(function*() {
        yield etherex.reset();
      });
    });

    // Todo(ms): fix test, check content of matched orders
    it('call match() - should work', function() {
      return expect(co(function*() {
        etherex.matching();
      })).not.to.be.rejected;
    });
  });



  // Tests for determining reserve bid and reserve ask prices
  describe('determine reserve  prices', function() {
    
    var priceMultiplier = 100;
    var volumeMultiplier = 100;
    var reserveVolumeMultiplier = 1000000;
    
    beforeEach(function() {
      co(function*() {
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

        etherex.matching();

        
        for (var i = 1; i < 5; i++) {
          yield etherex.submitReserveBid(i * priceMultiplier, i * reserveVolumeMultiplier, {from: consumers[i]});
          yield etherex.submitReserveAsk(i * priceMultiplier, i * reserveVolumeMultiplier, {from: producers[i]});
        }

      });


    });


    afterEach(function() {
      return co(function*() {
        yield etherex.reset();
      });
    });


    it('determine reserve ask price', function(done) {
        
        etherex.determineReserveAskPrice.call().then(function(result) {

          
          var price = result.toNumber();
          expect(price).to.not.equal(0);
          assert(price <= priceMultiplier*5, "Price is larger than max possible price: " + price);
          //TODO check if price is right
          done();

        });

    });



    it('determine reserve bid price', function(done) {
          
          etherex.determineReserveBidPrice.call().then(function(result) {

          var price = result.toNumber();
          expect(price).to.not.equal(0);
          assert(price <= priceMultiplier*10, "Price is larger than max possible price: " + price);

          //TODO check if price is right

          done();

        });

    });


  }); 

});
