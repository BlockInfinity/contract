'use strict';

const assert = require('assert');
const dex = require('../dex');

describe('randomly generated asks and bids', function() {

    // beforeEach(function() {
    //     dex.resetOrders();
    // });

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



    describe('settle', function() {
        it('if all predictions are correct, the cumulative sum in the colleteral mapping should be zero', function() {
            var _users = 50;
            dex.test_submitBid(_users);
            dex.test_submitAsk(_users);
            dex.match();
            dex.test_submitReserve(_users);
            dex.determineReservePrice();
            dex.test_settle();

            var colleteral = dex.colleteral;
            var sum = 0;
            for (var i in colleteral) {
                sum += colleteral[i];

            }
            assert(sum == 0 || (sum < 0.001 && sum > -0.001));
        });
    });

    describe('match', function() {
        it('matched ask and bid order volumes should be the same', function() {
            var _users = 50;
            dex.test_submitBid(_users);
            dex.test_submitAsk(_users);
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
});
