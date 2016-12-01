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

// keeps track of the money numberOfUsers have deposited within the contract
var colleteral = {};

var idToOrder = {}; // TODO: wie in solidity als array implementieren

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

// total number of smart meters
var numberOfRegisteredUsers = 0;

// ####################################################################################
// ############################## Zyklus Variablen ####################################
// ####################################################################################

// cumulated reserve power
var cumAskReserveVol = 0;
var cumBidReserveVol = 0;

// prevents numberOfUsers from submitting two orders within one period
var tmpowners = {};

var lastReserveBidPrice;
var lastReserveAskPrice;

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
var lastMatchingPrice = 0;
var share = 0;

// variables for settlement
// TODO alle settlement Variablen via mapping den Perioden zuordnen
var sumProduced = 0;
var sumConsumed = 0;
var sumReserveProduced = 0;
var sumReserveConsumed = 0;

var excess = 0;
var lack = 0;
var settleCounter = 0;
var isFirstSettle = true;

// reserve order data for the endSettle function
var askReserveSmData = {};
var bidReserveSmData = {};

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

    // TODO: prüfen ohne tmpowners zu verwenden
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
    lastMatchingPrice = idToOrder[minAsk.id].price;
    var isMatched = false;
    var outOfAskOrders = false;
    var iter_ask_id = minAsk.id;
    var id_iter_bid = maxBid.id;
    period++;

    while (!isMatched) {
        // cumulates ask volume for fixed price level
        while (iter_ask_id !== 0 && (idToOrder[iter_ask_id].price === lastMatchingPrice)) {
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
        while (idToOrder[id_iter_bid].price >= lastMatchingPrice) {
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

        if (cumAskVol >= cumBidVol || outOfAskOrders) {
            isMatched = true;
        } else {
            lastMatchingPrice = idToOrder[iter_ask_id].price;
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

    matchingPriceMapping[period] = lastMatchingPrice;

    resetOrders();
}

// setzt die pointers auf null und somit sind die orderbücher leer
function resetOrders() {
    // both orderbooks need to be deleted
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
    alreadySettled = {};
    settleCounter = 0;
    excess = 0;
    lack = 0;
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
    lastReserveAskPrice = idToOrder[minAsk.id].price;
    var iter_ask_id = minAsk.id;

    while (!isFound) {
        while (idToOrder[iter_ask_id].price === lastReserveAskPrice) {
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
            lastReserveAskPrice = idToOrder[iter_ask_id].price;
        }
    }


    minAsk = {
        id: 0,
        nex: 0,
        owner: 0,
        volume: 0,
        price: 0,
    };

    // hiermit wird garnatiert dass die reserve leute stets für einen genau so guten / besseren preis strom handeln können als die normalen Leute
    if (lastReserveAskPrice < lastMatchingPrice) {
        lastReserveAskPrice = lastMatchingPrice;
        askReservePrices[period] = lastMatchingPrice;
    } else {
        askReservePrices[period] = lastReserveAskPrice;
    }
}


function determineReserveBidPrice() {
    cumBidReserveVol = 0;
    var isFound = false;
    lastReserveBidPrice = idToOrder[maxBid.id].price;
    var iter_bid_id = maxBid.id;

    while (!isFound) {
        while (idToOrder[iter_bid_id].price === lastReserveBidPrice) {
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
            lastReserveBidPrice = idToOrder[iter_bid_id].price;
        }
    }

    maxBid = {
        id: 0,
        nex: 0,
        owner: 0,
        volume: 0,
        price: 0,
    };

    // hiermit wird garnatiert dass die reserve leute stets für einen genau so guten / besseren preis strom handeln können als die normalen Leute
    if (lastReserveBidPrice > lastMatchingPrice) {
        lastReserveBidPrice = lastMatchingPrice;
        bidReservePrices[period] = lastReserveBidPrice;
    } else {
        bidReservePrices[period] = lastReserveBidPrice;
    }
}

var alreadySettled = {};

function settle(_user, _type, _volume, _period) {



    if (!_user) {
        throw new Error('_user is missing');
    }
    if (!_type) {
        throw new Error('_type is missing');
    }
    if (!_period) {
        throw new Error('_period is missing');
    }
    if (!matchedAskOrderMapping[_period] || !matchedBidOrderMapping[_period]) {
        throw new Error('period that should be settled does not exist');
    }

    // initialisierung bei erster Iteration
    if (isFirstSettle) {
        numberOfRegisteredUsers = _.keys(matchedAskOrderMapping[_period]).length + _.keys(matchedBidOrderMapping[_period]).length;
        isFirstSettle = false;
        settleCounter = 0;
        sumProduced = 0;
        sumConsumed = 0;
        askReserveSmData[_period] = [];
        bidReserveSmData[_period] = [];
    }


    if (alreadySettled[_user]) {
        //console.warn("Reserve Ask Position already settled.");
        return false;
    }

    // for test purposes: each user gets assigned a colleteral of 0
    if (!colleteral[_user]) {
        colleteral[_user] = 0;
    };



    var success = true;
    var user = _user;
    var ordered = 0;
    var offered = 0;
    var diff;

    var lastReserveAskPrice = askReservePrices[_period];
    var lastReserveBidPrice = bidReservePrices[_period];
    var matchingPrice = matchingPriceMapping[_period];



    if (_type === 'PRODUCER') {

        // FALL 1: Reserve Ask Order issuer
        if (matchedAskReserveOrderMapping[_period][user]) { // TODO

            // Smart Meter Daten werden vorerst gespeichert für die spätere Abrechnung in der endSettle Funktion
            var orderVolume = matchedAskReserveOrderMapping[_period][user].volume;
            // TODO iwas mit undefined?
            askReserveSmData[_period].push({ user: user, smVolume: _volume, orderVolume: orderVolume });

            // Volumen was von den reserve Leute erzeugt wurde, weil nicht genug Strom im Netz war
            sumReserveProduced += _volume;
            // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
            matchedAskReserveOrderMapping[_period][user] = {};

            // FALL 2: Normal Ask Order issuer
        } else if (matchedAskOrderMapping[_period][user]) {
            // die zuvor angebotene Menge an Strom
            offered = matchedAskOrderMapping[_period][user].volume;

            // user hat zu wenig Strom eingespeist
            if (_volume < offered) {
                // für den eingespeisten Strom bekommt er den matching preis bezahlt
                colleteral[user] += _volume * matchingPrice;
                // die Differenzt muss er nachkaufen für den teuren lastReserveAskPrice
                diff = offered - _volume;
                colleteral[user] -= (diff * lastReserveAskPrice);
                // rechnerisch ist nun -diff strom zu wenig im netz
                lack += diff;

                // user hat zu viel strom eingespeist
            } else if (_volume > offered) {
                // Für das Ordervolumen bekommt er den matchingpreis bezahlt
                colleteral[user] += offered * matchingPrice;
                // Für die Differenz bekommt er den niedrigen lastReserveBidPrice bezahlt
                diff = _volume - offered;
                colleteral[user] += diff * lastReserveBidPrice;
                // rechnerisch ist diff strom zu viel im Netz
                excess += diff;

                // user hat genau so viel strom eingepeist wie abgemacht
            } else {
                colleteral[user] += _volume * matchingPrice;
            }

            // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
            matchedAskOrderMapping[_period][user] = {};

            // Volumen was von den normalen usern erzeugt wurde
            sumProduced += _volume;

            // FALL 3: No Order emitted
        } else {
            colleteral[user] += (_volume * lastReserveBidPrice);
            excess += _volume;
            // Volumen was von den normalen usern erzeugt wurde
            sumProduced += _volume;
            // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
            matchedAskOrderMapping[_period][user] = {};
        }

    }

    if (_type === 'CONSUMER') {

        // FALL 1: Reserve Bid Order issuer
        if (matchedBidReserveOrderMapping[_period][user]) {

            // Smart Meter Daten werden vorerst gespeichert für die spätere Abrechnung in der endSettle Funktion
            var orderVolume = matchedBidReserveOrderMapping[_period][user].volume;
            bidReserveSmData[_period].push({ user: user, smVolume: _volume, orderVolume: orderVolume });

            // Volumen was von den reserve Leute vom Netz genommen wurde, weil zu viel Strom vorhanden war
            sumReserveConsumed += _volume; // für test zwecke zwischen gepeichert
            // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
            matchedBidReserveOrderMapping[_period][user] = {};

            // FALL 2: Bid Order issuer
        } else if (matchedBidOrderMapping[_period][user]) {

            ordered = matchedBidOrderMapping[_period][user].volume;
            // user hat zu viel Strom verbraucht
            if (_volume > ordered) {
                // das Ordervolumen kann noch für den mathcing price bezahlt werden 
                colleteral[user] -= (ordered * matchingPrice);
                // die Differenz muss für den höheren lastReserveAskPrice bezahlt werden
                diff = _volume - ordered;
                colleteral[user] -= (diff * lastReserveAskPrice);
                // rechnerisch ist nun -diff Strom zu wenig im Netz
                lack += diff;

                // user hat zu wenig Strom verbraucht
            } else if (_volume < ordered) {
                // das Ordervolumen muss bezahlt werden für den matching price
                colleteral[user] -= (ordered * matchingPrice);
                // die differenz kann für den schlechten lastReserveBidPrice verkauft werden 
                diff = ordered - _volume;
                colleteral[user] += (diff * lastReserveBidPrice);
                // recherisch ist nun +diff zu viel Strom im Netz
                excess += diff;

                // user hat genau so viel verbraucht wie zuvor vereinbart
            } else {
                colleteral[user] -= (_volume * matchingPrice);
            }
            // was die normalen user verbaucht haben
            sumConsumed += _volume;
            // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
            matchedBidOrderMapping[_period][user] = {};

            // FALL 3: No Order emitted
        } else {
            colleteral[user] -= (_volume * lastReserveAskPrice);
            lack += _volume;
            // was die normalenuser verbraucht haben
            sumConsumed += _volume;
            // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
            matchedBidOrderMapping[_period][user] = {};
        }
    }

    settleCounter++;
    alreadySettled[user] = 1;
    //TODO: endSettle Funktion muss beim Eingang des letzten smart meter datensatzes automatisch ausgeführt werden

    if (settleCounter === numberOfUsers) {
        endSettle(_period, lack, excess);
    }

    return success;
}


function endSettle(_period, _lack, _excess) {

    resetOrders();


    var diff = _excess - _lack;

    if (Math.round(Math.abs(sumConsumed - sumProduced)) != Math.round(Math.abs(_excess - _lack))) {
        console.warn("Phsikalische Differenz entspricht nicht der Rechnerischen");
        debugger;
    }
    // TODO: zuerst die reserve numberOfUsers in askReseverSmData mit dem besten Preis abrechnen
    if (diff >= 0) {
        for (var i in bidReserveSmData[_period]) {
            var smVolume = askReserveSmData[_period][i].smVolume;
            if (smVolume == 0) continue;
            var user = askReserveSmData[_period][i].user;
            if (smVolume <= diff) {
                colleteral[user] -= smVolume * lastReserveBidPrice;
                diff -= smVolume;
            } else { // else if (smVolume > diff)
                colleteral[user] -= diff * lastReserveBidPrice;
                colleteral[user] -= (smVolume - diff) * lastReserveAskPrice;
                diff = 0;
            }
        }
    }

    if (diff <= 0) {
        diff = Math.abs(diff);
        for (var i in askReserveSmData[_period]) {
            var smVolume = askReserveSmData[_period][i].smVolume;
            if (smVolume == 0) continue;
            var user = askReserveSmData[_period][i].user;
            if (smVolume <= diff) {
                colleteral[user] += smVolume * lastReserveAskPrice;
                diff -= smVolume;
            } else {
                colleteral[user] += diff * lastReserveAskPrice;
                colleteral[user] += (smVolume - diff) * lastReserveBidPrice;
                diff = 0;
            }
        }
    }

    // for debugging purposes
    var moneyLeft = getSumOfColleteral();
    if (moneyLeft > 0.001) {
        console.warn("Users have earned more money then they have spent - shouldn't be like this ...")
        debugger;
    }

    // TODO: statt alle zu entlohnen, nur die welche in der letzten Periode mitgemacht haben
    var shareOfEachUser = Math.abs(moneyLeft / _.keys(colleteral).length);
    for (user in colleteral) {
        colleteral[user] += shareOfEachUser;
    }

    // for debugging purposes
    var sum = getSumOfColleteral();
    if (!(sum == 0 || (sum < 0.001 && sum > -0.001))) {
        debugger;
    }

    isFirstSettle = true;
    owner = 1;
    sumProduced = 0;
    sumConsumed = 0;
    sumReserveProduced = 0;
    sumReserveConsumed = 0;

    excess = 0;
    lack = 0;
    settleCounter = 0;
    isFirstSettle = true;

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


var numberOfBidUsers;
var numberOfAskUsers;
var numberOfReserveAskUsers;
var numberOfReserveBidUser;
var numberOfUsers;

function runtests(_numberOfUsers) {
    numberOfUsers = _numberOfUsers;

    //testMatch(_numberOfUsers);

    //testPerfectSettle(_numberOfUsers);

    testRandomSettle(_numberOfUsers);


}

function testMatch(_numberOfUsers) {
    console.groupCollapsed('Matching Test');

    submitRandomAskOrders(_numberOfUsers / 4);
    submitRandomBidOrders(_numberOfUsers / 4);
    printAskOrders();
    printBidOrders();
    match();

    var sum = getSumOfEnergy();

    assert((sum == 0 || (sum < 0.001 && sum > -0.001)), "matched ask and bid order volumes should be the same");
    console.groupEnd();
    printMatchedAskOrders();
    printMatchedBidOrders();
    printMatchingResult();
    submitRandomAskReserveOrders(_numberOfUsers / 4);
    submitRandomBidReserveOrders(_numberOfUsers / 4);
    printAskOrders();
    printBidOrders();
    determineReserveAskPrice();
    determineReserveBidPrice();
    printReserveOrderMatchingResult();
    randomSettle(_numberOfUsers);
}


function testPerfectSettle(_numberOfUsers) {
    console.groupCollapsed("Perfect Settlement Test");
    beforeSettle(_numberOfUsers);
    perfectSettle(_numberOfUsers);
    console.groupEnd();

    var sum = getSumOfColleteral();
    assert((sum == 0 || (sum < 0.001 && sum > -0.001)), "the cumulative sum in the colleteral mapping should be zero, when numberOfUsers stick perfectly to their orders");

}


function testRandomSettle(_numberOfUsers) {
    console.groupCollapsed("Random Settlement Test");
    beforeSettle(_numberOfUsers);
    randomSettle(_numberOfUsers);

    checkEnergyBalance();
    console.groupEnd();
    var sum = getSumOfColleteral();
    assert(sum == 0 || (sum < 0.001 && sum > -0.001), "the cumulative sum in the colleteral mapping should be zero, when reserve numberOfUsers regulate perfectly the lack or excess of energy");
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

function beforeSettle(_numberOfUsers) {
    submitRandomAskOrders(_numberOfUsers / 4);
    submitRandomBidOrders(_numberOfUsers / 4);
    printAskOrders();
    printBidOrders();
    match();
    printMatchedAskOrders();
    printMatchedBidOrders();
    printMatchingResult();
    submitRandomAskReserveOrders(_numberOfUsers / 4);
    submitRandomBidReserveOrders(_numberOfUsers / 4);
    printAskOrders();
    printBidOrders();
    determineReserveAskPrice();
    determineReserveBidPrice();
    printReserveOrderMatchingResult();
}

// settlement mit Erzeugungs- und Verbrauchsdaten, welche den zuvor abgegebenen order volumes entsprechen. Es kommt nicht zu einem Ungleichgewicht und die Reserve Users mÃ¼ssen nicht eingreifen
function perfectSettle(_numberOfUsers) {

    for (var user in matchedBidOrderMapping[period]) {
        settle(user, "CONSUMER", matchedBidOrderMapping[period][user].volume, period);
    }

    for (user in matchedAskOrderMapping[period]) {
        settle(user, "PRODUCER", matchedAskOrderMapping[period][user].volume, period);
    }

    for (var user = 1; user <= _numberOfUsers; user++) {

        if (!settle(user, "PRODUCER", 0, period)) {
            settle(user, "CONSUMER", 0, period);
        }
    }

}


// settlement mit zufÃ¤lligen Erzeugungs- und Verbrauchsdaten. Es kommt zu einem Ungleichgewicht und die Reserve numberOfUsers mÃ¼ssen jenes Ungleichgewicht regulieren.
function randomSettle(_numberOfUsers) {

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

    for (var user = 1; user <= _numberOfUsers; user++) {

        if (!settle(user, "PRODUCER", 0, period)) {
            settle(user, "CONSUMER", 0, period);
        }
    }


    reserveAsks = [];
    reserveBids = [];
}

// verkaufen hohe volumina für einen höheren preis
function submitRandomAskReserveOrders(_numberOfUsers) {
    for (var i = 0; i < _numberOfUsers; i++) {
        var volume = Math.floor(Math.random() * 299) + 1;
        var price = Math.floor(Math.random() * 199) + 1;

        if (saveOrder("ASK", price, volume, owner)) {
            reserveAsks.push({ owner: owner, volume: volume });
            owner++;
            numberOfRegisteredUsers++;
        }
    }
}

// kaufen hohe volumina für einen niedrigeren preis
function submitRandomBidReserveOrders(_numberOfUsers) {
    for (var i = 0; i < _numberOfUsers; i++) {
        var volume = Math.floor(Math.random() * 300) + 1;
        var price = Math.floor(Math.random() * 49) + 1;

        if (saveOrder("BID", price, volume, owner)) {
            reserveBids.push({ owner: owner, volume: volume });
            owner++;
            numberOfRegisteredUsers++;
        }
    }
}

function submitRandomAskOrders(_numberOfUsers) {
    for (var i = 0; i < _numberOfUsers; i++) {
        var volume = Math.floor(Math.random() * 20) + 1;
        var price = Math.floor(Math.random() * 99) + 1;
        if (saveOrder("ASK", price, volume, owner)) {
            owner++;
            numberOfRegisteredUsers++;
        }

    }
}

function submitRandomBidOrders(_numberOfUsers) {
    for (var i = 0; i < _numberOfUsers; i++) {
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
            console.warn("cumulative colleteral is not zero");
            debugger;
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

function getSumOfEnergy() {
    var sum = 0;
    for (var user in matchedAskOrderMapping[period]) {
        sum += matchedAskOrderMapping[period][user].volume;
    }
    for (var user in matchedBidOrderMapping[period]) {
        sum -= matchedBidOrderMapping[period][user].volume;
    }
    return sum;
}


function getSumOfColleteral() {
    var sum = 0;
    for (var i in colleteral) {
        sum += colleteral[i];
    }
    return sum;
    //return (sum == 0 || (sum < 0.001 && sum > -0.001));
}

function checkEnergyBalance() {
    if (sumConsumed + sumReserveConsumed != sumProduced + sumReserveProduced) {
        debugger;
        console.warn("Consumed Energy is not equal to produced Energy");
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
    console.log('Matching price: ', lastMatchingPrice, ' | Bid Volume: ', cumBidVol, ' | Ask Volume: ', cumAskVol, ' | share: ', share);

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
