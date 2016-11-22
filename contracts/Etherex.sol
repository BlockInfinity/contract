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
        uint256 price;
    }

    struct Match {
        uint256 volume;
        uint256 price;
        address askOwner;
        address bidOwner;
        uint256 timestamp;
    }

    uint256 BIG_PRODUCER_MIN_VOL = 100000;

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
    Order public minBid = Order(0,0,0,0,0);

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
    modifier onlyBigProducers(uint256 _volume) {
        if (_volume <  BIG_PRODUCER_MIN_VOL) throw;
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
        minBid.id = 0;
        minBid.nex = 0;
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

    //todo(ms): commented onlyUsers since there is a problem i wasnt able to solve, will further investigate
    function submitBid(uint256 _price, uint256 _volume) /*onlyUsers()*/ {
        // allocate new order
        Order memory bid = Order(idCounter++, 0, msg.sender, _volume, _price);

        // save and return if this the first bid
        if (minBid.id == 0) {
            idToOrder[bid.id] = bid;
            minBid = bid;
            return;
        }
        
        // iterate over list till same price encountered
        uint256 curr = minBid.id;
        uint256 prev = 0;
        while (bid.price > idToOrder[curr].price && curr != 0) {
            prev = curr;
            curr = idToOrder[curr].nex;
        }

        // update pointer 
        bid.nex = curr;

        // insert bid
        idToOrder[bid.id] = bid;

        // bid added at the beginning
        if (bid.nex == minBid.id) {
            minBid = bid;
        // at least one prev order exists
        } else {
            idToOrder[prev].nex = bid.id;
        }
    }
    
    // calculate min ask to satisfy flexible bids on the way?
    // todo(ms): remove code redudancy
    function submitAsk(uint256 _price, uint256 _volume) onlySmartMeters() {
        // allocate new order
        Order memory ask = Order(idCounter++, 0, msg.sender, _volume, _price);

        // save and return if this the first ask
        if (minAsk.id == 0) {
            idToOrder[ask.id] = ask;
            minAsk = ask;
            return;
        }
        
        // iterate over list till same price encountered
        uint256 curr = minAsk.id;
        uint256 prev = 0;
        while (ask.price > idToOrder[curr].price && curr != 0) {
            prev = curr;
            curr = idToOrder[curr].nex;
        }

        // update pointer 
        ask.nex = curr;

        // insert ask
        idToOrder[ask.id] = ask;

        // ask added at the beginning
        if (ask.nex == minAsk.id) {
            minAsk = ask;
        // at least one prev order exists
        } else {
            idToOrder[prev].nex = ask.id;
        }
    } 
    
    //Producer can submit ask if he is able to supply two times the average needed volume of
    //electricity
    function submitReserveAsk(uint256 _price, uint256 _volume) onlyInState(1) onlyUsers() onlyBigProducers(_volume){

        Order memory reserveAsk = Order(idCounter++, 0, msg.sender, _volume, _price);
        
        //Iterate over list till same price encountered
        Order memory curr = minReserveAsk;
        Order memory prev;
        prev.nex = minReserveAsk.id;

        if(minReserveAsk.id == 0) {
            minReserveAsk = reserveAsk;
            return;
        }

        while(reserveAsk.price > curr.price && curr.id != 0) {
            curr=n(curr);
            prev = n(prev);
        }
        reserveAsk.nex = curr.id;
        prev.nex = reserveAsk.id;
        bind(prev, reserveAsk, curr);
        if(reserveAsk.nex == minReserveAsk.id) {
            minReserveAsk = reserveAsk;
        }
    }

    //TODO Magnus Has to be automatically called from the blockchain
    //Currently without accumulating, does accumulating make sense?
    function matching(){
        
        Order memory prevBid;
        Order memory prevAsk;
        Order memory currBid = minBid;
        Order memory currAsk = minAsk;
        uint tmp;
        
        //Solve flexible bids first
        uint256 askVolume = 0;
        uint256 price = 0;
        while(askVolume < flexBidVolume && currAsk.id != 0) {       
            askVolume += currAsk.volume;
            price = currAsk.price;
            currAsk = n(currAsk);
        }

        currAsk = minAsk;
        //Wouldnt it be fair that all of them go to the aftermarket
        //instead of only the last one? Round-robin too much?
        for(uint i = 0; i < flexBids.length && currAsk.id != 0; i++ ) {
            if(currAsk.volume > flexBids[i].volume) {
                matches.push(Match(flexBids[i].volume, price, currAsk.owner, flexBids[i].owner, block.timestamp));
                currAsk.volume -= flexBids[i].volume;
            }else if(currAsk.volume < flexBids[i].volume) {
                matches.push(Match(currAsk.volume, price, currAsk.owner, flexBids[i].owner, block.timestamp));
                flexBids[i].volume -= currAsk.volume;
                prevAsk = currAsk;
                currAsk=n(currAsk);
                delete prevAsk;
                i-=1;
            } else {
                matches.push(Match(currAsk.volume, price, currAsk.owner, flexBids[i].owner, block.timestamp));
                prevAsk = currAsk;
                currAsk=n(currAsk);
                delete prevAsk; 
            }
        }
        //Matching of bids and asks with fixed price
        //Iterate till you come to the end of ask or bid lists
        while(currAsk.id != 0 && currBid.id != 0) {

            //Round robin so that everyone gets something?
            if(currAsk.volume > currBid.volume) {
                //Delete the bid
                matches.push(Match(currBid.volume, currAsk.price, currAsk.owner, currBid.owner, block.timestamp));
                currAsk.volume -= currBid.volume;
                prevBid = currBid;
                currBid=n(currBid);
                delete prevBid;

            } else if(currAsk.volume < currBid.volume) {
                //Delete the ask
                matches.push(Match(currAsk.volume, price, currAsk.owner, currBid.owner, block.timestamp));
                currBid.volume -= currAsk.volume;
                prevAsk = currAsk;
                currAsk=n(currAsk);
                delete prevAsk; 
            } else {
                //Delete both bid and ask
                matches.push(Match(currAsk.volume, price, currAsk.owner, currBid.owner, block.timestamp));
                prevAsk = currAsk;
                currAsk=n(currAsk);
                delete prevAsk;
                prevBid = currBid;
                currBid=n(currBid);
                delete prevBid;
            }


        }
        minAsk.id = 0;
        minBid.id = 0;
        
        isMatchingDone = true;
        //What remains remains...
    }

    //Settlement function called by smart meter, the user is checked if he payed enough
    //for electricity
    function settle(uint256 _consumedVolume, uint256 _timestamp) onlySmartMeters() {

        uint256 payedForVolume = 0;
        address consumer = smartMeterToUser[msg.sender];
        for(uint i=0; i < matches.length; i++) {
            if(matches[i].bidOwner == consumer) {
                payedForVolume+= matches[i].volume;
                //Check if the consumer has enough to pay, then pay
                if(matches[i].bidOwner.balance >= matches[i].price * matches[i].volume){
                    //Send amount
                } else {
                    throw;
                }
            }
        }

        //If he did not buy enough electricity
        if (payedForVolume < _consumedVolume) {
            //Pay for remaining electricity
            uint256 price = determineReservePrice();
        }
    }

    //TODO Magnus time controlled
    function determineReservePrice() returns (uint256) {
        
    }

    // Helper functions, mainly for testing purposes
    function getOrderPropertyById(uint256 _orderId, uint _property) returns(uint256) {
        if (_property == 0) {
            return idToOrder[_orderId].id;
        } else if (_property == 1) {
            return idToOrder[_orderId].nex;
        } else if (_property == 2) {
            return idToOrder[_orderId].price;
        } else if (_property == 3) {
            return idToOrder[_orderId].volume;
        } else {
            return 0;
        }
    }

    function getOrderIdLastOrder() returns(uint256) {
        if (idCounter == 1) {
            return 0;
        }
        return idCounter-1;
    }
}