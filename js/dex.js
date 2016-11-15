'use strict';

const _ = require('lodash');

// global variables

var lowest_ask_id;
var highest_bid_id;
var ask_orderbook = {};
var bid_orderbook = {};
var orders = {};
var order_id = 100;
var tmpowners = {};

// gets reduced within the function settle once a user has not complied to his promised orders
// gets also reduced once users consume energy without having emitted orders at all
var colleteral = {};

const INITIAL_COLLATERAL = 10000;
// default max price for bid orders if no price is provided
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

// bid orders without _maxprice are simply orders with
// a very high _maxprice (flex bid).
function submitBidOrder(_ownerid, _volume, _price) {
  if (!_ownerid) {
    throw new Error('_ownerid missing');
  }
  if (!_volume) {
    throw new Error('_volume missing');
  }
  if (!_price) {
    _price = DEFAULT_MAXPRICE;
  }
  return save_order('BID', _ownerid, _volume, _price);
}

function submitAskOrder(_ownerid, _volume, _price) {
  if (!_ownerid) {
    throw new Error('_ownerid missing');
  }
  if (!_volume) {
    throw new Error('_volume missing');
  }
  if (!_price) {
    throw new Error('_price missing');
  }
  return save_order('ASK', _ownerid, _volume, _price);
}

// reserve ask wird im selben ask order book gespeichert,
// da jenes beim matching geleert wird
function submitReserveAsk(_ownerid, _volume, _price) {
  if (!_ownerid) {
    throw new Error('_ownerid missing');
  }
  if (!_volume) {
    throw new Error('_volume missing');
  }
  if (!_price) {
    throw new Error('_price missing');
  }
  return save_order('ASK', _ownerid, _volume, _price);
}

// Saves orders based on the best price in the ask_orderbook or bid_orderbook. Both objects are implemented as linked list
// Saves order data into the order mapping (order_id => Order).
function save_order(_type, _ownerid, _volume, _price) {
  if (!_type) {
    throw new Error('_type is missing');
  }
  let supportedTypes = ['ASK', 'BID'];
  if (!_.includes(supportedTypes, _type)) {
    throw new Error('_type is not supported');
  }
  if (!_ownerid) {
    throw new Error('_ownerid missing');
  }
  // check onwer is known
  // TODO(ms): allow multiple orders
  if (_ownerid in tmpowners) {
    throw new Error('owner with _ownerid ' + _ownerid + ' already submitted an order.');
  }
  if (!_volume) {
    throw new Error('_volume missing');
  }
  if (!_price) {
    throw new Error('_price missing');
  }

  order_id++;
  if (order_id in orders) {
    throw new Error('order with id ' + order_id + ' already stored.');
  };

  // validation done, process order

  // save owner
  tmpowners[_ownerid] = {};
  // set collateral
  colleteral[_ownerid] = INITIAL_COLLATERAL;

  var Order = {
    type: undefined,
    volume: undefined,
    price: undefined,
    id: undefined,
    ownerid: undefined,
  };

  var Pointer = {
    order_id: undefined,
    next_order_id: undefined
  };

  // initialize order variables
  orders[order_id] = Order;
  orders[order_id].type = _type;
  orders[order_id].volume = _volume;
  orders[order_id].price = _price;
  orders[order_id].id = order_id;
  orders[order_id].ownerid = _ownerid;

  var positionFound = false;
  var id_iter;

  // ask orderbook is aufsteigend sortiert
  if (_type === 'ASK') {
    ask_orderbook[order_id] = Pointer;
    // order_id kann schon gesetzt werden
    // -> next_order_id wird später gesetzt
    ask_orderbook[order_id].order_id = order_id;

    // Fall 1: es sind noch keine orders vorhanden
    if (!lowest_ask_id) {
      lowest_ask_id = order_id;

    // Fall 2: order wird vorne dran gehangen
    } else if (_price < orders[lowest_ask_id].price) {
      ask_orderbook[order_id].next_order_id = lowest_ask_id;
      lowest_ask_id = order_id;

    // order wird zwischendrin oder ganz am Ende platziert
    } else {
      id_iter = lowest_ask_id;
      while (true) {
        // Fall 3: order wird ganz hinten dran gehangen
        if (!ask_orderbook[id_iter].next_order_id) {
          ask_orderbook[id_iter].next_order_id = order_id;
          break;
        }
        // Fall 4: order wird zwischendrin
        if (_price < orders[ask_orderbook[id_iter].next_order_id].price) {
          ask_orderbook[order_id].next_order_id = ask_orderbook[id_iter].next_order_id;
          ask_orderbook[id_iter].next_order_id = order_id;
          break;
        }
        // process to next in ask orderbook entry
        id_iter = ask_orderbook[id_iter].next_order_id;
      }
    }
  }

  // bid orderbook is absteigend sortiert
  if (_type === 'BID') {
    bid_orderbook[order_id] = Pointer;
    // order_id kann schon gesetzt werden
    // -> next_order_id muss im folgenden bestimmt werden
    bid_orderbook[order_id].id = order_id;

    // Fall 1: es sind noch keine orders vorhanden
    if (!orders[highest_bid_id]) {
      highest_bid_id = order_id;

    // Fall 2: order wird vorne dran gehangen
    } else if (_price > orders[highest_bid_id].price) {
      bid_orderbook[order_id].next_order_id = highest_bid_id;
      highest_bid_id = order_id;

    // order wird zwischendrin oder ganz am Ende platziert
    } else {
      id_iter = highest_bid_id;
      while (true) {
        // Fall 3: order wird ganz hinten dran gehangen
        if (!bid_orderbook[id_iter].next_order_id) {
          bid_orderbook[id_iter].next_order_id = order_id;
          break;
        }
        // Fall 4: order zwischendrin platzieren
        if (_price > orders[bid_orderbook[id_iter].next_order_id].price) {
          bid_orderbook[order_id].next_order_id = bid_orderbook[id_iter].next_order_id;
          bid_orderbook[id_iter].next_order_id = order_id;
          break;
        }
        // process to next in bid orderbook entry
        id_iter = bid_orderbook[id_iter].next_order_id;
      }
    }
  }

  return true;
}

function getBidOrders() {
  var id_iter_bid = highest_bid_id;
  var bidOrders = [];
  while (orders[id_iter_bid]) {
    bidOrders.push(orders[id_iter_bid]);
    id_iter_bid = bid_orderbook[id_iter_bid].next_order_id;
  }
  return bidOrders;
}

function printBidOrders() {
  for (order in getBidOrders()) {
    onsole.log('Price: ' + order.price + ' | Volume: ' + order.volume + ' | Owner: ' + order.ownerid);
  }
}

function getAskOrders() {
  var id_iter_ask = lowest_ask_id;
  var askOrders = [];
  while (orders[id_iter_ask]) {
    askOrders.push(orders[id_iter_ask]);
    id_iter_ask = ask_orderbook[id_iter_ask].next_order_id;
  }
  return askOrders;
}

function printAskOrders() {
  for (order in getAskOrders()) {
    console.log('Price: ' + order.price + ' | Volume: ' + order.volume + ' | Owner: ' + order.ownerid);
  }
}

// matches orders and saves the resulting information in the matchedAskOrderMapping and matchedBidOrderMapping
// TODO: events rausballern für jeden user dessen orders gematched wurden
function match() {
  if (Object.keys(bid_orderbook).length === 0 || Object.keys(ask_orderbook).length === 0) {
    resetOrders();
    return;
  }

  var cumAskVol = 0;
  var cumBidVol = 0;
  var matching_price;

  matching_price = orders[lowest_ask_id].price;
  var isMatched = false;
  var bid_price = orders[highest_bid_id].price;
  var id_iter_ask = lowest_ask_id;
  var id_iter_bid = highest_bid_id;
  period++;

  while (!isMatched) {
    while (orders[id_iter_ask].price === matching_price) {
      var volume = orders[id_iter_ask].volume;
      var ownerid = orders[id_iter_ask].ownerid;

      cumAskVol += volume;

      appendToDoubleMapping(matchedAskOrderMapping, period, ownerid, {
        offeredVolume: volume
      });

      var next_order_id = ask_orderbook[id_iter_ask].next_order_id;
      if (next_order_id) {
        id_iter_ask = next_order_id;
      } else {
        break;
      }
    }

    // TODO: iterates each time through the mapping. Find better solution!
    while (orders[id_iter_bid].price >= matching_price) {
      var volume = orders[id_iter_bid].volume;
      var ownerid = orders[id_iter_bid].ownerid;
      var next_order_id = bid_orderbook[id_iter_bid].next_order_id;

      cumBidVol += volume;

      appendToDoubleMapping(matchedBidOrderMapping, period, ownerid, {
        orderedVolume: volume
      });

      id_iter_bid = next_order_id;
      if (!id_iter_bid) {
        break;
      }
    }

    if (cumAskVol >= cumBidVol) {
      isMatched = true;
    } else {
      matching_price = orders[id_iter_ask].price;
      id_iter_bid = highest_bid_id;
      cumBidVol = 0;
      matchedBidOrderMapping[period] = {};
    }
  }

  // calculates how much energy each producer can release into the grid within the next interval
  var share = cumBidVol / cumAskVol;
  for (ownerid in matchedAskOrderMapping[period]) {
    matchedAskOrderMapping[period][ownerid].offeredVolume = matchedAskOrderMapping[period][ownerid].offeredVolume * share;
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
  ask_orderbook = {};
  bid_orderbook = {};
  highest_bid_id = undefined;
  lowest_ask_id = undefined;
  // the order information itself needs to be deleted
  orders = {};
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

// TODO: events rausballern für jeden user dessen orders gematched wurden
// TODO: auch den Kaufpreis vorab bestimmen
function determineReservePrice() {
  var cumAskReserveVol = 0;
  var reserve_price;
  var isFound = false;
  reserve_price = orders[lowest_ask_id].price;
  var id_iter_ask = lowest_ask_id;

  while (!isFound) {
    while (orders[id_iter_ask].price === reserve_price) {
      var volume = orders[id_iter_ask].volume;
      var ownerid = orders[id_iter_ask].ownerid;

      cumAskReserveVol += volume;
      appendToDoubleMapping(matchedReserveOrderMapping, period, ownerid, {
        offeredVolume: volume
      });

      var next_order_id = ask_orderbook[id_iter_ask].next_order_id;
      if (next_order_id) {
        id_iter_ask = next_order_id;
      } else {
        break;
      }
    }

    if (cumAskReserveVol >= MIN_RESERVE_VOLUME) {
      isFound = true;
    } else {
      reserve_price = orders[id_iter_ask].price;
    }
  }
  orders = {};

  reservePriceMapping[period] = reserve_price;

  console.log('\n######################################');
  console.log('####### Reserve Matching Result ######');
  console.log('######################################');
  console.log('\nReserve Price: ' + reserve_price + ' | Volume (>1000): ' + cumAskReserveVol);
}

function getOrders() {

  console.log('\n##################################################################################################################');
  console.log('################################################## Overall Result ################################################ ');
  console.log('##################################################################################################################');

  console.log('\n######################################');
  console.log('######### Matched Ask Orders #########');
  console.log('######################################');

  for (var period in matchedAskOrderMapping) {
    for (var ownerid in matchedAskOrderMapping[period]) {
      console.log('Period: ', period, ' | Owner: ', ownerid, ' | OfferedVol: ', matchedAskOrderMapping[period][ownerid].offeredVolume);
    }
  }

  console.log('\n######################################');
  console.log('######### Matched Bid Orders #########');
  console.log('######################################');

  for (var period in matchedBidOrderMapping) {
    for (var ownerid in matchedBidOrderMapping[period]) {
      console.log('Period: ', period, ' | Owner: ', ownerid, ' | OrderedVol: ', matchedBidOrderMapping[period][ownerid].orderedVolume);
    }
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
    throw new Error('_volume is missing');
  }
  if (_volume === 0) {
    throw new Error('_volume must be greater 0');
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
  // TODO: leute brücksichtigen, welche ohne orders abzugeben strom beziehen. Die müssen irgendwie an den reserve price dran kommen

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

var dex = {
  submitBidOrder: submitBidOrder,
  submitAskOrder: submitAskOrder,
  submitReserveAsk: submitReserveAsk,
  save_order: save_order,
  match: match,
  resetOrders: resetOrders,
  appendToDoubleMapping: appendToDoubleMapping,
  determineReservePrice: determineReservePrice,
  getOrders: getOrders,
  getBidOrders: getBidOrders,
  getAskOrders: getAskOrders,
  settle: settle
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = dex;
} else {
  Object.assign(window, dex);
}
