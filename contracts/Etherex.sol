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
    mapping(uint256 => mapping(address => uint256)) matchedAskOrderMapping;
    mapping(uint256 => mapping(address => uint256)) matchedBidOrderMapping;
    mapping(uint256 => int256) matchingPriceMapping;
    uint256[] currMatchedAskOrderMapping;
    uint256[] currMatchedBidOrderMapping;

    // flag when matching done
    bool isMatchingDone = false;
            
    uint256 idCounter;

    uint8 currState;

    uint256 startBlock;

    // todo: needs to be upedated when state is changes
    // info(ms): is currently incremented by 1 in matching()-function
    uint256 period = 0;

    // todo: statt konstantem wert, durchschnittliches maximum eines Haushaltes iterativ berechnen und das produkt mit #haushalte als MIN_RESERVE_VOLUME setzen
    uint256 MIN_RESERVE_VOLUME = 1000; 

    // maps volume to period and owner
    mapping (uint256 => mapping(address => uint256)) matchedReserveOrders;
    // maps reserveprice to period
    mapping (uint256 => int256) reserveAskPriceForPeriod;
    mapping (uint256 => int256) reserveBidPriceForPeriod;

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
        Order memory blankOrder = Order(0, 0, 0, 0, 0);
        orders.push(blankOrder);
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
        saveOrder("BID", _price, _volume);
    }

    // calculate min ask to satisfy flexible bids on the way?
    function submitAsk(int256 _price, uint256 _volume) onlySmartMeters() {
        saveOrder("ASK", _price, _volume);
    } 
    
    // producer can submit ask if he is able to supply two times the average needed volume of
    // electricity
    function submitReserveAsk(int256 _price, uint256 _volume) onlyInState(1) onlyUsers() onlyReserveUsers(_volume) {
        saveOrder("ASK", _price, _volume);
    }

    function submitReserveBid(int256 _price, uint256 _volume) /*onlyInState(1) */ onlyUsers() onlyReserveUsers(_volume) {
        saveOrder("BID", _price, _volume);
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
    function saveOrder(bytes32 _type, int256 _price, uint256 _volume) internal {
        // allocate new order
        Order memory currOrder = Order(idCounter++, 0, msg.sender, _volume, _price);

        // store maxBid or minAsk
        uint256 bestOrder;

        // type = ask -> ascending
        // type = bid -> descending
        int8 ascending = 0;

        if (_type == "ASK") {
            bestOrder = minAsk;
            ascending = 1;  
        } else if (_type == "BID") {
            bestOrder = maxBid;
            ascending = -1;
        } else {
            throw;
        }

        // save and return if this the first bid
        if (bestOrder == 0) {
            orders.push(currOrder);
            bestOrder = currOrder.id;
            
        } else {
            // iterate over list till same price encountered
            uint256 curr = bestOrder;
            uint256 prev = 0;
            while ((ascending * currOrder.price) > (ascending * orders[curr].price) && curr != 0) {
                prev = curr;
                curr = orders[curr].next;
            }

            // update pointer 
            currOrder.next = curr;
    
            // insert order
            orders.push(currOrder);
    
            // curr_order added at the end
            if (currOrder.next == bestOrder) {
                bestOrder = currOrder.id;
                
            // at least one prev order exists
            } else {
                orders[prev].next = currOrder.id;
            }
        }
        
        // update maxBid or minAsk
        if (_type == "ASK") {
            minAsk = bestOrder;      
        } else if (_type == "BID") {
            maxBid = bestOrder;        
        }
    }

    // match bid and ask orders
    function matching() {
        // todo(ms): period increment should be controlled outside of matching()-function 
        period++;

        // no orders submitted at all or at least one ask and bid missing
        // return if no orders or no match possible since minAsk greater than maxBid
        if (orders.length == 1) {
            reset();
            matchingPriceMapping[period] = 2**128-1;
            return;
        }
        if (minAsk == 0 || maxBid == 0 || (orders[minAsk].price > orders[maxBid].price)) {
            reset();
            // todo(ms): should we set isMatchingDone in this case?
            isMatchingDone = true;
            matchingPriceMapping[period] = 2**128-1;
            return;
        }

        uint256 cumAskVol = 0;
        uint256 cumBidVol = 0;

        int256 matchingPrice = orders[minAsk].price;
        bool isMatched = false;
        bool outOfAskOrders = false;

        uint256 currAsk = minAsk;
        uint256 currBid = maxBid;

        uint256 next;

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

            // enough ask volume sufficient to satisfy bids or no more asks left at all
            if (cumAskVol >= cumBidVol || outOfAskOrders) {
                isMatched = true;
                // set the matching price
                matchingPriceMapping[period] = matchingPrice;
            // need another iteration, get more ask volume, also increase matching price
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
            for (uint256 i=0; i<currMatchedAskOrderMapping.length; i++) {
                matchedAskOrderMapping[period][orders[currMatchedAskOrderMapping[i]].owner] 
                = (cumBidVol * orders[currMatchedAskOrderMapping[i]].volume) / cumAskVol;
            }
            for (uint256 ii=0; ii<currMatchedBidOrderMapping.length; ii++) {
                matchedBidOrderMapping[period][orders[currMatchedBidOrderMapping[ii]].owner] 
                = orders[currMatchedBidOrderMapping[ii]].volume;
            }
        } else {
            for (uint256 j=0; j<currMatchedBidOrderMapping.length; j++) {
                matchedBidOrderMapping[period][orders[currMatchedBidOrderMapping[j]].owner] 
                = (cumAskVol * orders[currMatchedBidOrderMapping[j]].volume) / cumBidVol;
            }
            for (uint256 jj=0; jj<currMatchedAskOrderMapping.length; jj++) {
                matchedAskOrderMapping[period][orders[currMatchedAskOrderMapping[jj]].owner] 
                = orders[currMatchedAskOrderMapping[jj]].volume;
            }
        }
    }
    
    // settle
    function settle(uint256 _consumedVolume, uint256 _timestamp) onlySmartMeters() {

    }

    function determineReserveBidPrice() returns (int256) {
        uint256 cumBidReserveVol = 0;
        int256 reserveBidPrice = orders[maxBid].price;
        bool isFound = false;
        uint256 bidIterId = maxBid;

        while (!isFound) {
            while (orders[bidIterId].price == reserveBidPrice) {
                uint256 volume = orders[bidIterId].volume;
                address owner = orders[bidIterId].owner;

                cumBidReserveVol += volume;
                matchedReserveOrders[period][owner] = volume;

                uint256 nextOrder = orders[bidIterId].next;

                if (nextOrder != 0) {
                    bidIterId = nextOrder;
                } else {
                    isFound = true;
                    break;
                }
            }

            if (cumBidReserveVol >= MIN_RESERVE_VOLUME) {
                isFound = true;
            } else {
                reserveBidPrice = orders[bidIterId].price;
            }
        }

        reserveBidPriceForPeriod[period] = reserveBidPrice;
        return reserveBidPrice;
    }

    // todo(mg) to be time controlled
    function determineReserveAskPrice() returns (int256) {
        uint256 cumAskReserveVol = 0;
        int256 reserve_price = orders[minAsk].price;
        bool isFound = false;
        uint256 ask_id_iter = minAsk;

        while (!isFound) {
            while (orders[ask_id_iter].price == reserve_price) {
                uint256 volume = orders[ask_id_iter].volume;     // redundant, aber übersichtlicher
                address owner = orders[ask_id_iter].owner;

                cumAskReserveVol += volume;
                matchedReserveOrders[period][owner] = volume;

                uint256 next_order = orders[ask_id_iter].next;
                if (next_order != 0) {
                    ask_id_iter = next_order;
                } else {
                    isFound = true;
                    break;     // Mindestmenge an Energie konnten nicht erreicht werden, da selbst beim höchsten Preis nicht ausreichen Energie vorhanden war
                }
            }

            if (cumAskReserveVol >= MIN_RESERVE_VOLUME) {
              isFound = true;
            } else {
              reserve_price = orders[ask_id_iter].price;
            }        
        }

        // todo: orders löschen? 
        reserveAskPriceForPeriod[period] = reserve_price;
        return reserve_price;
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

    function getOrderVolume(uint256 _orderId) returns(uint256) {
        return orders[_orderId].volume;
    }

    function getMatchedAskOrderMapping(uint256 _period, address _owner) returns(uint256) {
        return matchedAskOrderMapping[_period][_owner];
    }

    function getMatchedBidOrderMapping(uint256 _period, address _owner) returns(uint256) {
        return matchedBidOrderMapping[_period][_owner];
    }

    function getMatchingPriceMapping(uint256 _period) returns(int256) {
        return matchingPriceMapping[_period];
    }

}
