'use strict';

const _ = require('lodash');
const assert = require('assert');

// ####################################################################################
// ############################# Zyklus Ã¼bergreifende Variablen #######################
// ####################################################################################


// default max price for bid idToOrder if no price is provided
const DEFAULT_MAXPRICE = Number.MAX_SAFE_INTEGER;

// kWh needed to be secured against any shortage
const MIN_RESERVE_VOLUME = 1000;

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

// matching related metrics
// global for printing purposes
var cumAskVol = 0;
var cumBidVol = 0;
var lastMatchingPrice = 0;
var share = 0;

// CAUTION: NEVER WRITE THE FOLLOWING VARIABLES DIRECTLY
var period = 1; // 15 minute period
var state = 0;
var minAsk = 0;
var maxBid = 0;
// state 0: accept orders;
// state 1: accept reserver order
function nextState() {
  switch (state) {
  case 0:
    match();
    minAsk = 0;
    maxBid = 0;
    // move on to state 1
    state = 1;
  break;
  case 1:
    determineReserveAskPrice();
    determineReserveBidPrice();
    minAsk = 0;
    maxBid = 0;
    // reset orders
    idCounter = 1;
    tmpowners = {};
    period++;
    // move on to state 0
    state = 0;
  break;
  default:
  break;
}
}

// bid idToOrder without _maxprice are simply idToOrder with
// a very high _maxprice (flex bid).
function submitBidOrder(_owner, _volume, _price) {
  if (!_owner) {
    throw new Error('_owner missing');
  }
  if (!_volume) {
    throw new Error('_volume missing');
  }
  if (_price === undefined) {
    _price = DEFAULT_MAXPRICE;
  }
  if (state !== 0) {
    throw new Error('not allowed in state: ' + state);
  }
  saveOrder('BID', _volume, _owner, _price);
}

function submitAskOrder(_owner, _volume, _price) {
  if (!_owner) {
    throw new Error('_owner missing');
  }
  if (!_volume) {
    throw new Error('_volume missing');
  }
  if (_price === undefined) {
    throw new Error('_price missing');
  }
  if (state !== 0) {
    throw new Error('not allowed in state: ' + state);
  }
  saveOrder('ASK', _volume, _owner, _price);
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
  if (_price === undefined) {
    throw new Error('_price missing');
  }
  if (state !== 1) {
    throw new Error('not allowed in state: ' + state);
  }
  return saveOrder('ASK', _volume, _owner, _price);
}

function submitReserveBid(_owner, _volume, _price) {
  if (!_owner) {
    throw new Error('_owner missing');
  }
  if (!_volume) {
    throw new Error('_volume missing');
  }
  if (_price === undefined) {
    _price = DEFAULT_MAXPRICE;
  }
  if (state !== 1) {
    throw new Error('not allowed in state: ' + state);
  }
  saveOrder('BID', _volume, _owner, _price);
}

function saveOrder(_type, _volume, _owner, _price) {
  if (!_type) {
    throw new Error('_type missing');
  }
  if (_volume === undefined) {
    throw new Error('_volume missing');
  }
  if (!_owner) {
    throw new Error('_owner missing');
  }
  if (_price === undefined) {
    _price = DEFAULT_MAXPRICE;
  }

  // es darf pro periode stets nur eine order pro user abgegeben werden
  if (tmpowners[_owner]) { // in solidity einfach im mapping auf 0 oder 1 prÃ¼fen
    return false;
  }
  tmpowners[_owner] = 1;

  var curr_order = {
      id: idCounter++,
      next: 0,
      owner: _owner,
      volume: _volume,
      price: _price,
    };

  var best_order;

  var ascending = 0;

  if (_type === 'ASK') {
    best_order = minAsk;
    ascending = 1;

  } else if (_type === 'BID') {
    best_order = maxBid;
    ascending = -1;
  }

  // save and return if this the first bid
  if (best_order === 0) {
    idToOrder[curr_order.id] = curr_order;
    best_order = curr_order.id;

  } else {
    // iterate over list till same price encountered
    var curr = best_order;
    var prev = 0;
    while (curr != 0 && (ascending * curr_order.price) > (ascending * idToOrder[curr].price)) {
      prev = curr;
      curr = idToOrder[curr].next;
    }

    // update pointer
    curr_order.next = curr;

    // insert order
    idToOrder[curr_order.id] = curr_order;

    // curr_order added at the end
    if (curr_order.next === best_order) {
      best_order = curr_order.id;
      // at least one prev order exists
    } else {
      idToOrder[prev].next = curr_order.id;
    }
  }

  // best idToOrder werden im storage geupdated
  if (_type === 'ASK') {
    minAsk = best_order;
  } else if (_type === 'BID') {
    maxBid = best_order;
  }

  return true;
}

// matches idToOrder and saves the resulting information in the matchedAskOrderMapping and matchedBidOrderMapping
// TODO: events rausballern fÃ¼r jeden user dessen idToOrder gematched wurden
function match() {
  if (state !== 0) {
    throw new Error('not allowed in state: ' + state);
  }
  if (Object.keys(idToOrder).length === 0) {
    return;
  }

  cumAskVol = 0;
  cumBidVol = 0;
  lastMatchingPrice = idToOrder[minAsk].price;
  var isMatched = false;
  var outOfAskOrders = false;
  var iter_ask_id = minAsk;
  var id_iter_bid = maxBid;

  while (!isMatched) {
    // cumulates ask volume for fixed price level
    while (iter_ask_id !== 0 && (idToOrder[iter_ask_id].price === lastMatchingPrice)) {
      var volume = idToOrder[iter_ask_id].volume;
      var owner = idToOrder[iter_ask_id].owner;
      cumAskVol += volume;

      appendToDoubleMapping(matchedAskOrderMapping, period, owner, {
          volume: volume
        });

      var next = idToOrder[iter_ask_id].next;
      if (next) {
        iter_ask_id = next;
      } else {
        outOfAskOrders = true;
        break;
      }
    }

    // TODO: iterates each time through the mapping. Find better solution!
    //console.log(idToOrder[id_iter_bid].price);
    //console.log(lastMatchingPrice);
    while (idToOrder[id_iter_bid].price >= lastMatchingPrice) {
      var volume = idToOrder[id_iter_bid].volume;
      var owner = idToOrder[id_iter_bid].owner;
      cumBidVol += volume;

      appendToDoubleMapping(matchedBidOrderMapping, period, owner, {
          volume: volume
        });

      id_iter_bid = idToOrder[id_iter_bid].next;
      if (!id_iter_bid) {
        break;
      }
    }

    if (cumAskVol >= cumBidVol || outOfAskOrders) {
      isMatched = true;
    } else {
      lastMatchingPrice = idToOrder[iter_ask_id].price;
      id_iter_bid = maxBid;
      cumBidVol = 0;
      matchedBidOrderMapping[period] = {};
    }
  }

  // calculates how much energy each producer can release into the grid within the next interval
  if (cumBidVol < cumAskVol) {
    share = cumBidVol / cumAskVol;
    for (owner in matchedAskOrderMapping[period]) {
      //console.log(matchedAskOrderMapping[period][owner].volume);
      matchedAskOrderMapping[period][owner].volume = matchedAskOrderMapping[period][owner].volume * share;
    }

  } else {
    share = cumAskVol / cumBidVol;
    for (owner in matchedBidOrderMapping[period]) {
      matchedBidOrderMapping[period][owner].volume = matchedBidOrderMapping[period][owner].volume * share;
    }
  }

  matchingPriceMapping[period] = lastMatchingPrice;

  return true;
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
  if (state !== 1) {
    throw new Error('not allowed in state: ' + state);
  }
  cumAskReserveVol = 0;
  var isFound = false;
  if (!idToOrder[minAsk]) {
    console.log('price for min ask missing');
    return;
  }
  var lastReserveAskPrice = idToOrder[minAsk].price;
  var iter_ask_id = minAsk;

  while (!isFound) {
    while (idToOrder[iter_ask_id] && idToOrder[iter_ask_id].price === lastReserveAskPrice) {
      var volume = idToOrder[iter_ask_id].volume;
      var owner = idToOrder[iter_ask_id].owner;

      cumAskReserveVol += volume;
      appendToDoubleMapping(matchedAskReserveOrderMapping, period, owner, {
          volume: volume
        });

      var next = idToOrder[iter_ask_id].next;
      if (next) {
        iter_ask_id = next;
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

  // hiermit wird garnatiert dass die reserve leute stets für einen genau so guten /
  // besseren preis strom handeln können als die normalen Leute
  if (lastReserveAskPrice < lastMatchingPrice) {
    askReservePrices[period] = lastMatchingPrice;
  } else {
    askReservePrices[period] = lastReserveAskPrice;
  }
}

function determineReserveBidPrice() {
  if (state !== 1) {
    throw new Error('not allowed in state: ' + state);
  }
  cumBidReserveVol = 0;
  var isFound = false;
  if (!idToOrder[maxBid]) {
    console.log('price for max bid missing');
    return;
  }
  var lastReserveBidPrice = idToOrder[maxBid].price;
  var iter_bid_id = maxBid;

  while (!isFound) {
    while (idToOrder[iter_bid_id] && idToOrder[iter_bid_id].price === lastReserveBidPrice) {
      var volume = idToOrder[iter_bid_id].volume;
      var owner = idToOrder[iter_bid_id].owner;

      cumBidReserveVol += volume;
      appendToDoubleMapping(matchedBidReserveOrderMapping, period, owner, {
          volume: volume
        });

      var next = idToOrder[iter_bid_id].next;
      if (next) {
        iter_bid_id = next;
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

  // hiermit wird garnatiert dass die reserve leute stets für einen genau so guten /
  // besseren preis strom handeln können als die normalen Leute
  if (lastReserveBidPrice > lastMatchingPrice) {
    bidReservePrices[period] = lastReserveBidPrice;
  } else {
    bidReservePrices[period] = lastMatchingPrice;
  }
}

// variables for settlement
var isFirstSettle = {};
var alreadySettled = {};
var settleCounter = {};
var sumProduced = {};
var sumConsumed = {};

var sumReserveProduced = {};
var sumReserveConsumed = {};
var excess = {};
var lack = {};

// reserve order data for the endSettle function
var askReserveSmData = {};
var bidReserveSmData = {};

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
  if (_volume === undefined) {
    throw new Error('_volume is missing');
  }
  if (!matchedAskOrderMapping[_period] || !matchedBidOrderMapping[_period]) {
    throw new Error('period that should be settled does not exist');
  }
  if (_period >= period) {
    throw new Error('not allowed to settle in current or future period');
  }

  // initialisierung beim ersten settle per period
  if (!isFirstSettle[_period]) {
    isFirstSettle[_period] = 1;
    alreadySettled[_period] = {};
    settleCounter[_period] = 0;
    sumProduced[_period] = 0;
    sumConsumed[_period] = 0;

    sumReserveProduced[_period] = 0;
    sumReserveConsumed[_period] = 0;
    excess[_period] = 0;
    lack[_period] = 0;

    askReserveSmData[_period] = [];
    bidReserveSmData[_period] = [];
  }

  if (alreadySettled[_period] && alreadySettled[_period][_user]) {
    //console.warn('user already settled in period ' + _period);
    return false;
  }

  // for test purposes: each user gets assigned a colleteral of 0
  if (!colleteral[_user]) {
    colleteral[_user] = 0;
  };

  var user = _user;
  var ordered = 0;
  var offered = 0;
  var diff = 0;

  var reserveAskPrice = askReservePrices[_period];
  var reserveBidPrice = bidReservePrices[_period];
  var matchingPrice = matchingPriceMapping[_period];

  if (_type === 'PRODUCER') {
    // FALL 1: Reserve Ask Order issuer
    if (matchedAskReserveOrderMapping[_period] && matchedAskReserveOrderMapping[_period][user]) { // TODO
      // Smart Meter Daten werden vorerst gespeichert für die spätere Abrechnung in der endSettle Funktion
      var orderVolume = matchedAskReserveOrderMapping[_period][user].volume;
      // TODO iwas mit undefined?
      askReserveSmData[_period].push({user: user, smVolume: _volume, orderVolume: orderVolume});
      // Volumen was von den reserve Leute erzeugt wurde, weil nicht genug Strom im Netz war
      sumReserveProduced[_period] += _volume;
      // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
      //matchedAskReserveOrderMapping[_period][user] = undefined;

      // FALL 2: Normal Ask Order issuer
    } else if (matchedAskOrderMapping[_period] && matchedAskOrderMapping[_period][user]) {
      // die zuvor angebotene Menge an Strom
      offered = matchedAskOrderMapping[_period][user].volume;
      // user hat zu wenig Strom eingespeist
      if (_volume < offered) {
        // für den eingespeisten Strom bekommt er den matching preis bezahlt
        colleteral[user] += _volume * matchingPrice;
        // die Differenzt muss er nachkaufen für den teuren reserveAskPrice
        diff = offered - _volume;
        colleteral[user] -= (diff * reserveAskPrice);
        // rechnerisch ist nun -diff strom zu wenig im netz
        lack[_period] += diff;

        // user hat zu viel strom eingespeist
      } else if (_volume > offered) {
        // Für das Ordervolumen bekommt er den matchingpreis bezahlt
        colleteral[user] += offered * matchingPrice;
        // Für die Differenz bekommt er den niedrigen reserveBidPrice bezahlt
        diff = _volume - offered;
        colleteral[user] += diff * reserveBidPrice;
        // rechnerisch ist diff strom zu viel im Netz
        excess[_period] += diff;

        // user hat genau so viel strom eingepeist wie abgemacht
      } else {
        colleteral[user] += _volume * matchingPrice;
      }

      // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
      //matchedAskOrderMapping[_period][user] = undefined;

      // Volumen was von den normalen usern erzeugt wurde
      sumProduced[_period] += _volume;

      // FALL 3: No Order emitted
    } else {
      // track collaterial
      colleteral[user] += (_volume * reserveBidPrice);
      // track excess
      excess[_period] += _volume;
      // volumen was von den normalen usern erzeugt wurde
      sumProduced[_period] += _volume;
      // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
      //matchedAskOrderMapping[_period][user] = undefined;
    }
  }

  if (_type === 'CONSUMER') {
    // FALL 1: Reserve Bid Order issuer
    if (matchedBidReserveOrderMapping[_period] && matchedBidReserveOrderMapping[_period][user]) {
      console.log(1);
      // smart meter daten werden vorerst gespeichert für die spätere Abrechnung in der endSettle Funktion
      var orderVolume = matchedBidReserveOrderMapping[_period][user].volume;
      // process later
      bidReserveSmData[_period].push({user: user, smVolume: _volume, orderVolume: orderVolume});
      // Volumen was von den reserve Leute vom Netz genommen wurde, weil zu viel Strom vorhanden war
      sumReserveConsumed[_period] += _volume; // für test zwecke zwischen gepeichert
      // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
      //matchedBidReserveOrderMapping[_period][user] = undefined;

      // FALL 2: Bid Order issuer
    } else if (matchedBidOrderMapping[_period] && matchedBidOrderMapping[_period][user]) {
      ordered = matchedBidOrderMapping[_period][user].volume;
      // user hat zu viel Strom verbraucht
      if (_volume > ordered) {
        // das Ordervolumen kann noch zum matching price bezahlt werden
        colleteral[user] -= (ordered * matchingPrice);
        // die Differenz muss für den höheren reserveAskPrice bezahlt werden
        diff = _volume - ordered;
        colleteral[user] -= (diff * reserveAskPrice);
        // rechnerisch ist nun -diff Strom zu wenig im Netz
        lack[_period] += diff;

        // user hat zu wenig Strom verbraucht
      } else if (_volume < ordered) {
        // das Ordervolumen muss bezahlt werden für den matching price
        colleteral[user] -= (ordered * matchingPrice);
        // die differenz kann für den schlechten reserveBidPrice verkauft werden
        diff = ordered - _volume;
        colleteral[user] += (diff * reserveBidPrice);
        // recherisch ist nun +diff zu viel Strom im Netz
        excess[_period] += diff;

        // user hat genau so viel verbraucht wie zuvor vereinbart
      } else {
        colleteral[user] -= (_volume * matchingPrice);
      }
      // was die normalen user verbaucht haben
      sumConsumed[_period] += _volume;
      // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
      //matchedBidOrderMapping[_period][user] = undefined;

      // FALL 3: No Order emitted
    } else {
      // track collaterial
      colleteral[user] -= (_volume * reserveAskPrice);
      // track lack
      lack[_period] += _volume;
      // volumen was die normalen usern verbraucht haben
      sumConsumed[_period] += _volume;
      // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
      //matchedBidOrderMapping[_period][user] = undefined;
    }
  }

  // increment settle counter
  settleCounter[_period] += 1;
  // set user as settled for period
  alreadySettled[_period][user] = 1;

  // todo: endSettle Funktion muss beim Eingang des letzten smart meter datensatzes automatisch ausgeführt werden
  if (settleCounter[_period] === numberOfUsers) {
    endSettle(_period);
  }

  return true;
}

function endSettle(_period) {

  var diff = excess[_period] - lack[_period];

  if (Math.round(Math.abs(sumConsumed[_period] - sumProduced[_period])) != Math.round(Math.abs(excess[_period] - lack[_period]))) {
    console.warn('Phsikalische Differenz entspricht nicht der Rechnerischen');
    debugger;
  }

  // TODO: zuerst die reserve numberOfUsers in askReseverSmData mit dem besten Preis abrechnen
  if (diff >= 0) {
    for (var i in bidReserveSmData[_period]) {
      if (bidReserveSmData[_period][i]) {
        var smVolume = bidReserveSmData[_period][i].smVolume;
        if (smVolume == 0) continue;
        var user = bidReserveSmData[_period][i].user;
        if (smVolume <= diff) {
          colleteral[user] -= smVolume * bidReservePrices[_period];
          diff -= smVolume;
        } else { // else if (smVolume > diff)
          colleteral[user] -= diff * bidReservePrices[_period];
          colleteral[user] -= (smVolume - diff) * askReservePrices[_period];
          diff = 0;
        }
      }
    }
  }

  if (diff <= 0) {
    diff = Math.abs(diff);
    for (var i in askReserveSmData[_period]) {
      if (askReserveSmData[_period] && askReserveSmData[_period][i]) {
        var smVolume = askReserveSmData[_period][i].smVolume;
        if (smVolume == 0) continue;
        var user = askReserveSmData[_period][i].user;
        if (smVolume <= diff) {
          colleteral[user] += smVolume * askReservePrices[_period];
          diff -= smVolume;
        } else {
          colleteral[user] += diff * askReservePrices[_period];
          colleteral[user] += (smVolume - diff) * bidReservePrices[_period];
          diff = 0;
        }
      }
    }
  }

  // for debugging purposes
  var moneyLeft = getSumOfColleteral();
  if (moneyLeft > 0.01) {
    console.warn('Users have earned more money then they have spent - shouldn\'t be like this ...');
    debugger;
  }

  // TODO: statt alle zu entlohnen, nur die welche in der letzten Periode mitgemacht haben
  var shareOfEachUser = Math.abs(moneyLeft / _.keys(colleteral).length);
  for (user in colleteral) {
    colleteral[user] += shareOfEachUser;
  }

  // for debugging purposes
  var sum = getSumOfColleteral();
  if (!(sum == 0 || (sum < 0.01 && sum > -0.01))) {
    debugger;
  }

  owner = 1;
}

// getters
function getMatchedAskOrders() {
  var matches = [];
  for (var period in matchedAskOrderMapping) {
    for (var owner in matchedAskOrderMapping[period]) {
      matches.push({'period': period, 'owner': owner, 'volume': matchedAskOrderMapping[period][owner].volume});
    }
  }
  return matches;
}

function getMatchedBidOrders() {
  var matches = [];
  for (var period in matchedBidOrderMapping) {
    for (var owner in matchedBidOrderMapping[period]) {
      matches.push({'period': period, 'owner': owner, 'volume': matchedBidOrderMapping[period][owner].volume});
    }
  }
  return matches;
}

function getBidOrders() {
  var id_iter_bid = maxBid;
  var bidOrders = [];
  while (id_iter_bid != 0) {
    bidOrders.push(idToOrder[id_iter_bid]);
    id_iter_bid = idToOrder[id_iter_bid].next;
  }
  return bidOrders;
}

function getAskOrders() {
  var iter_ask_id = minAsk;
  var askOrders = [];
  while (iter_ask_id != 0) {
    askOrders.push(idToOrder[iter_ask_id]);
    iter_ask_id = idToOrder[iter_ask_id].next;
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

var numberOfUsers;
var owner = 1;

function runtests(_numberOfUsers, _period) {
  numberOfUsers = _numberOfUsers;
  //testMatch(_numberOfUsers);
  //testPerfectSettle(_numberOfUsers, _period);
  //testRandomSettle(_numberOfUsers, _period);
  settleTest(_numberOfUsers, _period);
}

runtests(40, 1);

// function testMatch(_numberOfUsers) {
//   console.groupCollapsed('Matching Test');

//   submitRandomAskOrders(_numberOfUsers / 4);
//   submitRandomBidOrders(_numberOfUsers / 4);
//   printAskOrders();
//   printBidOrders();
//   match();sett

//   var sum = getSumOfEnergy();

//   assert((sum == 0 || (sum < 0.001 && sum > -0.001)), 'matched ask and bid order volumes should be the same');
//   console.groupEnd();
//   printMatchedAskOrders();
//   printMatchedBidOrders();
//   printMatchingResult();
//   submitRandomAskReserveOrders(_numberOfUsers / 4);
//   submitRandomBidReserveOrders(_numberOfUsers / 4);
//   printAskOrders();
//   printBidOrders();
//   determineReserveAskPrice();
//   determineReserveBidPrice();
//   printReserveOrderMatchingResult();
//   randomSettle(_numberOfUsers);
// }

function testPerfectSettle(_numberOfUsers, _period) {
  console.log('Perfect Settlement Test');
  beforeSettle(_numberOfUsers, _period);
  perfectSettle(_numberOfUsers, _period);
  var sum = getSumOfColleteral();
  assert((sum == 0 || (sum < 0.01 && sum > -0.01)), 'the cumulative sum in the colleteral mapping should be zero, when numberOfUsers stick perfectly to their orders');
}

function testRandomSettle(_numberOfUsers, _period) {
  console.log('Random Settlement Test');
  beforeSettle(_numberOfUsers, _period);
  randomSettle(_numberOfUsers, _period);
  checkEnergyBalance(_period);
  var sum = getSumOfColleteral();
  assert((sum == 0 || (sum < 0.01 && sum > -0.01)), 'the cumulative sum in the colleteral mapping should be zero, when numberOfUsers stick perfectly to their orders');
}

// ########################################################################
// #################################### test helper functions
// ########################################################################

// unique owner id for each submitted order

// for (var i=1; i<101; i++) {
//   runtests(40, i);
// }

// perfect settle, all bidOrders/askOrders match _volume == ordered and _volume == offered
function settleTest(_numberOfUsers, _period) {
  assert(_numberOfUsers % 4 === 0);
  var priceMultiplier = 100;
  var volumeMultiplier = 100;
  var owner = 1;
  for (var i = 0; i < _numberOfUsers / 4; i++) {
    if (saveOrder('BID', i * volumeMultiplier, owner, i * priceMultiplier)) {
      owner++;
    }
  }
  for (var i = 0; i < _numberOfUsers / 4; i++) {
    if (saveOrder('ASK', i * volumeMultiplier, owner, i * priceMultiplier)) {
      owner++;
    }
  }
  printAskOrders();
  printBidOrders();
  var bidOrders = getBidOrders();
  var askOrders = getAskOrders();
  nextState();
  printMatchedAskOrders();
  printMatchedBidOrders();
  printMatchingResult();
  saveOrder('BID', 1, owner++, 1);
  saveOrder('ASK', 1, owner++, 1);
  nextState();
  assert.equal(700, bidReservePrices[_period]);
  assert.equal(700, askReservePrices[_period]);
  printReserveOrderMatchingResult();

  owner = 1;
  var matchedAskOrders = getMatchedAskOrders();
  var sumProducedTmp = 0;
  for (var i = 0; i < matchedAskOrders.length; i++) {
    settle(matchedAskOrders[i].owner, 'PRODUCER', matchedAskOrders[i].volume, _period);
    assert.equal(colleteral[matchedAskOrders[i].owner], matchedAskOrders[i].volume * matchingPriceMapping[_period]);
    sumProducedTmp += matchedAskOrders[i].volume;
  }
  assert.equal(sumProduced[_period], sumProducedTmp);

  var matchedBidOrders = getMatchedBidOrders();
  var sumConsumedTmp = 0;
  for (var i = 0; i < matchedBidOrders.length; i++) {
    settle(matchedBidOrders[i].owner, 'CONSUMER', matchedBidOrders[i].volume, _period);
    assert.equal(colleteral[matchedBidOrders[i].owner], -matchedBidOrders[i].volume * matchingPriceMapping[_period]);
    sumConsumedTmp += matchedBidOrders[i].volume;
  }
  assert.equal(sumConsumed[_period], sumConsumedTmp);
  assert.equal(excess[_period], 0);
  assert.equal(lack[_period], 0);

  var sum = getSumOfColleteral();
  assert(Math.abs(sum) < 0.0000000001);
  var balance = getEnergyBalance(_period);
  assert.equal(balance, 0);
}

// perfect settle, all askOrders match _volume == offered, but _volume < ordered
function settleTest2(_numberOfUsers, _period) {
  assert(_numberOfUsers % 4 === 0);
  var priceMultiplier = 100;
  var volumeMultiplier = 100;
  var owner = 1;
  for (var i = 0; i < _numberOfUsers / 4; i++) {
    if (saveOrder('BID', i * volumeMultiplier, owner, i * priceMultiplier)) {
      owner++;
    }
  }
  for (var i = 0; i < _numberOfUsers / 4; i++) {
    if (saveOrder('ASK', i * volumeMultiplier, owner, i * priceMultiplier)) {
      owner++;
    }
  }
  printAskOrders();
  printBidOrders();
  var bidOrders = getBidOrders();
  var askOrders = getAskOrders();
  nextState();
  printMatchedAskOrders();
  printMatchedBidOrders();
  printMatchingResult();
  saveOrder('BID', 700, owner++, 700);
  saveOrder('ASK', 700, owner++, 700);
  saveOrder('ASK', 1000, owner++, 1000);
  nextState();
  printReserveOrderMatchingResult();
  assert.equal(700, bidReservePrices[_period]);
  assert.equal(1000, askReservePrices[_period]);

  owner = 1;
  var matchedAskOrders = getMatchedAskOrders();
  var sumProducedTmp = 0;
  for (var i = 0; i < matchedAskOrders.length; i++) {
    settle(matchedAskOrders[i].owner, 'PRODUCER', matchedAskOrders[i].volume, _period);
    assert.equal(colleteral[matchedAskOrders[i].owner], matchedAskOrders[i].volume * matchingPriceMapping[_period]);
    sumProducedTmp += matchedAskOrders[i].volume;
  }
  assert.equal(sumProduced[_period], sumProducedTmp);

  var matchedBidOrders = getMatchedBidOrders();
  var sumConsumedTmp = 0;
  var excessTmp = 0;
  var diff = 100;
  for (var i = 0; i < matchedBidOrders.length; i++) {
    settle(matchedBidOrders[i].owner, 'CONSUMER', matchedBidOrders[i].volume - diff, _period);
    var vol = matchedBidOrders[i].volume - diff;
    var coll = -(vol * matchingPriceMapping[_period]) + (diff * bidReservePrices[_period]);
    assert.equal(colleteral[matchedBidOrders[i].owner], coll);
    sumConsumedTmp += vol;
    excessTmp += diff;
  }
  assert.equal(sumConsumed[_period], sumConsumedTmp);
  assert.equal(excess[_period], matchedBidOrders.length * diff);
  assert.equal(lack[_period], 0);

  var sum = getSumOfColleteral();
  assert(Math.abs(sum) < 0.0000000001);
  var balance = getEnergyBalance(_period);
  assert.equal(balance, 0);
}

function beforeSettle(_numberOfUsers, _period) {
  submitRandomAskOrders(_numberOfUsers / 4);
  submitRandomBidOrders(_numberOfUsers / 4);
  printAskOrders();
  printBidOrders();
  nextState();
  printMatchedAskOrders();
  printMatchedBidOrders();
  printMatchingResult();
  submitRandomAskReserveOrders(_numberOfUsers / 4);
  submitRandomBidReserveOrders(_numberOfUsers / 4);
  printAskOrders();
  printBidOrders();
  nextState();
  printReserveOrderMatchingResult();
}

// settlement mit Erzeugungs- und Verbrauchsdaten, welche den zuvor abgegebenen order volumes entsprechen. Es kommt nicht zu einem Ungleichgewicht und die Reserve Users mÃ¼ssen nicht eingreifen
function perfectSettle(_numberOfUsers, _period) {
  for (var user in matchedBidOrderMapping[_period]) {
    settle(user, 'CONSUMER', matchedBidOrderMapping[_period][user].volume, _period);
  }
  for (user in matchedAskOrderMapping[_period]) {
    settle(user, 'PRODUCER', matchedAskOrderMapping[_period][user].volume, _period);
  }
  for (var user = 1; user <= _numberOfUsers; user++) {
    if (!settle(user, 'PRODUCER', 0, _period)) {
      settle(user, 'CONSUMER', 0, _period);
    }
  }
}

// settlement mit zufÃ¤lligen Erzeugungs- und Verbrauchsdaten. Es kommt zu einem Ungleichgewicht und die Reserve numberOfUsers mÃ¼ssen jenes Ungleichgewicht regulieren.
function randomSettle(_numberOfUsers, _period) {

  var sumConsumed = 0;
  var sumProduced = 0;
  var sumBidReserve = 0;
  var sumAskReserve = 0;

  for (var user in matchedBidOrderMapping[_period]) {
    var vol = Math.floor(Math.random() * 10) + 1;
    var isSettled = settle(user, 'CONSUMER', vol, _period);
    if (isSettled) {
      sumConsumed += vol;
    }
  }

  for (var user in matchedAskOrderMapping[_period]) {
    var vol = Math.floor(Math.random() * 10) + 1;
    var isSettled = settle(user, 'PRODUCER', vol, _period);
    if (isSettled) {
      sumProduced += vol;
    }
  }

  if (sumProduced != sumConsumed) {
    if (sumProduced > sumConsumed) {
      var diff = sumProduced - sumConsumed;
      for (var user in matchedBidReserveOrderMapping[_period]) {
        if (matchedBidReserveOrderMapping[_period][user].volume < diff) {
          settle(user, 'CONSUMER', matchedBidReserveOrderMapping[_period][user].volume, _period);
          if (isSettled) {
            diff -= matchedBidReserveOrderMapping[_period][user].volume;
            sumBidReserve += matchedBidReserveOrderMapping[_period][user].volume;
          }
        } else {
          var isSettled = settle(user, 'CONSUMER', diff, _period);
          if (isSettled) {
            sumBidReserve += diff;
            break;
          }
        }
      }
    } else {
      var diff = sumConsumed - sumProduced;
      for (var user in matchedAskReserveOrderMapping[_period]) {
        if (matchedAskReserveOrderMapping[_period][user].volume < diff) {
          var isSettled = settle(user, 'PRODUCER', matchedAskReserveOrderMapping[_period][user].volume, _period);
          if (isSettled) {
            diff -= matchedAskReserveOrderMapping[_period][user].volume;
            sumAskReserve += matchedAskReserveOrderMapping[_period][user].volume;
          }
        } else {
          var isSettled = settle(user, 'PRODUCER', diff, _period);
          if (isSettled) {
            sumAskReserve += diff;
            break;
          }
        }
      }
    }
  }

  for (var user = 1; user <= _numberOfUsers; user++) {

    if (!settle(user, 'PRODUCER', 0, _period)) {
      settle(user, 'CONSUMER', 0, _period);
    }
  }

  //reserveAsks = [];
  //reserveBids = [];
}

// verkaufen hohe volumina für einen höheren preis
function submitRandomAskReserveOrders(_numberOfUsers) {
  for (var i = 0; i < _numberOfUsers; i++) {
    var volume = Math.floor(Math.random() * 299) + 1;
    var price = Math.floor(Math.random() * 199) + 1;
    if (saveOrder('ASK', volume, owner, price)) {
      //reserveAsks.push({owner: owner, volume: volume});
      owner++;
      //numberOfRegisteredUsers++;
    }
  }
}

// kaufen hohe volumina für einen niedrigeren preis
function submitRandomBidReserveOrders(_numberOfUsers) {
  for (var i = 0; i < _numberOfUsers; i++) {
    var volume = Math.floor(Math.random() * 300) + 1;
    var price = Math.floor(Math.random() * 49) + 1;
    if (saveOrder('BID', volume, owner, price)) {
      //reserveBids.push({owner: owner, volume: volume});
      owner++;
      //numberOfRegisteredUsers++;
    }
  }
}

function submitRandomAskOrders(_numberOfUsers) {
  for (var i = 0; i < _numberOfUsers; i++) {
    var volume = Math.floor(Math.random() * 20) + 1;
    var price = Math.floor(Math.random() * 99) + 1;
    if (saveOrder('ASK', volume, owner, price)) {
      owner++;
      //numberOfRegisteredUsers++;
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
      price = 9999;
    }
    if (saveOrder('BID', volume, owner, price)) {
      owner++;
      //numberOfRegisteredUsers++;
    }
  }
}

// todo wieder auskommentieren
// function assert(condition, message) {
//   if (!condition) {
//     message = message || 'Assertion failed';
//     if (typeof Error !== 'undefined') {
//       console.warn('cumulative colleteral is not zero');
//       debugger;
//       throw new Error(message);
//     }
//     throw message; // Fallback
//   } else {
//     console.log('%c' + message, 'color:green');
//   }
// }

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

function getEnergyBalance(_period) {
  console.log(sumConsumed[_period]);
  console.log(sumReserveConsumed[_period]);
  console.log(sumProduced[_period]);
  console.log(sumReserveProduced[_period]);
  return (sumConsumed[_period] + sumReserveConsumed[_period]) - (sumProduced[_period] + sumReserveProduced[_period]);
}

function checkEnergyBalance(_period) {
  var sum = getEnergyBalance(_period);
  if (!(sum < 0.001 && sum > -0.001)) {
    debugger;
    console.warn('Consumed Energy is not equal to produced Energy');
  } else {
    console.log('%c' + 'Consumed Energy is equal to produced Energy', 'color:green');
  }
}

// ########################################################################
// #################################### print funtions
// ########################################################################

function printAskOrders() {
  var askOrderBook = getAskOrders();
  console.log('\nASK ORDERBOOK\n\n');
  for (var i in askOrderBook) {
    console.log('Price: ' + askOrderBook[i].price + ' | Volume: ' + askOrderBook[i].volume + ' | Owner: ' + askOrderBook[i].owner);
  }
}

function printBidOrders() {
  var bidOrderBook = getBidOrders();
  console.log('\nBID ORDERBOOK\n\n');
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
  console.log('\nMatched ASK ORDERBOOK\n\n');
  for (var i in matches) {
    console.log('Period: ', matches[i].period, ' | Owner: ', matches[i].owner, ' | OfferedVol: ', matches[i].volume);
  }
}

function printMatchedBidOrders() {
  var matches = getMatchedBidOrders();
  console.log('\nMatched BID ORDERBOOK\n\n');
  for (var i in matches) {
    console.log('Period: ', matches[i].period, ' | Owner: ', matches[i].owner, ' | OrderedVol: ', matches[i].volume);
  }
}

function printReserveOrderMatchingResult() {
  console.log('\n######################################');
  console.log('####### Reserve BID Matching Result ######');
  console.log('######################################');
  console.log('\nReserve Price: ' + bidReservePrices[period - 1] + ' | Volume (>1000): ' + cumBidReserveVol);
  console.log('\n######################################');

  console.log('\n\n\nn######################################');
  console.log('####### Reserve ASK Matching Result ######');
  console.log('######################################');
  console.log('\nReserve Price: ' + askReservePrices[period - 1] + ' | Volume (>1000): ' + cumAskReserveVol);
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
