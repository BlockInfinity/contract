'use strict';

// ####################################################################################
// ############################# Zyklus Ã¼bergreifende Variablen #######################
// ####################################################################################


// default max price for bid idToOrder if no price is provided
const DEFAULT_MAXPRICE = Number.MAX_SAFE_INTEGER;

// kWh needed to be secured against any shortage
const MIN_RESERVE_VOLUME = 1000;

// 15 minute period
var period = 0;

// order id
var idCounter = 1;

// keeps track of the money users have deposited within the contract
var colleteral = {};

var idToOrder = {};

// matched order information gets saved based on the period and owner. analog to mapping(address => mapping (period => volume))
var matchedAskOrderMapping = {};
var matchedBidOrderMapping = {};

var matchedAskReserveOrderMapping = {};
var matchedBidReserveOrderMapping = {};

// stores matching price for each period
var matchingPriceMapping = {};

// stores prices for reserve power for each periode
var askReservePrices = {};
var bidReservePrices = {};

// ####################################################################################
// ############################## Zyklus Variablen ####################################
// ####################################################################################

// cumulated reserve power
var cumAskReserveVol = 0;
var cumBidReserveVol = 0;

// prevents users from submitting two orders within one period
var tmpowners = {};

var reserveBidPrice;
var reserveAskPrice;

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

// matching related metrics
// global for printing purposes
var cumAskVol = 0;
var cumBidVol = 0;
var matching_price = 0;
var share = 0;

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
    saveOrder("BID", _price, _volume, _owner);
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
    saveOrder("ASK", _price, _volume, _owner);
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
    return saveOrder("ASK", _price, _volume, _owner);
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
    saveOrder("BID", _price, _volume, _owner)
}


function saveOrder(_type, _price, _volume, _owner) {

    // es darf pro periode stets nur eine order pro user abgegeben werden
    if (_owner in tmpowners) { // in solidity einfach im mapping auf 0 oder 1 prÃ¼fen
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

// matches idToOrder and saves the resulting information in the matchedAskOrderMapping and matchedBidOrderMapping
// TODO: events rausballern fÃ¼r jeden user dessen idToOrder gematched wurden
function match() {
    if (Object.keys(idToOrder).length === 0) {
        resetOrders();
        return;
    }

    cumAskVol = 0;
    cumBidVol = 0;
    matching_price = idToOrder[minAsk.id].price;
    var isMatched = false;
    var outOfAskOrders = false;
    var iter_ask_id = minAsk.id;
    var id_iter_bid = maxBid.id;
    period++;

    while (!isMatched) {
        // cumulates ask volume for fixed price level
        while (iter_ask_id !== 0 && (idToOrder[iter_ask_id].price === matching_price)) {
            var volume = idToOrder[iter_ask_id].volume;
            var owner = idToOrder[iter_ask_id].owner;
            cumAskVol += volume;

            appendToDoubleMapping(matchedAskOrderMapping, period, owner, {
                volume: volume
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
        while (idToOrder[id_iter_bid].price >== matching_price) {
            var volume = idToOrder[id_iter_bid].volume;
            var owner = idToOrder[id_iter_bid].owner;
            cumBidVol += volume;

            appendToDoubleMapping(matchedBidOrderMapping, period, owner, {
                volume: volume
            });

            id_iter_bid = idToOrder[id_iter_bid].nex;
            if (!id_iter_bid) {
                break;
            }
        }

        if (cumAskVol >== cumBidVol || outOfAskOrders) {
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
            matchedAskOrderMapping[period][owner].volume = matchedAskOrderMapping[period][owner].volume * share;
        }

    } else {
        share = cumAskVol / cumBidVol;
        for (owner in matchedBidOrderMapping[period]) {
            matchedBidOrderMapping[period][owner].volume = matchedBidOrderMapping[period][owner].volume * share;
        }
    }

    matchingPriceMapping[period] = matching_price;

    resetOrders();
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



// TODO: aus den beiden determine Funktionen eine bauen. Redundanz eliminieren
function determineReserveAskPrice() {

    cumAskReserveVol = 0;
    var isFound = false;
    reserveAskPrice = idToOrder[minAsk.id].price;
    var iter_ask_id = minAsk.id;

    while (!isFound) {
        while (idToOrder[iter_ask_id].price === reserveAskPrice) {
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
            reserveAskPrice = idToOrder[iter_ask_id].price;
        }
    }


    minAsk = {
        id: 0,
        nex: 0,
        owner: 0,
        volume: 0,
        price: 0,
    };

    askReservePrices[period] = reserveAskPrice;
}


function determineReserveBidPrice() {
    cumBidReserveVol = 0;
    var isFound = false;
    reserveBidPrice = idToOrder[maxBid.id].price;
    var iter_bid_id = maxBid.id;

    while (!isFound) {
        while (idToOrder[iter_bid_id].price === reserveBidPrice) {
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
            reserveBidPrice = idToOrder[iter_bid_id].price;
        }
    }

    maxBid = {
        id: 0,
        nex: 0,
        owner: 0,
        volume: 0,
        price: 0,
    };

    bidReservePrices[period] = reserveBidPrice;
}

var settleCounter = 0;
var isFirstSettle = true;
var numberOfRegisteredUsers = 0;

var sumProduced = 0;
var sumConsumed = 0;
var sumReserveProduced = 0;
var sumReserveConsumed = 0;

var askReserveSmData = {};
var bidReserveSmData = {};


function settle(_user, _type, _volume, _period) {
    if (!_user) {
        throw new Error('_user is missing');
    }
    if (!_type) {
        throw new Error('_type is missing');
    }
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

    if (isFirstSettle) {
        isFirstSettle = false;
        settleCounter = 0;
        sumProduced = 0;
        sumConsumed = 0;
    }


    var success = true;
    var user = _user;
    var ordered = 0;
    var offered = 0;
    var diff;

    // ONLY FOR TESTING
    var bidIssuers = _.keys(matchedBidOrderMapping[_period]).length;
    var askIssuers = _.keys(matchedAskOrderMapping[_period]).length;

    var reserveAskPrice = askReservePrices[_period];
    var reserveBidPrice = bidReservePrices[_period];
    var matchingPrice = matchingPriceMapping[_period];

    askReserveSmData[period] = [];
    bidReserveSmData[period] = [];


    if (_type === 'PRODUCER') {

        // FALL 1: Reserve Ask Order issuer
        if (matchedAskReserveOrderMapping[_period][user]) { // TODO
            if (!matchedAskReserveOrderMapping[_period][user].volume) {
                console.warn("Reserve Ask Position already settled.");
                return false;
            }

            var orderVolume = matchedAskReserveOrderMapping[_period][user].volume;

            askReserveSmData[period].push({ user: user, smVolume: _volume, orderVolume: orderVolume });

            sumReserveProduced += _volume;

            // FALL 2: Normal Ask Order issuer
        } else if (matchedAskOrderMapping[_period][user]) {
            if (!matchedAskOrderMapping[_period][user].volume) {
                console.warn("Normal Ask Position already settled.");
                return false;
            }
            // die zuvor angebotene Menge an Strom
            offered = matchedAskOrderMapping[_period][user].volume;
            // user hat zu wenig Strom eingespeist
            if (_volume < offered) {
                diff = offered - _volume;
                colleteral[user] -= (diff * reserveAskPrice);
                
                colleteral[user] += _volume * matchingPrice;
            } else if (_volume > offered) {
                diff = _volume - offered;
                colleteral[user] += diff * reserveBidPrice;
                
                colleteral[user] += offered * matchingPrice;
            } else {
                colleteral[user] += _volume * matchingPrice;
            }
            matchedAskOrderMapping[_period][user] = {};
            sumProduced += _volume;

            // FALL 3: No Order emitted
        } else {
            colleteral[user] += (_volume * reserveBidPrice);
            
            sumProduced += _volume;
        }

    }

    if (_type === 'CONSUMER') {

        // FALL 1: Reserve Bid Order issuer
        if (matchedBidReserveOrderMapping[_period][user]) { // TODO
            if (!matchedBidReserveOrderMapping[_period][user].volume) {
                console.warn("Reserve Bid Position already settled.");
                return false;
            }

            var orderVolume = matchedBidReserveOrderMapping[_period][user].volume;

            bidReserveSmData[period].push({ user: user, smVolume: _volume, orderVolume: orderVolume });

            sumReserveConsumed += _volume;

            // FALL 2: Bid Order issuer
        } else if (matchedBidOrderMapping[_period][user]) {
            if (!matchedBidOrderMapping[_period][user].volume) {
                console.warn("Normal Bid Position already settled.");
                return false;
            }

            ordered = matchedBidOrderMapping[_period][user].volume;

            if (_volume > ordered) { // user hat zu viel Strom bezogen
                diff = _volume - ordered;
                colleteral[user] -= (diff * reserveAskPrice);
                
                colleteral[user] -= (ordered * matchingPrice);
            } else if (_volume < ordered) {
                diff = ordered - _volume;
                colleteral[user] -= (_volume * matchingPrice);
                colleteral[user] += (diff * reserveBidPrice);

            } else {
                colleteral[user] -= (_volume * matchingPrice);
            }
            matchedBidOrderMapping[_period][user] = {};


            sumConsumed += _volume;

            // FALL 3: No Order emitted
        } else {
            colleteral[user] -= (_volume * reserveAskPrice);
            
            sumConsumed += _volume;
        }
    }

    settleCounter++;

    // TODO beim Eingang des letztes sm die endSettle funktion aufrufen
    // if (settleCounter === numberOfRegisteredUsers) {
    //     console.log("last settlement happened");
    // }

    return success;
}

function endSettle(_period) {
    if (sumConsumed > sumProduced) {
        var diff = sumConsumed - sumProduced;
        for (var i in askReserveSmData[_period]) {
            var orderVolume = askReserveSmData[_period][i].orderVolume;
            var smVolume = askReserveSmData[_period][i].smVolume;
            var user = askReserveSmData[_period][i].user;
            if (smVolume <= orderVolume && smVolume <= diff) {
                colleteral[user] += smVolume * reserveAskPrice;
                diff -= smVolume;
            } else if (smVolume > orderVolume && smVolume <= diff) {
                colleteral[user] += orderVolume * reserveAskPrice;
                colleteral[user] += (smVolume - orderVolume) * reserveBidPrice;
                diff -= smVolume;
            } else if (smVolume <= orderVolume && smVolume > diff) {
                colleteral[user] += diff * reserveAskPrice;
            } else if (smVolume > orderVolume && smVolume > diff) {
                if (diff <= orderVolume) {
                    colleteral[user] += diff * reserveAskPrice;
                } else {
                    colleteral[user] += orderVolume * reserveAskPrice;
                    colleteral[user] += (diff - orderVolume) * reserveBidPrice;
                }
            }
        }
    } else {

    }
}

// getters
function getMatchedAskOrders() {
    var matches = [];
    for (var period in matchedAskOrderMapping) {
        for (var owner in matchedAskOrderMapping[period]) {
            matches.push({ 'period': period, 'owner': owner, 'volume': matchedAskOrderMapping[period][owner].volume });
        }
    }
    return matches;
}


function getMatchedBidOrders() {
    var matches = [];
    for (var period in matchedBidOrderMapping) {
        for (var owner in matchedBidOrderMapping[period]) {
            matches.push({ 'period': period, 'owner': owner, 'volume': matchedBidOrderMapping[period][owner].volume });
        }
    }
    return matches;
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



function getAskOrders() {
    var iter_ask_id = minAsk.id;
    var askOrders = [];
    while (iter_ask_id != 0) {
        askOrders.push(idToOrder[iter_ask_id]);
        iter_ask_id = idToOrder[iter_ask_id].nex;
    }
    return askOrders;
}


// export
var exportContainer = {
    period: period,
    matchedAskOrderMapping,
    matchedAskOrderMapping,
    matchedBidOrderMapping,
    matchedBidOrderMapping,
    submitBidOrder: submitBidOrder,
    submitAskOrder: submitAskOrder,
    submitReserveAsk: submitReserveAsk,
    match: match,
    resetOrders: resetOrders,
    appendToDoubleMapping: appendToDoubleMapping,
    determineReserveAskPrice: determineReserveAskPrice,
    determineReserveBidPrice: determineReserveBidPrice,
    getMatchedAskOrders: getMatchedAskOrders,
    getMatchedBidOrders: getMatchedBidOrders,
    getBidOrders: getBidOrders,
    getAskOrders: getAskOrders,
    settle: settle,
    colleteral: colleteral,
    saveOrder: saveOrder,
    matchedBidOrderMapping,
    matchedAskOrderMapping,
    period
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = exportContainer;
} else {
    Object.assign(window, exportContainer);
};




// ######################################################################## 
// #################################### test
// ########################################################################

var users;


function runtests(_users) {

    users = _users;

    testMatch("matched ask and bid order volumes should be the same");

    testPerfectSettle("the cumulative sum in the colleteral mapping should be zero, when users stick perfectly to their orders");

    //testRandomSettle("the cumulative sum in the colleteral mapping should be zero, when reserve users regulate perfectly the lack or excess of energy");

}

function testMatch(text) {
    console.group('Matching Test');
    submitRandomBidOrders(users);
    submitRandomAskOrders(users);
    printBidOrders();
    printAskOrders();
    match();
    printMatchedBidOrders();
    printMatchedAskOrders();
    printMatchingResult();

    var sum = 0;
    for (var user in matchedAskOrderMapping[period]) {
        sum += matchedAskOrderMapping[period][user].volume;
    }
    for (var user in matchedBidOrderMapping[period]) {
        sum -= matchedBidOrderMapping[period][user].volume;
    }
    console.groupEnd();

    assert((sum == 0 || (sum < 0.001 && sum > -0.001)), text);
    resetOrders();
}


function testPerfectSettle(text) {
    console.group("Perfect Settlement Test");
    submitRandomAskOrders(users);
    submitRandomBidOrders(users);
    printAskOrders();
    printBidOrders();
    match();
    printMatchedAskOrders();
    printMatchedBidOrders();
    printMatchingResult();
    submitRandomBidReserveOrders(users);
    submitRandomAskReserveOrders(users);
    printAskOrders();
    printBidOrders();
    determineReserveAskPrice();
    determineReserveBidPrice();
    printReserveOrderMatchingResult();
    perfectSettle();

    var sum = 0;
    for (var i in colleteral) {
        sum += colleteral[i];

    }
    console.groupEnd();
    assert((sum == 0 || (sum < 0.001 && sum > -0.001)), text);
}

// TODO LESEZEICHEN: alle smart meter ask werte müssen aufsummiert gleich den bid werten sein
// function testReserveOrders(text) {
//     var sumProduced = 0;
//     for (var user in matchedBidReserveOrderMapping[period]) {
//         sumProduced += matchedBidReserveOrderMapping[period];
//     }
//     sumProduced +


//         for (var user in matchedBidReserveOrderMapping[period]) {
//             sum += matchedBidReserveOrderMapping[period];
//         }

// }

function testRandomSettle(text) {
    console.group("Random Settlement Test");
    submitRandomAskOrders(users);
    submitRandomBidOrders(users);
    match();
    submitRandomBidReserveOrders(users);
    submitRandomAskReserveOrders(users);
    determineReserveAskPrice();
    determineReserveBidPrice();
    randomSettle();
    checkEnergyBalance();
    var sum = 0;
    for (var i in colleteral) {
        sum += colleteral[i];

    }
    console.groupEnd();
    assert(sum == 0 || (sum < 0.001 && sum > -0.001), text);
}

// ######################################################################## 
// #################################### test helper functions
// ########################################################################


var reserveAsks = [];
var reserveBids = [];

var sumConsumed = 0;
var sumProduced = 0;
var sumReserved = 0;

// unique owner id for each submitted order
var owner = 1;

// settlement mit Erzeugungs- und Verbrauchsdaten, welche den zuvor abgegebenen order volumes entsprechen. Es kommt nicht zu einem Ungleichgewicht und die Reserve Users mÃ¼ssen nicht eingreifen
function perfectSettle() {

    for (var user in matchedBidOrderMapping[period]) {
        settle(user, "CONSUMER", matchedBidOrderMapping[period][user].volume, period);
    }

    for (user in matchedAskOrderMapping[period]) {
        settle(user, "PRODUCER", matchedAskOrderMapping[period][user].volume, period);
    }

}


// settlement mit zufÃ¤lligen Erzeugungs- und Verbrauchsdaten. Es kommt zu einem Ungleichgewicht und die Reserve users mÃ¼ssen jenes Ungleichgewicht regulieren.
function randomSettle() {

    var sumConsumed = 0;
    var sumProduced = 0;
    var sumBidReserve = 0;
    var sumAskReserve = 0;

    for (var user in matchedBidOrderMapping[period]) {
        var vol = Math.floor(Math.random() * 10) + 1;
        var isSettled = settle(user, "CONSUMER", vol, period);
        if (isSettled) {
            sumConsumed += vol;
        }
    }

    for (var user in matchedAskOrderMapping[period]) {
        var vol = Math.floor(Math.random() * 10) + 1;
        var isSettled = settle(user, "PRODUCER", vol, period);
        if (isSettled) {
            sumProduced += vol;
        }

    }

    if (sumProduced != sumConsumed) {
        if (sumProduced > sumConsumed) {
            var diff = sumProduced - sumConsumed;
            for (var user in matchedBidReserveOrderMapping[period]) {
                if (matchedBidReserveOrderMapping[period][user].volume < diff) {
                    settle(user, "CONSUMER", matchedBidReserveOrderMapping[period][user].volume, period);
                    if (isSettled) {
                        diff -= matchedBidReserveOrderMapping[period][user].volum
                        sumBidReserve += matchedBidReserveOrderMapping[period][user].volume;
                    }
                } else {
                    var isSettled = settle(user, "CONSUMER", diff, period);
                    if (isSettled) {
                        sumBidReserve += diff;
                        break;
                    }
                }
            }
        } else {
            var diff = sumConsumed - sumProduced;
            for (var user in matchedAskReserveOrderMapping[period]) {
                if (matchedAskReserveOrderMapping[period][user].volume < diff) {
                    var isSettled = settle(user, "PRODUCER", matchedAskReserveOrderMapping[period][user].volume, period);
                    if (isSettled) {
                        diff -= matchedAskReserveOrderMapping[period][user].volume;
                        sumAskReserve += matchedAskReserveOrderMapping[period][user].volume;
                    }
                } else {
                    var isSettled = settle(user, "PRODUCER", diff, period);
                    if (isSettled) {
                        sumAskReserve += diff;
                        break;
                    }
                }
            }
        }
    }

    reserveAsks = [];
    reserveBids = [];
}


function submitRandomAskReserveOrders(users) {
    for (var i = 0; i < users; i++) {
        var volume = Math.floor(Math.random() * 300) + 1;
        var price = Math.floor(Math.random() * 99) + 1;

        if (saveOrder("ASK", price, volume, owner)) {
            reserveAsks.push({ owner: owner, volume: volume });
            owner++;
            numberOfRegisteredUsers++;
        }
    }
}

function submitRandomBidReserveOrders(users) {
    for (var i = 0; i < users; i++) {
        var volume = Math.floor(Math.random() * 300) + 1;
        var price = Math.floor(Math.random() * 99) + 1;

        if (saveOrder("BID", price, volume, owner)) {
            reserveBids.push({ owner: owner, volume: volume });
            owner++;
            numberOfRegisteredUsers++;
        }
    }
}

function submitRandomAskOrders(users) {
    for (var i = 0; i < users; i++) {
        var volume = Math.floor(Math.random() * 20) + 1;
        var price = Math.floor(Math.random() * 99) + 1;
        if (saveOrder("ASK", price, volume, owner)) {
            owner++;
            numberOfRegisteredUsers++;
        }

    }
}

function submitRandomBidOrders(users) {
    for (var i = 0; i < users; i++) {
        var volume = Math.floor(Math.random() * 10) + 1;
        var price = 0;

        if (Math.random() > 0.3) {
            price = Math.floor(Math.random() * 99) + 1;
        } else {
            price = 9999
        }
        if (saveOrder("BID", price, volume, owner)) {
            owner++;
            numberOfRegisteredUsers++;
        }
    }
}


function assert(condition, message) {
    if (!condition) {
        message = message || "Assertion failed";
        if (typeof Error !== "undefined") {
            throw new Error(message);
        }
        throw message; // Fallback
    } else {
        console.log("%c" + message, "color:green");
    }
}

function checkAskShare() {
    var sum = 0;
    for (var user in matchedAskOrderMapping[period]) {
        sum += matchedAskOrderMapping[period][user].volume;
    }
    for (var user in matchedBidOrderMapping[period]) {
        sum -= matchedBidOrderMapping[period][user].volume;
    }
    return (sum == 0 || (sum < 0.001 && sum > -0.001));
}


function checkColleteral() {
    var sum = 0;
    for (var i in colleteral) {
        sum += colleteral[i];
    }
    return (sum == 0 || (sum < 0.001 && sum > -0.001));
}

function checkEnergyBalance() {
    if (sumConsumed + sumReserveConsumed != sumProduced + sumReserveProduced) {
        console.warn("Consumed Energy is not equal to produced Energy")
    } else {
        console.log("%c" + "Consumed Energy is equal to produced Energy", "color:green");
    }
}

// ######################################################################## 
// #################################### print funtions
// ########################################################################


function printAskOrders() {
    var askOrderBook = getAskOrders();
    console.log("\nASK ORDERBOOK\n\n");
    for (var i in askOrderBook) {
        console.log('Price: ' + askOrderBook[i].price + ' | Volume: ' + askOrderBook[i].volume + ' | Owner: ' + askOrderBook[i].owner);
    }
}

function printBidOrders() {
    var bidOrderBook = getBidOrders();
    console.log("\nBID ORDERBOOK\n\n");
    for (var i in bidOrderBook) {
        console.log('Price: ' + bidOrderBook[i].price + ' | Volume: ' + bidOrderBook[i].volume + ' | Owner: ' + bidOrderBook[i].owner);
    }
}


function printMatchingResult() {

    console.log('\n######################################');
    console.log('########### Matching Result ##########');
    console.log('######################################');
    console.log('Matching price: ', matching_price, ' | Bid Volume: ', cumBidVol, ' | Ask Volume: ', cumAskVol, ' | share: ', share);

}


function printMatchedAskOrders() {
    var matches = getMatchedAskOrders();
    console.log("\nMatched ASK ORDERBOOK\n\n");
    for (var i in matches) {
        console.log('Period: ', matches[i].period, ' | Owner: ', matches[i].owner, ' | OfferedVol: ', matches[i].volume);
    }
}


function printMatchedBidOrders() {
    var matches = getMatchedBidOrders();
    console.log("\nMatched BID ORDERBOOK\n\n");
    for (var i in matches) {
        console.log('Period: ', matches[i].period, ' | Owner: ', matches[i].owner, ' | OrderedVol: ', matches[i].volume);
    }
}

function printReserveOrderMatchingResult() {
    console.log('\n######################################');
    console.log('####### Reserve BID Matching Result ######');
    console.log('######################################');
    console.log('\nReserve Price: ' + bidReservePrices[period] + ' | Volume (>1000): ' + cumBidReserveVol);
    console.log('\n######################################');


    console.log('\n\n\nn######################################');
    console.log('####### Reserve ASK Matching Result ######');
    console.log('######################################');
    console.log('\nReserve Price: ' + askReservePrices[period] + ' | Volume (>1000): ' + cumAskReserveVol);
    console.log('\n######################################');

}

function printMatchedBidReserveOrders() {
    for (var period in matchedBidReserveOrderMapping) {
        for (var user in matchedBidReserveOrderMapping[period]) {
            console.log('Period: ', period, ' | Owner: ', user, ' | Vol: ', matchedBidReserveOrderMapping[period][user].volume);
        }
    }
}

function printMatchedAskReserveOrders() {
    for (var period in matchedAskReserveOrderMapping) {
        for (var user in matchedAskReserveOrderMapping[period]) {
            console.log('Period: ', period, ' | Owner: ', user, ' | Vol: ', matchedAskReserveOrderMapping[period][user].volume);
        }
    }
}




// Marins Impolementierung
// function settle(_user, _type, _volume, _period) {
//     if (!_user) {
//         throw new Error('_user is missing');
//     }
//     if (!_type) {
//         throw new Error('_type is missing');
//     }
//     let supportedTypes = ['PRODUCER', 'CONSUMER'];
//     // if (!_.includes(supportedTypes, _type)) {
//     //     throw new Error('_type is not supported');
//     // }
//     if (!_volume) {
//         console.error('_volume is missing');
//     }
//     if (_volume === 0) {
//         console.error('_volume must be greater 0');
//     };
//     if (!_period) {
//         throw new Error('_period is missing');
//     }

//     if (!matchedAskOrderMapping[_period] || !matchedBidOrderMapping[_period]) {
//         throw new Error('period that should be settled does not exist');
//     }

//     if (!colleteral[_user]) {
//         colleteral[_user] = 0;
//     };

//     var success = false;
//     var user = _user;
//     var ordered = 0;
//     var offered = 0;
//     var diff;

//     //TODO set to price from period
//     var reserveBidPrice = bidReservePrices[period];
//     var reserveAskPrice = askReservePrices[period];
//     var matchingPrice = matchingPriceMapping[period];

//     if (_type === 'PRODUCER') {
//         if (matchedAskReserveOrderMapping[_period][user]) {
//             if (!matchedAskReserveOrderMapping[_period][user].volume) {
//                 console.warn("Position already settled.");
//                 return false;
//             }

//             offered = matchedAskReserveOrderMapping[_period][user].volume;
//             diff = _volume - offered;
//             var reserveAskPrice = diff > 0 ? reserveBidPrice : 0;

//             colleteral[user] += reserveAskPrice * _volume + _volume * reserveAskPrice;
//             matchedAskReserveOrderMapping[_period][user] = {};
//             //console.log("(Settlement Reserve Ask Order) User: "+user+" | Volume: "+_volume+" | Price: "+reserveAskPrice);
//             success = true;
//         }

//         if (matchedAskOrderMapping[_period][user]) {
//             if (!matchedAskOrderMapping[_period][user].volume) {
//                 //console.warn("Position already settled.");
//                 return false;
//             }

//             offered = matchedAskOrderMapping[_period][user].volume;
//             diff = _volume - offered;
//             var reserveAskPrice = diff > 0 ? reserveBidPrice : 0;
//             colleteral[user] += (diff * reserveAskPrice) + _volume * matchingPrice;

//             matchedAskOrderMapping[_period][user] = {};
//             //console.log("(Settlement Ask Order) User: "+user+" | Volume: "+_volume+" | Price: "+matchingPrice);
//             success = true;
//         }
//     }
//     // TODO: leute brÃ¼cksichtigen, welche ohne idToOrder abzugeben strom beziehen. Die mÃ¼ssen irgendwie an den reserve price dran kommen

//     if (_type === 'CONSUMER') {
//         if (matchedBidOrderMapping[_period][user]) {
//             if (!matchedBidOrderMapping[_period][user].volume) {
//                 //console.warn("Position already settled.");
//                 return false;
//             }

//             ordered = matchedBidOrderMapping[_period][user].volume;
//             diff = _volume - ordered;
//             diff = diff > 0 ? diff : 0;
//             colleteral[user] -= diff * reserveAskPrice + ordered * matchingPrice;

//             matchedBidOrderMapping[_period][user] = {};

//             success = true;
//         } else {
//             colleteral[user] -= (_volume * reserveAskPrice);
//         }

//         //Reserve bid order mapping
//         if (matchedBidReserveOrderMapping[_period][user]) {
//             if (!matchedBidReserveOrderMapping[_period][user].volume) {
//                 //console.warn("Position already settled.");
//                 return false;
//             }

//             ordered = matchedBidReserveOrderMapping[_period][user].volume;
//             diff = _volume - ordered;
//             diff = diff > 0 ? diff : 0;
//             colleteral[user] += ordered * reserveBidPrice - diff * reserveAskPrice;

//             matchedBidReserveOrderMapping[_period][user] = {};

//             success = true;
//         } else {
//             colleteral[user] -= (_volume * reserveAskPrice);
//         }
//     }
//     return success;
// }
