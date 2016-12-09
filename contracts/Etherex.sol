pragma solidity ^0.4.2;
/*   
 TODOS:

Modifiers for time dependant operations.
Communication with smart meter.
The order of the functions has to be determined.

*/
contract Etherex {

    struct Order {
        uint256 id;
        uint256 next;
        address owner;
        uint256 volume;
        int256 price;
    }

    struct Match {
        uint256 orderId;
        uint256 volume;
    }

    uint256 RESERVE_PRODUCER_MIN_VOL = 100000;

    bool DEBUG = true;

    //Balance for consumed energy that was not bought through orders
    //if the balance is below 0, then send event that turns of energy
    mapping(address => uint256) public collateral;

    // each smart meter has a user attached
    mapping(address => address) smartMeterToUser;

    // 1: CA, 2: smart meter
    mapping(address => uint8) identities;

    // maps order id to order objects
    Order[] orders;

    uint256 public minAsk = 0;
    uint256 public maxBid = 0;

    // flex bids
    Order[] flexBids;
    uint256 flexBidVolume = 0;
    //Additional array for flex bids, more optimal

    // stores matching results    
    mapping(uint256 => mapping(address => uint256)) matchedAskOrders;
    mapping(uint256 => mapping(address => uint256)) matchedBidOrders;
    mapping(uint256 => int256) matchingPrices;
    uint256[] currMatchedAskOrderMapping;
    uint256[] currMatchedBidOrderMapping;

    // flag when matching done
    bool isMatchingDone = false;
            
    uint256 idCounter;

    uint8 currState;

    uint256 startBlock;

    // constructor
    function Etherex(address _certificateAuthority) {
        identities[_certificateAuthority] = 1;
        currState = 0;
        reset();
    }

    // reset
    function reset() {
        startBlock = block.number;
        isMatchingDone = false;
        delete orders;
        // insert blanko order into orders because idx=0 is a placeholder
        Order memory blank_order = Order(0, 0, 0, 0, 0);
        orders.push(blank_order);
        delete flexBids;
        idCounter = 1;
        minAsk = 0;
        maxBid = 0;
    }

    // register Functions
    function registerCertificateAuthority(address _ca) {
        identities[_ca] = 1;
    }

    function registerSmartMeter(address _sm, address _user) onlyCertificateAuthorities() {
        identities[_sm] = 2;
        identities[_user] = 3;
        smartMeterToUser[_sm] = _user; 
    }

    // modifiers
    modifier onlyCertificateAuthorities() {
        if (identities[msg.sender] != 1) throw;
        _;
    }
    modifier onlySmartMeters() {
        if (identities[msg.sender] != 2) throw;
        _;
    }
    modifier onlyUsers() {
        if (identities[msg.sender] == 0) throw;
        _;
    }
    modifier onlyInState(uint8 _state) {
        updateState();
        if(_state != currState && !DEBUG) throw;
        _;
    }
    modifier onlyReserveUsers(uint256 _volume) {
        if (_volume <  RESERVE_PRODUCER_MIN_VOL) throw;
        _;
    }

    /*
    Wird bei jeder eingehenden Order ausgeführt. 
    Annahme: Es wird mindestens eine Order alle 12 Sekunden eingereicht.  
    inStateZero: Normale Orders können abgegeben werden. Dauer von -1/3*t bis +1/3*t (hier t=15)
    inStateOne: Nachdem normale orders gematched wurden, können ask orders für die Reserve abgeben werden. Dauer von 1/3*t bis 2/3*t (hier t=15).
    State 0: Normale Orders abgeben (initial: reserve price bestimmen)
    State 1: Reserve Orders (initial: matching)
    */
    function updateState() internal {
        if (inStateZero() && currState != 0) {
            currState = 0;    
            determineReserveAskPrice();
        } else if (inStateOne() && currState != 1) {
            currState = 1;
            matching();
        // Zyklus beginnt von vorne
        } else {
            reset();
        }             
    }
 
    function inStateZero() internal returns (bool rv) {
        if (block.number < (startBlock + 50)) {
            return true;
        }
        return false;
    }

    function inStateOne() internal returns (bool rv) {
        if (block.number >= (startBlock + 50) && block.number < (startBlock + 75)) {
            return true;
        }
        return false;
    }
        
    // todo(mg): prüfen ob ausreichend ether mitgeschickt wurde
    function submitBid(int256 _price, uint256 _volume) onlyUsers(){
        save_order("BID", _price, _volume);
    }

    // calculate min ask to satisfy flexible bids on the way?
    function submitAsk(int256 _price, uint256 _volume) onlySmartMeters() {
        save_order("ASK", _price, _volume);
    } 
    
    // producer can submit ask if he is able to supply two times the average needed volume of
    // electricity
    function submitReserveAsk(int256 _price, uint256 _volume) /*nlyInState(1) */ onlyUsers() onlyReserveUsers(_volume) {
        save_order("ASK", _price, _volume);
    }

    function submitReserveBid(int256 _price, uint256 _volume) /*onlyInState(1) */ onlyUsers() onlyReserveUsers(_volume) {
        save_order("BID", _price, _volume);
    }

    // put flex bid in separate flex bid pool
    // Todo(ms): set all variables, not only volume (bad practise)
    function submitFlexBid(uint256 _volume) {
        Order memory bid;
        bid.volume = _volume;
        flexBidVolume += _volume;
        flexBids.push(bid);
    }

    // process order saving
    function save_order(bytes32 _type, int256 _price, uint256 _volume) internal {
        // allocate new order
        Order memory curr_order = Order(idCounter++, 0, msg.sender, _volume, _price);

        // temporär wird hier der order struct maxBid oder minAsk abgelegt.
        uint256 best_order;

        // dient der Invertierung vom Vergleichszeichen um aufsteigende und absteigende Reihenfolge in einer Funktion zu realisieren.
        int8 ascending = 0;

        if (_type == "ASK") {
            best_order = minAsk;
            ascending = 1;  
        } else if (_type == "BID") {
            best_order = maxBid;
            ascending = -1;
        } else {
            throw;
        }

        // save and return if this the first bid
        if (best_order == 0) {
            orders.push(curr_order);
            best_order = curr_order.id;
            
        } else {
            // iterate over list till same price encountered
            uint256 curr = best_order;
            uint256 prev = 0;
            while ((ascending * curr_order.price) > (ascending * orders[curr].price) && curr != 0) {
                prev = curr;
                curr = orders[curr].next;
            }

            // update pointer 
            curr_order.next = curr;
    
            // insert order
            orders.push(curr_order);
    
            // curr_order added at the end
            if (curr_order.next == best_order) {
                best_order = curr_order.id;
                
            // at least one prev order exists
            } else {
                orders[prev].next = curr_order.id;
            }
        }
        
        // best orders werden im storage geupdated
        if (_type == "ASK") {
            minAsk = best_order;      
        } else if (_type == "BID") {
            maxBid = best_order;        
        }
    }

    // match bid and ask orders
    function matching() {
        if (orders.length == 1) {
            reset();
            return;
        }

        uint256 cumAskVol = 0;
        uint256 cumBidVol = 0;

        int256 matchingPrice = orders[minAsk].price;
        bool isMatched = false;
        bool outOfAskOrders = false;

        uint256 currAsk = minAsk;
        uint256 currBid = maxBid;
        currentPeriod++;

        uint256 next;
        uint256 share;

        delete currMatchedAskOrderMapping;
        delete currMatchedBidOrderMapping;

        while (!isMatched) {
            // cumulates ask volume for fixed price level
            // Todo(ms): Optimize: Precompute cumulated volume for orders with same same price,
            // then use here instead of iterating over it
            while (currAsk != 0 && orders[currAsk].price == matchingPrice) {
                cumAskVol += orders[currAsk].volume;
                currMatchedAskOrderMapping.push(orders[currAsk].id);
                next = orders[currAsk].next;
                if (next != 0) {
                    currAsk = next;
                } else {
                    outOfAskOrders = true;
                    break;
                }
            }

            // cumulates ask volume for order price greater then or equal to matching price
            // Todo(ms): Optimize: Precompute cumulated volume for orders with same same price,
            // then use here instead of iterating over it
            while (orders[currBid].price >= matchingPrice) {
                cumBidVol += orders[currBid].volume;
                currMatchedBidOrderMapping.push(orders[currBid].id);
                currBid = orders[currBid].next;
                if (currBid == 0) {
                    break;
                }
            }

            if (cumAskVol >= cumBidVol || outOfAskOrders) {
                isMatched = true;
            } else {
                matchingPrice = orders[currAsk].price;
                currBid = maxBid;
                cumBidVol = 0;
                // Todo(ms): do not delete, just traverse in reverse order and reuse existing array
                delete currMatchedBidOrderMapping;
            }
        }

        // calculates how much volume each producer can release into 
        // the grid within the next interval
        if (cumBidVol < cumAskVol) {
            // todo(ms): solidity doesnt support floating data types, check what happens here
            share = cumBidVol / cumAskVol;
            for (uint256 i=0; i<currMatchedAskOrderMapping.length; i++) {
                matchedAskOrders[currentPeriod][orders[currMatchedAskOrderMapping[i]].owner] 
                = orders[currMatchedAskOrderMapping[i]].volume * share;
            }
        } else {
            share = cumAskVol / cumBidVol;
            for (uint256 j=0; j<currMatchedBidOrderMapping.length; j++) {
                matchedBidOrders[currentPeriod][orders[currMatchedBidOrderMapping[j]].owner] 
                = orders[currMatchedBidOrderMapping[j]].volume * share;
            }
        }

        matchingPrices[currentPeriod] = matchingPrice;
    }

    uint256 MIN_RESERVE_VOLUME = 1000;  // todo: statt konstantem wert, durchschnittliches maximum eines Haushaltes iterativ berechnen und das produkt mit #haushalte als MIN_RESERVE_VOLUME setzen

    mapping (uint256 => mapping (address =>  uint256)) public matchedAskReserveOrders;   // maps volume to currentPeriod and owner
    mapping (uint256 => mapping (address =>  uint256)) public matchedBidReserveOrders;   // maps volume to currentPeriod and owner
    mapping (uint256 => int256) public askReservePrices;                        // maps reserveprice to currentPeriod
    mapping (uint256 => int256) public bidReservePrices;

       function determineReserveBidPrice() returns (int256) {
        uint256 cumBidReserveVol = 0;
        int256 reserveBidPrice = orders[maxBid].price;
        bool isFound = false;
        uint256 bidIterId = maxBid;

        while(!isFound) {
            while(orders[bidIterId].price == reserveBidPrice) {
                uint256 volume = orders[bidIterId].volume;
                address owner = orders[bidIterId].owner;

                cumBidReserveVol += volume;
                matchedBidReserveOrders[currentPeriod][owner] = volume;

                uint256 nextOrder = orders[bidIterId].next;

                if(nextOrder != 0) {
                    bidIterId = nextOrder;
                } else {
                    isFound = true;
                    break;
                }

            }

            if(cumBidReserveVol >= MIN_RESERVE_VOLUME) {
                isFound = true;
            } else {
                reserveBidPrice = orders[bidIterId].price;
            }
        }

        bidReservePrices[currentPeriod] = reserveBidPrice;

        return reserveBidPrice;

    }


    //TODO Magnus time controlled
    function determineReserveAskPrice() returns (int256) {
        uint256 cumAskReserveVol = 0;
        int256 reserve_price = orders[minAsk].price;
        bool isFound = false;
        uint256 ask_id_iter = minAsk;

        while(!isFound) {
            while(orders[ask_id_iter].price == reserve_price){
                uint256 volume = orders[ask_id_iter].volume;     // redundant, aber übersichtlicher
                address owner = orders[ask_id_iter].owner;

                cumAskReserveVol += volume;
                matchedAskReserveOrders[currentPeriod][owner] = volume;

                uint256 next_order = orders[ask_id_iter].next;
                if (next_order != 0){
                    ask_id_iter = next_order;
                } else {
                    isFound=true;
                    break;     // Mindestmenge an Energie konnten nicht erreicht werden, da selbst beim höchsten Preis nicht ausreichen Energie vorhanden war
                }
            }

            if (cumAskReserveVol >= MIN_RESERVE_VOLUME) {
              isFound = true;
            } else {
              reserve_price = orders[ask_id_iter].price;
            }        
        }
        // orders löschen? 

        askReservePrices[currentPeriod] = reserve_price;

        return reserve_price;

    }

    // Todo
    // anhand der blocknumber bestimmen in welcher currentPeriode man gerade ist 
    function updatecurrentPeriod(){

    }

    function test() {
        settleMapping[1].askSmData.push(SettleUserData(1,1,1));
        debugEvent(settleMapping[1].askSmData[0].user,settleMapping[1].askSmData[0].smVolume,settleMapping[1].askSmData[0].orderedVolume);
    }
 
    event debugEvent(address user,  uint256 volume, uint256 orderedVolume);
    
    // Variables for settle function
    uint256 currentPeriod = 0;
 

    struct SettleUserData {
        address user;
        uint256 smVolume;
        uint256 orderedVolume;
    }


    struct settleData{
        bool isFirstSettle;
        mapping(address => bool) alreadySettled;
        uint256 settleCounter;
        uint256 sumProduced;
        uint256 sumConsumed;
        uint256 excess;
        uint256 lack;
        SettleUserData[] askSmData;
        SettleUserData[] bidSmData;
    }

   
    mapping(uint256 => settleData) public settleMapping;
    mapping(address => int256) colleteral;

    // todo: needs to be set at some point
    uint256 numberOfUsers = 0;
    
    // Settlement function called by smart meter
    // _type=1 for Consumer and _type=2 for Producer
    function settle(address _user,int8 _type,uint256 _volume,uint256 _period) onlySmartMeters() {

    if (_user == 0) {
        throw;
    }
    if (_type == 0) {
        throw;
    }
    if (_period == 0) {
        throw;
    }
    if (_volume == 0) {
        throw;
    }

    // currentPeriod needs to be greater than the _period that should be settled 
    if (!(currentPeriod > _period)) {
        throw;    
    }
    // smart meter has already sent data for this particular user
    if (settleMapping[_period].alreadySettled[_user]){
        throw;
    }

    uint256 ordered = 0;
    uint256 offered = 0;
    uint256 diff = 0;

    //  producer
    if (_type == 2) {
        // case 1: reserve ask guy
        if (matchedAskReserveOrders[_period][_user] != 0){          // TODO: matchedReserveOrders needs to be splitted in matchedAskReserveOrders and matchedBidReserveOrders
            // Smart Meter Daten werden vorerst gespeichert für die spätere Abrechnung in der endSettle Funktion
            offered = matchedAskReserveOrders[_period][_user];
            settleMapping[_period].askSmData.push(SettleUserData(_user,_volume,offered));
            settleMapping[_period].sumProduced += _volume; 

        // case 2: normal ask order guy
        } else if (matchedAskOrders[_period][_user] != 0){
            offered = matchedAskOrders[_period][_user];
             // _user hat zu wenig Strom eingespeist
            if (_volume < offered) {
                  // für den eingespeisten Strom bekommt er den matching preis bezahlt
                colleteral[_user] += int256(_volume) * matchingPrices[_period];
                // die Differenzt muss er nachkaufen für den teuren reserveAskPrice
                diff = offered - _volume;
                colleteral[_user] -= (int256(diff) * askReservePrices[_period]);
                // rechnerisch ist nun -diff strom zu wenig im netz
                settleMapping[_period].lack += diff;   
            } else if (_volume > offered) {
                // Für das Ordervolumen bekommt er den matchingpreis bezahlt
                colleteral[_user] += int256(offered) * matchingPrices[_period];
                // Für die Differenz bekommt er den niedrigen reserveBidPrice bezahlt
                diff = _volume - offered;
                colleteral[_user] += int256(diff) * bidReservePrices[_period];
                // rechnerisch ist diff strom zu viel im Netz
                settleMapping[_period].excess += diff;

                // _user hat genau so viel strom eingepeist wie abgemacht
            } else {
                colleteral[_user] += int256(_volume) * matchingPrices[_period];
            }
            // wird auf undefined gesetzt damit selbiger _user nicht nochmals settlen kann
            // matchedAskOrderMapping[_period][_user] = undefined;

            // Volumen was von den normalen _usern erzeugt wurde
            settleMapping[_period].sumProduced += _volume;
   
        // case 3: no order emitted
        } else {
            // track collaterial
            colleteral[_user] += int256(_volume) * bidReservePrices[_period];
            // track excess
            settleMapping[_period].excess += _volume;
            // volumen was von den normalen _usern erzeugt wurde
            settleMapping[_period].sumProduced += _volume;
            // wird auf undefined gesetzt damit selbiger _user nicht nochmals settlen kann
            //matchedAskOrderMapping[_period][_user] = undefined;
        }
    }

    // consumer
    if (_type == 1) {
        // case 1: reserve bid guy
        if (matchedBidReserveOrders[_period][_user] != 0) {
            // smart meter daten werden vorerst gespeichert für die spätere Abrechnung in der endSettle Funktion
            ordered = matchedBidReserveOrders[_period][_user];
            // process later
            settleMapping[_period].bidSmData.push(SettleUserData(_user,_volume,ordered));
            // Volumen was von den reserve Leute vom Netz genommen wurde, weil zu viel Strom vorhanden war
            settleMapping[_period].sumConsumed += _volume; 
            // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
            //matchedBidReserveOrderMapping[_period][user] = undefined;

        // case 2: normal bid order guy 
        } else if (matchedBidOrders[_period][_user] != 0) {
            ordered = matchedBidOrders[_period][_user];
            // user hat zu viel Strom verbraucht
            if (_volume > ordered) {
                // das Ordervolumen kann noch zum matching price bezahlt werden
                colleteral[_user] -= int256(ordered) * matchingPrices[_period];
                // die Differenz muss für den höheren reserveAskPrice bezahlt werden
                diff = _volume - ordered;
                colleteral[_user] -= (int256(diff) * askReservePrices[_period]);
                // rechnerisch ist nun -diff Strom zu wenig im Netz
                settleMapping[_period].lack += diff;   

                // user hat zu wenig Strom verbraucht
            } else if (_volume < ordered) {
                // das Ordervolumen muss bezahlt werden für den matching price
                colleteral[_user] -= (int256(ordered) * matchingPrices[_period]);
                // die differenz kann für den schlechten reserveBidPrice verkauft werden
                diff = ordered - _volume;
                colleteral[_user] += (int256(diff) * bidReservePrices[_period]);
                // recherisch ist nun +diff zu viel Strom im Netz
                settleMapping[_period].excess += diff;

                // user hat genau so viel verbraucht wie zuvor vereinbart
            } else {
                colleteral[_user] -= (int256(_volume) * matchingPrices[_period]);
            }
            // was die normalen user verbaucht haben
            settleMapping[_period].sumConsumed += _volume;
            // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
            //matchedBidOrderMapping[_period][user] = undefined;

            // FALL 3: No Order emitted
        } else {
            // track collaterial
            colleteral[_user] -= (int256(_volume) * askReservePrices[_period]);
            // track lack
            settleMapping[_period].lack += _volume;
            // volumen was die normalen usern verbraucht haben
            settleMapping[_period].sumConsumed += _volume;
            // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
            //matchedBidOrderMapping[_period][user] = undefined;
        }
    }

    // increment settle counter
    settleMapping[_period].settleCounter += 1;
    // set user as settled for period
    settleMapping[_period].alreadySettled[_user] = true;

    // todo: endSettle Funktion muss beim Eingang des letzten smart meter datensatzes automatisch ausgeführt werden
    if ( settleMapping[_period].settleCounter == numberOfUsers) {
        endSettle(_period);
    }

}

function endSettle(uint256 _period) {

    int256 diff = int256(settleMapping[_period].excess) - int256(settleMapping[_period].lack);
    int256 smVolume = 0;
    address user;
    
    if (diff >= 0) {
        for (uint256 i = 0;i<settleMapping[_period].bidSmData.length;i++) {   
            smVolume = int256(settleMapping[_period].bidSmData[i].smVolume);
            if (smVolume == 0) continue;
            user = settleMapping[_period].bidSmData[i].user;
            if (smVolume <= diff) {
                colleteral[user] -= smVolume * bidReservePrices[_period];
                diff -= smVolume;
            } else {
                colleteral[user] -= diff * bidReservePrices[_period];
                colleteral[user] -= (smVolume - diff) * askReservePrices[_period];
                diff = 0;
            }
        }
    }

    smVolume = 0;

    if (diff <= 0) {
        diff = -1 * diff;
        for (uint256 j = 0;i<settleMapping[_period].askSmData.length;i++) { 
                smVolume = int256(settleMapping[_period].askSmData[i].smVolume);
                if (smVolume == 0) continue;
                user = settleMapping[_period].askSmData[i].user;
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


    // TODO: 
    // int256 shareOfEachUser = moneyLeft / _.keys(colleteral).length;
    // for (user in colleteral) {
    //     colleteral[user] += shareOfEachUser;
    // }

    // // for debugging purposes
    // var sum = getSumOfColleteral();
    // if (!(sum == 0 || (sum < 0.01 && sum > -0.01))) {
    //     debugger;
    // }


    // owner = 1;
}

   

    ///////////////////
    // Helper functions, mainly for testing purposes
    ///////////////////
 
    function getOrderIdLastOrder() returns(uint256) {
        if (idCounter == 1) {
            return 0;
        }
        return idCounter-1;
    }

    /*
    Returns ordered list of bid orders 
    author: Magnus
    */
    int256[] bidQuotes;
    uint256[] bidAmounts;
    function getBidOrders() constant returns (int256[] rv1, uint256[] rv2) {
        uint256 id_iter_bid = maxBid;
        bidQuotes = rv1;
        bidAmounts = rv2;
        while (orders[id_iter_bid].volume != 0) {
            bidAmounts.push(orders[id_iter_bid].volume);
            bidQuotes.push(orders[id_iter_bid].price);
            id_iter_bid = orders[id_iter_bid].next;
        }
        return (bidQuotes, bidAmounts);
    }

    /*
    Returns ordered list of ask orders 
    author: Magnus
    */
    int256[] askQuotes;
    uint256[] askAmounts;
    function getAskOrders() constant returns (int256[] rv1, uint256[] rv2) {
        uint256 id_iter_ask = minAsk;
        askQuotes = rv1;
        askAmounts = rv2;
        while (orders[id_iter_ask].volume != 0) {
            askQuotes.push(orders[id_iter_ask].price);
            askAmounts.push(orders[id_iter_ask].volume);
            id_iter_ask = orders[id_iter_ask].next;
        }
        return (askQuotes, askAmounts);
    }

    function getOrderId(uint256 _orderId) returns(uint256) {
        return orders[_orderId].id;
    }

    function getOrderNext(uint256 _orderId) returns(uint256) {
        return orders[_orderId].next;
    }

    function getOrderPrice(uint256 _orderId) returns(int256) {
        return orders[_orderId].price;
    }

    function getorderedVolume(uint256 _orderId) returns(uint256) {
        return orders[_orderId].volume;
    }

}
