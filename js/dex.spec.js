'use strict';

const assert = require('assert');
const dex = require('./dex');

describe('randomly generated asks and bids', function() {

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

    describe('match', function() {
        it('matched ask and bid order volumes should be the same', function() {
            var _users = 50;
            submitRandomBidOrders(_users);
            submitRandomAskOrders(_users);

            dex.match();

            var sum = 0;
            for (var user in dex.matchedAskOrderMapping[dex.period]) {
              sum += dex.matchedAskOrderMapping[dex.period][user].offeredVolume;
            }
            for (var user in dex.matchedBidOrderMapping[dex.period]) {
              sum -= dex.matchedBidOrderMapping[dex.period][user].orderedVolume;
            }
            assert(sum == 0 || (sum < 0.001 && sum > -0.001));
          });
      });

    describe('settlement without reserve orders', function() {
        it('if all predictions are correct, the cumulative sum in the colleteral mapping should be zero', function() {
            var _users = 50;
            submitRandomAskOrders(_users);
            submitRandomBidOrders(_users);
            dex.match();
            submitRandomBidReserveOrders(_users);
            submitRandomAskReserveOrders(_users);
            dex.determineReserveAskPrice();
            dex.determineReserveBidPrice();
            perfectSettle();

            var colleteral = dex.colleteral;
            var sum = 0;
            for (var i in colleteral) {
              sum += colleteral[i];

            }
            assert(sum == 0 || (sum < 0.001 && sum > -0.001));
          });

        it('settlemet with reserve orders', function() {
            var _users = 50;
            submitRandomAskOrders(_users);
            submitRandomBidOrders(_users);
            dex.match();
            submitRandomBidReserveOrders(_users);
            submitRandomAskReserveOrders(_users);
            dex.determineReserveAskPrice();
            dex.determineReserveBidPrice();
            randomSettle();

            var colleteral = dex.colleteral;
            var sum = 0;
            for (var i in colleteral) {
              sum += colleteral[i];

            }
            assert(sum == 0 || (sum < 0.001 && sum > -0.001));
          });
      });

  });

var consumers = [];
var producers = [];
var reserveAskProviders = [];
var reserveBidProviders = [];

var sumConsumed = 0;
var sumProduced = 0;
var sumReserved = 0;

var matchedAskOrderMapping = dex.matchedAskOrderMapping;
var matchedBidOrderMapping = dex.matchedBidOrderMapping;
var period = dex.period;

// unique owner id for each submitted order
var owner = 1;

function checkAskShare() {
  var sum = 0;
  for (var user in matchedAskOrderMapping[period]) {
    sum += matchedAskOrderMapping[period][user].offeredVolume;
  }
  for (var user in matchedBidOrderMapping[period]) {
    sum -= matchedBidOrderMapping[period][user].orderedVolume;
  }
  return (sum == 0 || (sum < 0.001 && sum > -0.001));
}

function checkCollateral() {
  var sum = 0;
  for (var i in colleteral) {
    sum += colleteral[i];
  }
  return (sum == 0 || (sum < 0.001 && sum > -0.001));
}


// settlement mit Erzeugungs- und Verbrauchsdaten, welche den zuvor abgegebenen order volumes entsprechen. Es kommt nicht zu einem Ungleichgewicht und die Reserve Users müssen nicht eingreifen
function perfectSettle() {

  sumConsumed = 0;
  sumProduced = 0;
  sumReserved = 0;

  for (var user in matchedBidOrderMapping[period]) {
    var vol = Math.floor(Math.random() * 10) + 1;
    sumConsumed += vol;
    settle(user, 'CONSUMER', matchedBidOrderMapping[period][user].orderedVolume, period);
  }

  for (user in matchedAskOrderMapping[period]) {
    var vol = Math.floor(Math.random() * 10) + 1;
    sumProduced += vol;
    settle(user, 'PRODUCER', matchedAskOrderMapping[period][user].offeredVolume, period);
  }

  consumers = [];
  producers = [];
}

function submitRandomAskReserveOrders(_users) {
  for (var i = 0; i < _users; i++) {
    var volume = Math.floor(Math.random() * 300) + 1;
    var price = Math.floor(Math.random() * 99) + 1;

    if (dex.saveOrder('ASK', price, volume, owner)) {
      reserveAskProviders.push({id: owner++, vol: volume});
    }
  }
}

function submitRandomBidReserveOrders(_users) {
  for (var i = 0; i < _users; i++) {
    var volume = Math.floor(Math.random() * 300) + 1;
    var price = Math.floor(Math.random() * 99) + 1;

    if (dex.saveOrder('BID', price, volume, owner)) {
      reserveBidProviders.push({id: owner++, vol: volume});
    }
  }
}

function submitRandomAskOrders(_users) {
  for (var i = 0; i < _users; i++) {
    var volume = Math.floor(Math.random() * 10) + 1;
    var price = Math.floor(Math.random() * 99) + 1;

    if (dex.saveOrder('ASK', price, volume, owner)) {
      producers.push({id: owner++, vol: volume});
    }
  }
}

function submitRandomBidOrders(_users) {
  for (var i = 0; i < _users; i++) {
    var volume = Math.floor(Math.random() * 10) + 1;
    var price = 0;

    if (Math.random() > 0.3) {
      price = Math.floor(Math.random() * 99) + 1;
    } else {
      price = 9999;
    }
    if (dex.saveOrder('BID', price, volume, owner)) {
      consumers.push({id: owner++, vol: volume});
    }
  }
}

// settlement mit zufälligen Erzeugungs- und Verbrauchsdaten. Es kommt zu einem Ungleichgewicht und die Reserve users müssen jenes Ungleichgewicht regulieren.
function randomSettle() {

  sumConsumed = 0;
  sumProduced = 0;
  sumReserved = 0;

  for (var user in matchedBidOrderMapping[period]) {
    var vol = Math.floor(Math.random() * 10) + 1;
    sumConsumed += vol;
    settle(user, 'CONSUMER', vol, period);
  }

  for (var user in matchedAskOrderMapping[period]) {
    var vol = Math.floor(Math.random() * 10) + 1;
    sumProduced += vol;
    settle(user, 'PRODUCER', vol, period);
  }

  if (sumProduced != sumConsumed) {
    if (sumProduced > sumConsumed) {
      for (var user in reserveBidProviders) {

      }

    } else {

    }
  }

  if (sumProduced < sumConsumed) {
    for (user in reserveAskProviders) {
      var vol = Math.floor(Math.random() * 10) + 1;
      sumReserved += vol;
      if (sumReserved > (sumConsumed - sumProduced)) {
        sumReserved -= vol;
        vol = (sumConsumed - sumProduced) - sumReserved;
        sumReserved += vol;
      }
      if (vol != 0) {
        settle(reserveAskProviders[user].id, 'PRODUCER', reserveAskProviders[user].vol, period);
      }

    }
  }

  consumers = [];
  producers = [];
  reserveAskProviders = [];
}

