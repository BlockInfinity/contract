var expect = require("chai").expect;
var dex = require("../js/dex");
var assert = require("assert");


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
