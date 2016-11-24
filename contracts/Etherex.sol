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
        uint256 nex;
        address owner;
        uint256 volume;
        int256 price;
    }

    struct Match {
        uint256 volume;
        uint256 price;
        address askOwner;
        address bidOwner;
        uint256 timestamp;
    }

    uint256 RESERVE_PRODUCER_MIN_VOL = 100000;

    bool DEBUG = true;

    //Balance for consumed energy that was not bought through orders
    //if the balance is below 0, then send event that turns of energy
    mapping(address => uint256) public collateral;

    // maps order id to order objects
    mapping(uint256 => Order) idToOrder;

    // each smart meter has a user attached
    mapping(address => address) smartMeterToUser;

    // stores matching results    
    Match[] matches;

    bool isMatchingDone = false;
        
    Order public minAsk = Order(0,0,0,0,0);
    Order public maxBid = Order(0,0,0,0,0);

    Order minReserveAsk = Order(0,0,0,0,0);

    // flex bids
    Order[] flexBids;
    uint256 flexBidVolume = 0;
    //Additional array for flex bids, more optimal
    
    //1: CA, 2: smart meter
    mapping(address => uint8) identities;

    uint256 idCounter;

    uint8 public currState;

    uint256 public startBlock;

    //Constructor
    function Etherex(address _certificateAuthority) {
        identities[_certificateAuthority] = 1;
        idCounter = 1;
        startBlock = block.number; 
        currState = 0;
    }

    //Modifiers
    modifier onlyCertificateAuthorities() {
        if (identities[msg.sender] != 1) throw;
        _;
    }
    modifier onlySmartMeters() {
        if (identities[msg.sender] != 2) throw;
        _;
    }
    modifier onlyUsers() {
        if (smartMeterToUser[msg.sender] == 0) throw;
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
        if (inStateZero() && currState != 0){
            currState = 0;    
            determineReservePrice();
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
    
    //Register Functions
    function registerCertificateAuthority(address _ca) {
        identities[_ca] = 1;
    }

    function registerSmartMeter(address _sm, address _user) onlyCertificateAuthorities() {
        identities[_sm] = 2;
        smartMeterToUser[_sm] = _user; 
    }

    function reset() {
        startBlock = block.number;
        isMatchingDone = false;
          /* 
        TODO: 
        Zu Beginn der Periode müssten alle Orders gelöscht werden. Können wir statt idToOrder mapping ein array benutzen? Das könnte man dann mit delete auf null setzen.      
        */
        //delete idToOrder;
        delete flexBids;
        idCounter = 1;
        minAsk.id = 0;
        minAsk.nex = 0;
        maxBid.id = 0;
        maxBid.nex = 0;
    }
    
    //////////////////////////
    // Submit bid/ask helper functions
    //////////////////////////

    //Returns next in list
    function n(Order _o) internal returns(Order) {
        return idToOrder[_o.nex];
    }

    //Binds the node into list
    function bind(Order _prev, Order _curr, Order _next) internal {
        idToOrder[_curr.id] = _curr;
        idToOrder[_prev.id] = _prev;
        idToOrder[_next.id] = _next;
    }

    function remove(Order _prev, Order _curr) internal {
        _prev.nex = n(_curr).id;
        delete _curr;
    } 
    
    // put flex bid in separate flex bid pool
    function submitFlexBid(uint256 _volume) {
        Order memory bid;
        bid.volume = _volume;
        flexBidVolume += _volume;
        flexBids.push(bid);
    }


    function test_submitAsk(){
        submitAsk(1,1);
        submitAsk(6,2);
        submitAsk(8,3);
        submitAsk(4,3);
        submitAsk(2,5);
        submitAsk(12,5);
    }

    function test_submitBid(){
        submitBid(1,1);
        submitBid(6,2);
        submitBid(8,3);
        submitBid(4,3);
        submitBid(2,5);
        submitBid(12,5);
    }

    function save_order(bytes32 _type, int256 _price, uint256 _volume) {
        // allocate new order
        Order memory curr_order = Order(idCounter++, 0, msg.sender, _volume, _price);

        // temporär wird hier der order struct maxBid oder minAsk abgelegt.
        Order memory best_order;            

        // dient der Invertierung vom Vergleichszeichen um aufsteigende und absteigende Reihenfolge in einer Funktion zu realisieren.
        int8 ascending = 0;

        if (_type == "ASK"){
            best_order = minAsk;
            ascending = 1;  
            
        } else if (_type == "BID"){
            best_order = maxBid;
            ascending = -1;
        }

        // save and return if this the first bid
        if (best_order.id == 0) {
            idToOrder[curr_order.id] = curr_order;
            best_order = curr_order;
            
        } else {
            // iterate over list till same price encountered
            uint256 curr = best_order.id;
            uint256 prev = 0;
            while ((ascending*curr_order.price) > (ascending*idToOrder[curr].price) && curr != 0) {
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
        
        // best orders werden im storage geupdated
        if (_type == "ASK"){
            minAsk = best_order;      
        } else if (_type == "BID"){
            maxBid = best_order;        
        }
    }

    //todo(ms): commented onlyUsers since there is a problem i wasnt able to solve, will further investigate
    //todo (mg): prüfen ob ausreichend ether mitgeschickt wurde
    function submitBid(int256 _price, uint256 _volume) /*onlyUsers()*/ {
        save_order("BID",_price,_volume);
    }

    
    // calculate min ask to satisfy flexible bids on the way?
    function submitAsk(int256 _price, uint256 _volume) /*onlyUsers()*/  {
        save_order("ASK",_price,_volume);
    } 
    
    //Producer can submit ask if he is able to supply two times the average needed volume of
    //electricity
    function submitReserveAsk(int256 _price, uint256 _volume) onlyInState(1) onlyUsers() onlyReserveUsers(_volume){
        save_order("ASK",_price,_volume);
    }

    // TODO: von Alex den matching algorithmus implementieren. Hier steht glaube eine alternative Variante? 
     function matching(){
        
    //     Order memory prevBid;
    //     Order memory prevAsk;
    //     Order memory currBid = maxBid;
    //     Order memory currAsk = minAsk;
    //     uint tmp;
        
    //     //Solve flexible bids first
    //     uint256 askVolume = 0;
    //     uint256 price = 0;
    //     while(askVolume < flexBidVolume && currAsk.id != 0) {       
    //         askVolume += currAsk.volume;
    //         price = currAsk.price;
    //         currAsk = n(currAsk);
    //     }

    //     currAsk = minAsk;
    //     //Wouldnt it be fair that all of them go to the aftermarket
    //     //instead of only the last one? Round-robin too much?
    //     for(uint i = 0; i < flexBids.length && currAsk.id != 0; i++ ) {
    //         if(currAsk.volume > flexBids[i].volume) {
    //             matches.push(Match(flexBids[i].volume, price, currAsk.owner, flexBids[i].owner, block.timestamp));
    //             currAsk.volume -= flexBids[i].volume;
    //         }else if(currAsk.volume < flexBids[i].volume) {
    //             matches.push(Match(currAsk.volume, price, currAsk.owner, flexBids[i].owner, block.timestamp));
    //             flexBids[i].volume -= currAsk.volume;
    //             prevAsk = currAsk;
    //             currAsk=n(currAsk);
    //             delete prevAsk;
    //             i-=1;
    //         } else {
    //             matches.push(Match(currAsk.volume, price, currAsk.owner, flexBids[i].owner, block.timestamp));
    //             prevAsk = currAsk;
    //             currAsk=n(currAsk);
    //             delete prevAsk; 
    //         }
    //     }
    //     //Matching of bids and asks with fixed price
    //     //Iterate till you come to the end of ask or bid lists
    //     while(currAsk.id != 0 && currBid.id != 0) {

    //         //Round robin so that everyone gets something?
    //         if(currAsk.volume > currBid.volume) {
    //             //Delete the bid
    //             matches.push(Match(currBid.volume, currAsk.price, currAsk.owner, currBid.owner, block.timestamp));
    //             currAsk.volume -= currBid.volume;
    //             prevBid = currBid;
    //             currBid=n(currBid);
    //             delete prevBid;

    //         } else if(currAsk.volume < currBid.volume) {
    //             //Delete the ask
    //             matches.push(Match(currAsk.volume, price, currAsk.owner, currBid.owner, block.timestamp));
    //             currBid.volume -= currAsk.volume;
    //             prevAsk = currAsk;
    //             currAsk=n(currAsk);
    //             delete prevAsk; 
    //         } else {
    //             //Delete both bid and ask
    //             matches.push(Match(currAsk.volume, price, currAsk.owner, currBid.owner, block.timestamp));
    //             prevAsk = currAsk;
    //             currAsk=n(currAsk);
    //             delete prevAsk;
    //             prevBid = currBid;
    //             currBid=n(currBid);
    //             delete prevBid;
    //         }


    //     }
    //     minAsk.id = 0;
    //     maxBid.id = 0;
        
    //     isMatchingDone = true;
    //     //What remains remains...
     }
    

    //Settlement function called by smart meter
    function settle(uint256 _consumedVolume, uint256 _timestamp) onlySmartMeters() {

  
    }

    uint256 period = 0; // todo: needs to be upedated when state is changed
    uint256 MIN_RESERVE_VOLUME = 1000;  // todo: statt konstantem wert, durchschnittliches maximum eines Haushaltes iterativ berechnen und das produkt mit #haushalte als MIN_RESERVE_VOLUME setzen



    mapping (uint256 => mapping (address =>  uint256)) public matchedReserveOrders;   // maps volume to period and owner
    mapping (uint256 => int256) public reservePriceForPeriod;                        // maps reserveprice to period


    //TODO Magnus time controlled
    function determineReservePrice() returns (uint256) {
        uint256 cumAskReserveVol = 0;
        int256 reserve_price = minAsk.price;
        bool isFound = false;
        uint256 ask_id_iter = minAsk.id;

        while(!isFound) {
            while(idToOrder[ask_id_iter].price == reserve_price){
                uint256 volume = idToOrder[ask_id_iter].volume;     // redundant, aber übersichtlicher
                address owner = idToOrder[ask_id_iter].owner;

                cumAskReserveVol += volume;
                matchedReserveOrders[period][owner] = volume;

                uint256 next_order = idToOrder[ask_id_iter].nex;
                if (next_order != 0){
                    ask_id_iter = next_order;
                } else {
                    isFound = true;     // Mindestmenge an Energie konnten nicht erreicht werden, da selbst beim höchsten Preis nicht ausreichen Energie vorhanden war
                    break;
                }
            }

            if (cumAskReserveVol >= MIN_RESERVE_VOLUME) {
              isFound = true;
            } else {
              reserve_price = idToOrder[ask_id_iter].price;
            }        
        }
        // idToOrder löschen? 

        reservePriceForPeriod[period] = reserve_price;

        debug_determineReservePrice("determineReservePrice Method ended.",reserve_price,cumAskReserveVol);
    }

    event debug_determineReservePrice(string log,int256 reserve_price, uint256 cumAskReserveVol);

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
    function getBidOrders() constant returns (int256[] rv1,uint256[] rv2) {
        uint256 id_iter_bid = maxBid.id;
        bidQuotes = rv1;
        bidAmounts = rv2;

        while (idToOrder[id_iter_bid].volume != 0){
            bidAmounts.push(idToOrder[id_iter_bid].volume);
            bidQuotes.push(idToOrder[id_iter_bid].price);
            id_iter_bid = idToOrder[id_iter_bid].nex;
        }
        return(bidQuotes,bidAmounts);
    }

     /*
    Returns ordered list of ask orders 
    author: Magnus
    */
    int256[] askQuotes;
    uint256[] askAmounts;
    function getAskOrders() constant returns (int256[] rv1,uint256[] rv2){
        askQuotes = rv1;
        askAmounts = rv2;
        uint256 id_iter_ask = minAsk.id;
        while (idToOrder[id_iter_ask].volume != 0){
            askQuotes.push(idToOrder[id_iter_ask].price);
            askAmounts.push(idToOrder[id_iter_ask].volume);
            id_iter_ask = idToOrder[id_iter_ask].nex;
        }
        return(askQuotes,askAmounts);
    }

    // Helper functions, mainly for testing purposes
    // TODO: Ich habe den Preis nun als int256 geklariert, deswegen wird hier ein error geworfen. Ausbessern! 
    // function getOrderPropertyById(uint256 _orderId, uint _property) returns(uint256) {
    //     if (_property == 0) {
    //         return idToOrder[_orderId].id;
    //     } else if (_property == 1) {
    //         return idToOrder[_orderId].nex;
    //     } else if (_property == 2) {
    //         return idToOrder[_orderId].price;
    //     } else if (_property == 3) {
    //         return idToOrder[_orderId].volume;
    //     } else {
    //         return 0;
    //     }
    // }

}
