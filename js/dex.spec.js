'use strict';

const assert = require('assert');
const dex = require('./dex');

describe('randomly generate asks and bids', function() {

  var users = 5;

  var consumers = [];
  var producers = [];

  var reserveProviders = [];

  // TODO: reserve settle orders testen einzelnd und dann systematisch. ask bid order emitents verhalten sich ehrlich und die differenz wird von reserve übernommen, dann  sollte alles im schnitt null sein ???!?!!?
  var sumConsumed = 0;
  var sumProduced = 0;
  var sumReserved = 0;

  var TotalConsumedEnergy = 0;

  var period = 1;

  beforeEach(function() {
  });

  describe('get ask and bid orders', function() {
    it('should print ask and bid orders', function() {
      for (var i = 0; i < users; i++) {
        var erzeugung = Math.floor(Math.random() * 10) + 1;
        var price = 0;
        var owner = Math.floor(Math.random() * users) + 1;

        price = Math.floor(Math.random() * 99) + 1;
        if (dex.submitAskOrder(price, erzeugung, owner)) {
          producers.push(owner);
        }
      }

      for (var i = 0; i < users; i++) {
        var verbrauch = Math.floor(Math.random() * 10) + 1;
        var maxPrice = 0;
        var owner = Math.floor(Math.random() * users) + 1;

        if (Math.random() > 0.3) {
          maxPrice = Math.floor(Math.random() * 99) + 1;
        } else {
          maxPrice = 9999;
        }
        if (dex.submitBidOrder(maxPrice, verbrauch, owner)) {
          consumers.push(owner);
        }
      }

      console.log('\n######################################');
      console.log('############# Ask Orders #############');
      console.log('######################################');
      dex.getAskOrders();

      console.log('\n######################################');
      console.log('############## Bid Orders ############');
      console.log('######################################');
      dex.getBidOrders();
    });
  });

  describe('match', function() {
    it('should match', function() {
      dex.match();
    });
  });

  describe('randomly generate reserve asks', function() {
    it('should print ask orders', function() {
      for (var i = 0; i < users; i++) {
        var erzeugung = Math.floor(Math.random() * 300) + 1;
        var price = 0;
        var owner = Math.floor(Math.random() * users) + users;

        price = Math.floor(Math.random() * 99) + 1;
        if (dex.submitReserveAsk(price, erzeugung, owner)) {
          reserveProviders.push(owner);
        }
      }

      console.log('\n######################################');
      console.log('########## Reserve Ask Orders ########');
      console.log('######################################');
      dex.getAskOrders();
    });
  });

  describe('determineReservePrice', function() {
    it('should determineReservePrice', function() {
      dex.determineReservePrice();
    });
  });

  describe('get orders', function() {
    it('should print orders', function() {
      dex.getOrders();
    });
  });

  describe('settle', function() {
    it('should settle', function() {
      sumConsumed = 0;
      sumProduced = 0;
      sumReserved = 0;

      for (var user in consumers) {
        var vol = Math.floor(Math.random() * 10) + 1;
        sumConsumed += vol;
        dex.settle(consumers[user], 'CONSUMER', vol, period);
      }

      for (var user in producers) {
        var vol = Math.floor(Math.random() * 10) + 1;
        sumProduced += vol;
        dex.settle(producers[user], 'PRODUCER', vol, period);
      }

      for (var user in reserveProviders) {
        var vol = Math.floor(Math.random() * 10) + 1;
        sumReserved += vol;
        if (sumReserved > (sumConsumed - sumProduced)) {
          sumReserved -= vol;
          vol = (sumConsumed - sumProduced) - sumReserved;
          sumReserved += vol;
        }
        dex.settle(reserveProviders[user], 'PRODUCER', vol, period);
      }

      consumers = [];
      producers = [];
      reserveProviders = [];
    });
  });

  describe('', function() {
    it('', function() {
      console.log('\n######################################');
      console.log('########## Colleteral ################');
      console.log('######################################');
      // for (c in colleteral) {
      //   console.log('User ' + c + ': ' + colleteral[c]);
      // }

      console.log('\n######################################');
      console.log('########## Energy data ###############');
      console.log('######################################');

      console.log('\nConsumed Energy: ' + sumConsumed);
      console.log('Produced Energy: ' + sumProduced);
      console.log('Regulated Energy: ' + sumReserved);
    });
  });
});
