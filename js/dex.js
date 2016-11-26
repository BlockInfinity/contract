'use strict';

// ####################################################################################
// ############################# Zyklus übergreifende Variablen #######################
// ####################################################################################


// default max price for bid idToOrder if no price is provided
const DEFAULT_MAXPRICE = Number.MAX_SAFE_INTEGER;

// kWh needed to be secured against any shortage
const MIN_RESERVE_VOLUME = 1000; 

// 15 minute period
var period = 1;

// order id
var idCounter = 1;

// keeps track of the money users have deposited within the contract
var colleteral = {};

var idToOrder = {};

// matched order information gets saved based on the period and owner. analog to mapping(address => mapping (period => volume))
var matchedAskOrderMapping = {};
var matchedBidOrderMapping = {};

var matchedAskReserveOrderMapping = {};
var matchedBidReserveOrderMapping= {};

// stores matching price for each period
var matchingPriceMapping = {};

// stores prices for reserve power for each periode
var askReservePrices = {};
var bidReservePrice = {};

// ####################################################################################
// ############################## Zyklus Variablen ####################################
// ####################################################################################

// cumulated reserve power
var cumAskReserveVol = 0;
var cumBidReserveVol = 0;

// prevents users from submitting two orders within one period
var tmpowners = {};

var reserve_bid_price;
var reserve_ask_price;

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

// bei dem matching_price vorhandene volume
var cumAskVol = 0;
var cumBidVol = 0;

var matching_price;

// anteil von bid / ask volume der verbraucht/geliefert werden kann
var share;



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

    bidReservePrice[period] = reserve_bid_price;
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
    var reserveBidPrice = bidReservePrice[period];
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

// getters
function getMatchedAskOrders() {
    var matches = [];
    for (var period in matchedAskOrderMapping) {
        for (var owner in matchedAskOrderMapping[period]) {
            matches.push({ 'period': period, 'owner': owner, 'offeredVolume': matchedAskOrderMapping[period][owner].offeredVolume });
        }
    }
    return matches;
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
    colleteral: colleteral
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = exportContainer;
} else {
    Object.assign(window, exportContainer);
};
