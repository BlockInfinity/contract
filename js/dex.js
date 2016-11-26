'use strict';

// const _ = require('lodash'); // require funktioniert nur auf server side, kann damit nicht im browser debuggen.

// global variables


var idToOrder = {};
var order_id = 100;
var tmpowners = {};

// gets reduced within the function settle once a user has not complied to his promised idToOrder
// gets also reduced once users consume energy without having emitted idToOrder at all
var colleteral = {};

const INITIAL_COLLATERAL = 10000;
// default max price for bid idToOrder if no price is provided
const DEFAULT_MAXPRICE = Number.MAX_SAFE_INTEGER;

// only for test. On blockchain the period is determined by the blocknumber.
var period = 1;

// here matched order information gets saved based on the period and owner. analog to mapping(address => mapping (period => Data))
var matchedAskOrderMapping = {};
var matchedBidOrderMapping = {};
var matchingPriceMapping = {};

const MIN_RESERVE_VOLUME = 1000; // kWh needed to be secured against any shortage
var matchedAskReserveOrderMapping = {};


var askReservePrices = {};

// bid idToOrder without _maxprice are simply idToOrder with
// a very high _maxprice (flex bid).
function submitBidOrder(_owner, _volume, _price) {
    if (!_owner) {
        throw new Error('_owner missing');
    }
    if (!_volume) {
        throw new Error('_volume missing');
    }
    if (!_price) {
        _price = DEFAULT_MAXPRICE;
    }
    newSaveOrder("BID", _price, _volume, _owner);
}

function submitAskOrder(_owner, _volume, _price) {
    if (!_owner) {
        throw new Error('_owner missing');
    }
    if (!_volume) {
        throw new Error('_volume missing');
    }
    if (!_price) {
        throw new Error('_price missing');
    }
    newSaveOrder("ASK", _price, _volume, _owner);
}

// reserve ask wird im selben ask order book gespeichert,
// da jenes beim matching geleert wird
function submitReserveAsk(_owner, _volume, _price) {
    if (!_owner) {
        throw new Error('_owner missing');
    }
    if (!_volume) {
        throw new Error('_volume missing');
    }
    if (!_price) {
        throw new Error('_price missing');
    }
    return newSaveOrder("ASK", _price, _volume, _owner);
}

function submitReserveBid(_owner, _volume, _price) {
    if (!_owner) {
        throw new Error('_owner missing');
    }
    if (!_volume) {
        throw new Error('_volume missing');
    }
    if (!_price) {
        _price = DEFAULT_MAXPRICE;
    }
    newSaveOrder("BID", _price, _volume, _owner)
}

var idCounter = 1;

var minAsk = {
    id: 0,
    nex: 0,
    owner: 0,
    volume: 0,
    price: 0,
};

var maxBid = {
    id: 0,
    nex: 0,
    owner: 0,
    volume: 0,
    price: 0,
};

var idToOrder = {};




function newSaveOrder(_type, _price, _volume, _owner) {

    // es darf pro periode stets nur eine order pro user abgegeben werden
    if (_owner in tmpowners) { // in solidity einfach im mapping auf 0 oder 1 prüfen
        //throw new Error('owner with _owner ' + _owner + ' already submitted an order.'); 
        //console.error('owner with _owner ' + _owner + ' already submitted an order.');
        return false;
    }

    tmpowners[_owner] = {};


    var curr_order = {
        id: idCounter++,
        nex: 0,
        owner: _owner,
        volume: _volume,
        price: _price,
    };

    var best_order = {
        id: 0,
        nex: 0,
        owner: 0,
        volume: 0,
        price: 0,
    };

    var ascending = 0;


    if (_type == "ASK") {
        best_order = minAsk;
        ascending = 1;

    } else if (_type == "BID") {
        best_order = maxBid;
        ascending = -1;
    }

    // save and return if this the first bid
    if (best_order.id == 0) {
        idToOrder[curr_order.id] = curr_order;
        best_order = curr_order;

    } else {
        // iterate over list till same price encountered
        var curr = best_order.id;
        var prev = 0;
        while (curr != 0 && (ascending * curr_order.price) > (ascending * idToOrder[curr].price)) {
            prev = curr;
            curr = idToOrder[curr].nex;
        }

        // update pointer 
        curr_order.nex = curr;

        // insert order
        idToOrder[curr_order.id] = curr_order;

        // curr_order added at the end
        if (curr_order.nex == best_order.id) {
            best_order = curr_order;

            // at least one prev order exists
        } else {
            idToOrder[prev].nex = curr_order.id;
        }
    }

    // best idToOrder werden im storage geupdated
    if (_type == "ASK") {
        minAsk = best_order;
    } else if (_type == "BID") {
        maxBid = best_order;
    }

    return true;
}



function getBidOrders() {
    var id_iter_bid = maxBid.id;
    var bidOrders = [];
    while (id_iter_bid != 0) {
        bidOrders.push(idToOrder[id_iter_bid]);
        id_iter_bid = idToOrder[id_iter_bid].nex;
    }
    return bidOrders;
}

function printBidOrders() {
    var bidOrderBook = getBidOrders();
    console.log("\nBID ORDERBOOK\n\n");
    for (var i in bidOrderBook) {
        console.log('Price: ' + bidOrderBook[i].price + ' | Volume: ' + bidOrderBook[i].volume + ' | Owner: ' + bidOrderBook[i].owner);
    }
}

function getAskOrders() {
    var iter_ask_id = minAsk.id;
    var askOrders = [];
    while (iter_ask_id != 0) {
        askOrders.push(idToOrder[iter_ask_id]);
        iter_ask_id = idToOrder[iter_ask_id].nex;
    }
    return askOrders;
}

function printAskOrders() {
    var askOrderBook = getAskOrders();
    console.log("\nASK ORDERBOOK\n\n");
    for (var i in askOrderBook) {
        console.log('Price: ' + askOrderBook[i].price + ' | Volume: ' + askOrderBook[i].volume + ' | Owner: ' + askOrderBook[i].owner);
    }
}

var cumAskVol = 0;
var cumBidVol = 0;
var matching_price;
var share;

// matches idToOrder and saves the resulting information in the matchedAskOrderMapping and matchedBidOrderMapping
// TODO: events rausballern für jeden user dessen idToOrder gematched wurden
function match() {
    if (Object.keys(idToOrder).length === 0) {
        resetOrders();
        return;
    }

    cumAskVol = 0;
    cumBidVol = 0;
    matching_price = 0;


    matching_price = idToOrder[minAsk.id].price;
    var isMatched = false;
    var outOfAskOrders = false;
    var bid_price = idToOrder[maxBid.id].price;
    var iter_ask_id = minAsk.id;
    var id_iter_bid = maxBid.id;
    period++;

    while (!isMatched) {
        while (iter_ask_id != 0 && (idToOrder[iter_ask_id].price === matching_price)) {

            var volume = idToOrder[iter_ask_id].volume;
            var owner = idToOrder[iter_ask_id].owner;
            cumAskVol += volume;

            appendToDoubleMapping(matchedAskOrderMapping, period, owner, {
                offeredVolume: volume
            });

            var nex = idToOrder[iter_ask_id].nex;
            if (nex) {
                iter_ask_id = nex;
            } else {
                outOfAskOrders = true;
                break;
            }


        }

        // TODO: iterates each time through the mapping. Find better solution!
        while (idToOrder[id_iter_bid].price >= matching_price) {
            var volume = idToOrder[id_iter_bid].volume;
            var owner = idToOrder[id_iter_bid].owner;
            cumBidVol += volume;

            appendToDoubleMapping(matchedBidOrderMapping, period, owner, {
                orderedVolume: volume
            });

            var nex = idToOrder[id_iter_bid].nex;
            id_iter_bid = nex;
            if (!id_iter_bid) {
                break;
            }
        }

        if (cumAskVol >= cumBidVol) {
            isMatched = true;
        } else if (outOfAskOrders) {
            isMatched = true;
        } else {
            matching_price = idToOrder[iter_ask_id].price;
            id_iter_bid = maxBid.id;
            cumBidVol = 0;
            matchedBidOrderMapping[period] = {};
        }
    }

    // calculates how much energy each producer can release into the grid within the next interval

    if (cumBidVol < cumAskVol) {
        share = cumBidVol / cumAskVol;
        for (owner in matchedAskOrderMapping[period]) {
            matchedAskOrderMapping[period][owner].offeredVolume = matchedAskOrderMapping[period][owner].offeredVolume * share;
        }

    } else {
        share = cumAskVol / cumBidVol;
        for (owner in matchedBidOrderMapping[period]) {
            matchedBidOrderMapping[period][owner].orderedVolume = matchedBidOrderMapping[period][owner].orderedVolume * share;
        }
    }


    if (!checkAskShare()) {
        debugger;
        throw new Error("Share of Ask orders does not fit")
    }
    matchingPriceMapping[period] = matching_price;

    resetOrders();

}

function printMatchingResult() {

    console.log('\n######################################');
    console.log('########### Matching Result ##########');
    console.log('######################################');
    console.log('Matching price: ', matching_price, ' | Bid Volume: ', cumBidVol, ' | Ask Volume: ', cumAskVol, ' | share: ', share);

}

function resetOrders() {
    // both orderbooks need to be deleted
    // idToOrder = {};
    maxBid = {
        id: 0,
        nex: 0,
        owner: 0,
        volume: 0,
        price: 0,
    };

    minAsk = {
        id: 0,
        nex: 0,
        owner: 0,
        volume: 0,
        price: 0,
    };
    // the order information itself needs to be deleted
    tmpowners = {};
}

// takes a _mapping object and appends a value to the key combination.
// does also work with an empty object, that should become a mapping
function appendToDoubleMapping(_mapping, _key1, _key2, _value) {
    if (!_mapping) {
        throw new Error('_mapping is missing');
    }
    if (!_key1) {
        throw new Error('_key1 is missing');
    }
    if (!_key2) {
        throw new Error('_key2 is missing');
    }
    if (!_value) {
        throw new Error('_value is missing');
    }

    if (!_mapping[_key1]) {
        var mapping2 = {};
        mapping2[_key2] = _value;
        _mapping[_key1] = mapping2;
    } else {
        _mapping[_key1][_key2] = _value;
    }
}

var cumAskReserveVol = 0;
var reserve_ask_price;

// TODO: events rausballern für jeden user dessen idToOrder gematched wurden
// TODO: auch den Kaufpreis vorab bestimmen
function determineReserveAskPrice() {

    cumAskReserveVol = 0;
    var isFound = false;
    reserve_ask_price = idToOrder[minAsk.id].price;
    var iter_ask_id = minAsk.id;

    while (!isFound) {
        while (idToOrder[iter_ask_id].price === reserve_ask_price) {
            var volume = idToOrder[iter_ask_id].volume;
            var owner = idToOrder[iter_ask_id].owner;

            cumAskReserveVol += volume;
            appendToDoubleMapping(matchedAskReserveOrderMapping, period, owner, {
                volume: volume
            });

            var nex = idToOrder[iter_ask_id].nex;
            if (nex) {
                iter_ask_id = nex;
            } else {
                isFound = true;
                break;
            }
        }

        if (cumAskReserveVol >= MIN_RESERVE_VOLUME) {
            isFound = true;
        } else {
            reserve_ask_price = idToOrder[iter_ask_id].price;
        }
    }

 
    minAsk = {
        id: 0,
        nex: 0,
        owner: 0,
        volume: 0,
        price: 0,
    };

    askReservePrices[period] = reserve_ask_price;
}

var cumBidReserveVol = 0;
var reserve_bid_price;
var matchedBidReserveOrderMapping= {};
var bid_reserve_prices = {};

function determineReserveBidPrice() {
    cumBidReserveVol = 0;
    var isFound = false;
    reserve_bid_price = idToOrder[maxBid.id].price;
    var iter_bid_id = maxBid.id;

    while (!isFound) {
        while (idToOrder[iter_bid_id].price === reserve_bid_price) {
            var volume = idToOrder[iter_bid_id].volume;
            var owner = idToOrder[iter_bid_id].owner;

            cumBidReserveVol += volume;
            appendToDoubleMapping(matchedBidReserveOrderMapping, period, owner, {
                volume: volume
            });

            var nex = idToOrder[iter_bid_id].nex;
            if (nex) {
                iter_bid_id = nex;
            } else {
                isFound = true;
                break;
            }
        }

        if (cumBidReserveVol >= MIN_RESERVE_VOLUME) {
            isFound = true;
        } else {
            reserve_bid_price = idToOrder[iter_bid_id].price;
        }
    }

       maxBid = {
        id: 0,
        nex: 0,
        owner: 0,
        volume: 0,
        price: 0,
    };

    bid_reserve_prices[period] = reserve_bid_price;
}

function test1(){
    test_submit_bid_reserve(10);
    test_submit_ask_reserve(10);

    printBidOrders();
    printAskOrders();

    determineReserveBidPrice();
    determineReserveAskPrice();


    printReserveOrderMatchingResult();

}

function printReserveOrderMatchingResult() {
    console.log('\n######################################');
    console.log('####### Reserve BID Matching Result ######');
    console.log('######################################');
    console.log('\nReserve Price: ' + bid_reserve_prices[period] + ' | Volume (>1000): ' + cumBidReserveVol);
    console.log('\n######################################');


    console.log('\n\n\nn######################################');
    console.log('####### Reserve ASK Matching Result ######');
    console.log('######################################');
    console.log('\nReserve Price: ' + askReservePrices[period] + ' | Volume (>1000): ' + cumAskReserveVol);
    console.log('\n######################################');


}

function getMatchedAskOrders() {
    var matches = [];
    for (var period in matchedAskOrderMapping) {
        for (var owner in matchedAskOrderMapping[period]) {
            matches.push({ 'period': period, 'owner': owner, 'offeredVolume': matchedAskOrderMapping[period][owner].offeredVolume });
        }
    }
    return matches;
}


function printMatchedAskOrders() {
    var matches = getMatchedAskOrders();
    console.log("\nMatched ASK ORDERBOOK\n\n");
    for (var i in matches) {
        console.log('Period: ', matches[i].period, ' | Owner: ', matches[i].owner, ' | OfferedVol: ', matches[i].offeredVolume);
    }
}


function getMatchedBidOrders() {
    var matches = [];
    for (var period in matchedBidOrderMapping) {
        for (var owner in matchedBidOrderMapping[period]) {
            matches.push({ 'period': period, 'owner': owner, 'orderedVolume': matchedBidOrderMapping[period][owner].orderedVolume });
        }
    }
    return matches;
}

function printMatchedBidOrders() {
    var matches = getMatchedBidOrders();
    console.log("\nMatched BID ORDERBOOK\n\n");
    for (var i in matches) {
        console.log('Period: ', matches[i].period, ' | Owner: ', matches[i].owner, ' | OrderedVol: ', matches[i].orderedVolume);
    }
}

function settle(_user, _type, _volume, _period) {
    if (!_user) {
        throw new Error('_user is missing');
    }
    if (!_type) {
        throw new Error('_type is missing');
    }
    let supportedTypes = ['PRODUCER', 'CONSUMER'];
    // if (!_.includes(supportedTypes, _type)) {
    //     throw new Error('_type is not supported');
    // }
    if (!_volume) {
        console.error('_volume is missing');
    }
    if (_volume === 0) {
        console.error('_volume must be greater 0');
    };
    if (!_period) {
        throw new Error('_period is missing');
    }

    if (!matchedAskOrderMapping[_period] || !matchedBidOrderMapping[_period]) {
        throw new Error('period that should be settled does not exist');
    }

    if (!colleteral[_user]) {
        colleteral[_user] = 0;
    };

    var success = false;
    var user = _user;
    var ordered = 0;
    var offered = 0;
    var diff;

    //TODO set to price from period
    var reserveBidPrice = bid_reserve_prices[period];
    var reserveAskPrice = askReservePrices[period];
    var matchingPrice = matchingPriceMapping[period];

    if (_type === 'PRODUCER') {
        if (matchedAskReserveOrderMapping[_period][user]) {
            if (!matchedAskReserveOrderMapping[_period][user].offeredVolume) {
                console.warn("Position already settled.");
                return false;
            }

            offered = matchedAskReserveOrderMapping[_period][user].offeredVolume;
            diff = _volume - offered;
            var reservePrice = diff > 0 ? reserveBidPrice : 0;

            collateral[user] += reservePrice * _volume + _volume * reservePrice;
            matchedAskReserveOrderMapping[_period][user] = {};
            //console.log("(Settlement Reserve Ask Order) User: "+user+" | Volume: "+_volume+" | Price: "+reserveAskPrice);
            success = true;
        }

        if (matchedAskOrderMapping[_period][user]) {
            if (!matchedAskOrderMapping[_period][user].offeredVolume) {
                //console.warn("Position already settled.");
                return false;
            }

            offered = matchedAskOrderMapping[_period][user].offeredVolume;
            diff = _volume - offered;
            var reservePrice = diff > 0 ? reserveBidPrice : 0;
            colleteral[user] += (diff * reservePrice) + _volume * matchingPrice;

            matchedAskOrderMapping[_period][user] = {};
            //console.log("(Settlement Ask Order) User: "+user+" | Volume: "+_volume+" | Price: "+matchingPrice);
            success = true;
        }
    }
    // TODO: leute brücksichtigen, welche ohne idToOrder abzugeben strom beziehen. Die müssen irgendwie an den reserve price dran kommen

    if (_type === 'CONSUMER') {
        if (matchedBidOrderMapping[_period][user]) {
            if (!matchedBidOrderMapping[_period][user].orderedVolume) {
                //console.warn("Position already settled.");
                return false;
            }

            ordered = matchedBidOrderMapping[_period][user].orderedVolume;
            diff = _volume - ordered;
            diff = diff > 0 ? diff : 0; 
            colleteral[user] -= diff * reserveAskPrice + ordered * matchingPrice;
    
            matchedBidOrderMapping[_period][user] = {};

            success = true;
        } else {
            colleteral[user] -= (_volume * reserveAskPrice);
        }

        //Reserve bid order mapping
        if (matchedBidReserveOrderMapping[_period][user]) {
            if (!matchedBidReserveOrderMapping[_period][user].orderedVolume) {
                //console.warn("Position already settled.");
                return false;
            }

            ordered = matchedBidReserveOrderMapping[_period][user].orderedVolume;
            diff = _volume - ordered;
            diff = diff > 0 ? diff : 0; 
            colleteral[user] +=  ordered * reserveBidPrice - diff * reserveAskPrice ;
    
            matchedBidReserveOrderMapping[_period][user] = {};

            success = true;
        } else {
            colleteral[user] -= (_volume * reserveAskPrice);
        }
    }
    return success;
}




var consumers = [];
var producers = [];
var reserveProviders = [];


// TODO: reserve settle orders testen einzelnd und dann systematisch. ask bid order emitents verhalten sich ehrlich und die differenz wird von reserve übernommen, dann  sollte alles im schnitt null sein ???!?!!?
var sumConsumed = 0;
var sumProduced = 0;
var sumReserved = 0;

var TotalConsumedEnergy = 0;

function testSettle() {

    sumConsumed = 0;
    sumProduced = 0;
    sumReserved = 0;

    for (var user in matchedBidOrderMapping[period]) {
        var vol = Math.floor(Math.random() * 10) + 1;
        sumConsumed += vol;
        settle(user, "CONSUMER", matchedBidOrderMapping[period][user].orderedVolume, period);
    }

    for (user in matchedAskOrderMapping[period]) {
        var vol = Math.floor(Math.random() * 10) + 1;
        sumProduced += vol;
        settle(user, "PRODUCER", matchedAskOrderMapping[period][user].offeredVolume, period);
    }

    consumers = [];
    producers = [];
    reserveProviders = [];
}



function testRandomSettle() {

    sumConsumed = 0;
    sumProduced = 0;
    sumReserved = 0;

    for (var user in matchedBidOrderMapping[period]) {
        var vol = Math.floor(Math.random() * 10) + 1;
        sumConsumed += vol;
        settle(user, "CONSUMER", vol, period);
    }

    for (var user in matchedAskOrderMapping[period]) {
        var vol = Math.floor(Math.random() * 10) + 1;
        sumProduced += vol;
        settle(user, "PRODUCER", vol, period);
    }

    if (sumProduced < sumConsumed) {
        for (user in reserveProviders) {
            var vol = Math.floor(Math.random() * 10) + 1;
            sumReserved += vol;
            if (sumReserved > (sumConsumed - sumProduced)) {
                sumReserved -= vol;
                vol = (sumConsumed - sumProduced) - sumReserved;
                sumReserved += vol;
            }
            if (vol != 0) {
                settle(reserveProviders[user].id, "PRODUCER", reserveProviders[user].vol, period);
            }

        }
    }

    consumers = [];
    producers = [];
    reserveProviders = [];
}


function testSubmitAskReserve(_users) {
    for (var i = 0; i < _users; i++) {
        var volume = Math.floor(Math.random() * 300) + 1;
        var owner = Math.floor(Math.random() * _users) + 50;
        var price = Math.floor(Math.random() * 99) + 1;

        if (newSaveOrder("ASK", price, volume, owner)) {
            reserveProviders.push({ id: owner, vol: volume });
        }
    }
}


function testSubmitBidReserve(_users) {
    for (var i = 0; i < _users; i++) {
        var volume = Math.floor(Math.random() * 300) + 1;
        var owner = Math.floor(Math.random() * _users) + 100;
        var price = Math.floor(Math.random() * 99) + 1;

        if (newSaveOrder("BID", price, volume, owner)) {
            reserveProviders.push({ id: owner, vol: volume });
        }
    }
}

function testSubmitAsk(_users) {
    for (var i = 0; i < _users; i++) {
        var volume = Math.floor(Math.random() * 10) + 1;
        var owner = Math.floor(Math.random() * _users) + 1;
        var price = Math.floor(Math.random() * 99) + 1;

        if (newSaveOrder("ASK", price, volume, owner)) {
            producers.push({ id: owner, vol: volume });
        }
    }
}

function testSubmitBid(_users) {
    for (var i = 0; i < _users; i++) {
        var volume = Math.floor(Math.random() * 10) + 1;
        var price = 0;
        var owner = Math.floor(Math.random() * _users) + 1;

        if (Math.random() > 0.3) {
            price = Math.floor(Math.random() * 99) + 1;
        } else {
            price = 9999
        }
        if (newSaveOrder("BID", price, volume, owner)) {
            consumers.push({ id: owner, vol: volume });
        }
    }
}

function test(_users) {
    test_submit_bid(_users);
    test_submit_ask(_users);
    printAskOrders();
    printBidOrders();

    match();
    printMatchingResult()

    if (!checkAskShare()) {
        debugger;
        throw new Error("Share of Ask orders does not fit")
    }
    printMatchedAskOrders();
    printMatchedBidOrders();
    test_submit_ask_reserve(_users);
    console.log("Reserve Ask Orderbook")
    printAskOrders();
    determineReserveAskPrice();
    printReserveOrderMatchingResult();
    test_settle();

    if (!check_colleteral()) {
        debugger;
        throw new Error("Cumulative colleteral is not zero")
    }
}

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


var dex = {
    period: period,
    matchedAskOrderMapping,
    matchedAskOrderMapping,
    matchedBidOrderMapping,
    matchedBidOrderMapping,
    test_submit_bid: testSubmitBid,
    test_submit_ask: testSubmitAsk,
    test_submit_ask_reserve: testSubmitAskReserve,
    test_settle: testSettle,
    submitBidOrder: submitBidOrder,
    submitAskOrder: submitAskOrder,
    submitReserveAsk: submitReserveAsk,
    match: match,
    resetOrders: resetOrders,
    appendToDoubleMapping: appendToDoubleMapping,
    determineReserveAskPrice: determineReserveAskPrice,
    getMatchedAskOrders: getMatchedAskOrders,
    getMatchedBidOrders: getMatchedBidOrders,
    getBidOrders: getBidOrders,
    getAskOrders: getAskOrders,
    settle: settle,
    colleteral: colleteral,
    test: test
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = dex;
} else {
    Object.assign(window, dex);
};
