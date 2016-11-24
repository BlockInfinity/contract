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
var period = 0;

// here matched order information gets saved based on the period and owner. analog to mapping(address => mapping (period => Data))
var matchedAskOrderMapping = {};
var matchedBidOrderMapping = {};
var matchingPriceMapping = {};

const MIN_RESERVE_VOLUME = 1000; // kWh needed to be secured against any shortage
var matchedReserveOrderMapping = {};

var reservePriceMapping = {};

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
    new_save_order("BID", _price, _volume, _owner)
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
    new_save_order("ASK", _price, _volume, _owner);
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
    new_save_order("ASK", _price, _volume, _owner);
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


function new_save_order(_type, _price, _volume, _owner) {
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
}




// Saves idToOrder based on the best price in the idToOrder or idToOrder. Both objects are implemented as linked list
// Saves order data into the order mapping (order_id => Order).
function save_order(_type, _owner, _volume, _price) {
    //   if (!_type) {
    //     throw new Error('_type is missing');
    //   }r
    //   let supportedTypes = ['ASK', 'BID'];
    //   if (!_.includes(supportedTypes, _type)) {
    //     throw new Error('_type is not supported');
    //   }
    //   if (!_owner) {
    //     throw new Error('_owner missing');
    //   }
    //   // check if owner is known
    //   // TODO(ms): allow multiple idToOrder
    //   if (_owner in tmpowners) {
    //     //throw new Error('owner with _owner ' + _owner + ' already submitted an order.'); 
    //     console.error('owner with _owner ' + _owner + ' already submitted an order.');  
    //   }
    //   if (!_volume) {
    //     throw new Error('_volume missing');
    //   }
    //   if (!_price) {
    //     throw new Error('_price missing');
    //   }

    //   order_id++;
    //   if (order_id in idToOrder) {
    //     throw new Error('order with id ' + order_id + ' already stored.');
    //   };

    //   ///////
    //   // validation all ok, process order
    //   ///////

    //   // set owner
    //   tmpowners[_owner] = {};
    //   // set collateral
    //   colleteral[_owner] = INITIAL_COLLATERAL;

    //   var Order = {
    //     type: undefined,
    //     volume: undefined,
    //     price: undefined,
    //     id: undefined,
    //     owner: undefined,
    //   };

    //   var Pointer = {
    //     order_id: order_id,
    //     nex: undefined
    //   };

    //   // initialize order variables
    //   idToOrder[order_id] = Order;
    //   idToOrder[order_id].type = _type;
    //   idToOrder[order_id].volume = _volume;
    //   idToOrder[order_id].price = _price;
    //   idToOrder[order_id].id = order_id;
    //   idToOrder[order_id].owner = _owner;

    //   var positionFound = false;
    //   var id_iter;

    //   // ask orderbook is aufsteigend sortiert
    //   if (_type === 'ASK') {
    //     // order_id kann schon gesetzt werden
    //     // -> nex wird später gesetzt
    //     idToOrder[order_id] = Pointer;

    //     // Fall 1: es sind noch keine idToOrder vorhanden
    //     if (!minAsk.id) {
    //       minAsk.id = order_id;

    //     // Fall 2: order wird vorne dran gehangen
    //     } else if (_price < idToOrder[minAsk.id].price) {
    //       idToOrder[order_id].nex = minAsk.id;
    //       minAsk.id = order_id;

    //     // order wird zwischendrin oder ganz am Ende platziert
    //     } else {
    //       id_iter = minAsk.id;
    //       while (true) {
    //         // Fall 3: order wird ganz hinten dran gehangen
    //         if (!idToOrder[id_iter].nex) {
    //           idToOrder[id_iter].nex = order_id;
    //           break;
    //         }
    //         // Fall 4: order wird zwischendrin
    //         if (_price < idToOrder[idToOrder[id_iter].nex].price) {
    //           idToOrder[order_id].nex = idToOrder[id_iter].nex;
    //           idToOrder[id_iter].nex = order_id;
    //           break;
    //         }
    //         // process to next in ask orderbook entry
    //         id_iter = idToOrder[id_iter].nex;
    //       }
    //     }
    //   }

    //   // bid orderbook ist absteigend sortiert
    //   if (_type === 'BID') {
    //     // order_id kann schon gesetzt werden
    //     // -> nex muss im folgenden bestimmt werden
    //     idToOrder[order_id] = Pointer;

    //     // Fall 1: es sind noch keine idToOrder vorhanden
    //     if (!idToOrder[maxBid.id]) {
    //       maxBid.id = order_id;

    //     // Fall 2: order wird vorne dran gehangen
    //     } else if (_price > idToOrder[maxBid.id].price) {
    //       idToOrder[order_id].nex = maxBid.id;
    //       maxBid.id = order_id;

    //     // order wird zwischendrin oder ganz am Ende platziert
    //     } else {
    //       id_iter = maxBid.id;
    //       while (true) {
    //         // Fall 3: order wird ganz hinten dran gehangen
    //         if (!idToOrder[id_iter].nex) {
    //           idToOrder[id_iter].nex = order_id;
    //           break;
    //         }
    //         // Fall 4: order zwischendrin platzieren
    //         if (_price > idToOrder[idToOrder[id_iter].nex].price) {
    //           idToOrder[order_id].nex = idToOrder[id_iter].nex;
    //           idToOrder[id_iter].nex = order_id;
    //           break;
    //         }
    //         // process to next in bid orderbook entry
    //         id_iter = idToOrder[id_iter].nex;
    //       }
    //     }
    //   }

    //   return true;
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
    for (var i in askOrderBook) {
        console.log('Price: ' + askOrderBook[i].price + ' | Volume: ' + askOrderBook[i].volume + ' | Owner: ' + askOrderBook[i].owner);
    }
}

// matches idToOrder and saves the resulting information in the matchedAskOrderMapping and matchedBidOrderMapping
// TODO: events rausballern für jeden user dessen idToOrder gematched wurden
function match() {
    if (Object.keys(idToOrder).length === 0) {
        resetOrders();
        return;
    }

    var cumAskVol = 0;
    var cumBidVol = 0;
    var matching_price;

    matching_price = idToOrder[minAsk.id].price;
    var isMatched = false;
    var bid_price = idToOrder[maxBid.id].price;
    var iter_ask_id = minAsk.id;
    var id_iter_bid = maxBid.id;
    period++;

    while (!isMatched) {
        while (idToOrder[iter_ask_id].price === matching_price) {
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
                break;
            }
        }

        // TODO: iterates each time through the mapping. Find better solution!
        while (idToOrder[id_iter_bid].price >= matching_price) {
            var volume = idToOrder[id_iter_bid].volume;
            var owner = idToOrder[id_iter_bid].owner;
            var nex = idToOrder[id_iter_bid].nex;

            cumBidVol += volume;

            appendToDoubleMapping(matchedBidOrderMapping, period, owner, {
                orderedVolume: volume
            });

            id_iter_bid = nex;
            if (!id_iter_bid) {
                break;
            }
        }

        if (cumAskVol >= cumBidVol) {
            isMatched = true;
        } else {
            matching_price = idToOrder[iter_ask_id].price;
            id_iter_bid = maxBid.id;
            cumBidVol = 0;
            matchedBidOrderMapping[period] = {};
        }
    }

    // calculates how much energy each producer can release into the grid within the next interval
    var share = cumBidVol / cumAskVol;
    for (owner in matchedAskOrderMapping[period]) {
        matchedAskOrderMapping[period][owner].offeredVolume = matchedAskOrderMapping[period][owner].offeredVolume * share;
    }

    matchingPriceMapping[period] = matching_price;

    resetOrders();

    console.log('\n######################################');
    console.log('########### Matching Result ##########');
    console.log('######################################');
    console.log('Matching price: ', matching_price, ' | Matched Bid Volume: ', cumBidVol, ' | Available Ask Volume: ', cumAskVol, ' | share: ', share);
}

function resetOrders() {
    // both orderbooks need to be deleted
    // idToOrder = {};
    // maxBid.id = undefined;
    // minAsk.id = undefined;



    // the order information itself needs to be deleted
    // tmpowners = {};
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

// TODO: events rausballern für jeden user dessen idToOrder gematched wurden
// TODO: auch den Kaufpreis vorab bestimmen
function determineReservePrice() {

    var cumAskReserveVol = 0;
    var reserve_price;
    var isFound = false;
    reserve_price = idToOrder[minAsk.id].price;
    var iter_ask_id = minAsk.id;

    while (!isFound) {
        while (idToOrder[iter_ask_id].price === reserve_price) {
            var volume = idToOrder[iter_ask_id].volume;
            var owner = idToOrder[iter_ask_id].owner;

            cumAskReserveVol += volume;
            appendToDoubleMapping(matchedReserveOrderMapping, period, owner, {
                offeredVolume: volume
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
            reserve_price = idToOrder[iter_ask_id].price;
        }
    }


    reservePriceMapping[period] = reserve_price;

    console.log('\n######################################');
    console.log('####### Reserve Matching Result ######');
    console.log('######################################');
    console.log('\nReserve Price: ' + reserve_price + ' | Volume (>1000): ' + cumAskReserveVol);
}

function getMatchedAskOrders() {
    var matchedAskOrders = [];
    for (var period in matchedAskOrderMapping) {
        for (var owner in matchedAskOrderMapping[period]) {
            matchedAskOrders.push({ 'period': period, 'owner': owner, 'offeredVolume': matchedAskOrderMapping[period][owner].offeredVolume });
        }
    }
    return matchedAskOrders;
}


function printMatchedAskOrders() {
    var matchedAskOrders = getMatchedAskOrders();
    for (i in matchedAskOrders) {
        console.log('Period: ', matchedAskOrders[i].period, ' | Owner: ', matchedAskOrders[i].owner, ' | OrderedVol: ', matchedAskOrders[i].orderedVolume);
    }
}


function getMatchedBidOrders() {
    var matchedBidOrders = [];
    for (var period in matchedBidOrderMapping) {
        for (var owner in matchedBidOrderMapping[period]) {
            matchedBidOrders.push({ 'period': period, 'owner': owner, 'orderedVolume': matchedBidOrderMapping[period][owner].orderedVolume });
        }
    }
    return matchedBidOrders;
}

function printMatchedBidOrders() {
    var matchedBidOrders = getMatchedBidOrders();
    for (i in matchedBidOrders) {
        console.log('Period: ', matchedBidOrders[i].period, ' | Owner: ', matchedBidOrders[i].owner, ' | OrderedVol: ', matchedBidOrders[i].orderedVolume);
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
    if (!_.includes(supportedTypes, _type)) {
        throw new Error('_type is not supported');
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

    var success = false;

    var user = _user;
    var ordered = 0;
    var offered = 0;
    var diff;

    var reservePrice = reservePriceMapping[period];
    var matchingPrice = matchingPriceMapping[period];

    if (_type === 'PRODUCER') {
        if (matchedReserveOrderMapping[_period][user]) {
            if (!matchedReserveOrderMapping[_period][user].offeredVolume) {
                //console.warn("Position already settled.");
                return false;
            }

            offered = matchedReserveOrderMapping[_period][user].offeredVolume;

            if (_volume <= offered) {
                colleteral[user] += _volume * reservePrice;
            } else {
                colleteral[user] += offered * reservePrice;
            }
            matchedReserveOrderMapping[_period][user] = {};
            //console.log("(Settlement Reserve Ask Order) User: "+user+" | Volume: "+_volume+" | Price: "+reservePrice);
            success = true;
        }

        if (matchedAskOrderMapping[_period][user]) {
            if (!matchedAskOrderMapping[_period][user].offeredVolume) {
                //console.warn("Position already settled.");
                return false;
            }

            offered = matchedAskOrderMapping[_period][user].offeredVolume;
            diff = offered - _volume;

            if (_volume < offered) { // user hat zu wenig Strom eingespeist
                colleteral[user] -= (diff * reservePrice);
                colleteral[user] += _volume * matchingPrice;
            } else {
                colleteral[user] += offered * matchingPrice;
            }
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
            if (_volume > ordered) { // user hat zu viel Strom bezogen
                colleteral[user] -= (diff * reservePrice);
                colleteral[user] -= (ordered * matchingPrice);
            } else {
                colleteral[user] -= (ordered * matchingPrice);
            }
            matchedBidOrderMapping[_period][user] = {};
            success = true;
        } else {
            colleteral[user] -= (_volume * reservePrice);
        }
    }

    return success;
}

// var dex = {
//     submitBidOrder: submitBidOrder,
//     submitAskOrder: submitAskOrder,
//     submitReserveAsk: submitReserveAsk,
//     save_order: save_order,
//     match: match,
//     resetOrders: resetOrders,
//     appendToDoubleMapping: appendToDoubleMapping,
//     determineReservePrice: determineReservePrice,
//     getMatchedAskOrders: getMatchedAskOrders,
//     getMatchedBidOrders: getMatchedBidOrders,
//     getBidOrders: getBidOrders,
//     getAskOrders: getAskOrders,
//     settle: settle
// };

// if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
//     module.exports = dex;
// } else {
//     Object.assign(window, dex);
// };
