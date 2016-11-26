'use strict';

const assert = require('assert');
const dex = require('../dex');

describe('randomly generate asks and bids', function() {

  beforeEach(function() {
    dex.resetOrders();
  });

  describe('test bid orders', function() {
    it('should insert bid orders in descending order', function() {
      var numOrders = 100;
      for (var i = 1; i <= numOrders; i++) {
        for (var j = 1; j <= numOrders; j++) {
          dex.submitBidOrder(i + '_' + j, i * j, i * j);
        }
      }
      var bidOrders = dex.getBidOrders();
      var lastPrice = Number.MAX_SAFE_INTEGER;
      for (var i = 0; i < bidOrders.length; i++) {
        assert(bidOrders[i].price <= lastPrice);
        lastPrice = bidOrders[i].price;
      }
    });
  });

  describe('test ask orders', function() {
    it('should insert ask orders in ascending order', function() {
      var numOrders = 100;
      for (var i = 1; i <= numOrders; i++) {
        for (var j = 1; j <= numOrders; j++) {
          dex.submitAskOrder(i + '_' + j, i * j, i * j);
        }
      }
      var askOrders = dex.getAskOrders();
      var lastPrice = Number.MIN_SAFE_INTEGER;
      for (var i = 0; i < askOrders.length; i++) {
        assert(askOrders[i].price >= lastPrice);
        lastPrice = askOrders[i].price;
      }
    });
  });
});
