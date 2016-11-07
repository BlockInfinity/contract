pragma solidity ^0.4.2;


/*

Global TODOS:

Modifiers for time dependant operations.
Communication with smart meter.
The order of the functions has to be determined.

*/
contract Etherex {

    struct Match {
      uint256 volume;
      uint256 price;
      address askOwner;
      address bidOwner;
      uint256 timestamp;
    }
    
    //state times in minutes
    uint8[] states = [0,1,2,3];
    
    struct Order {
                
        uint256 id;
        uint256 nex;
        address owner;
        uint256 volume;
        uint256 price;
        
    }
    mapping(uint256 => Order) idToOrder;
    
    uint8 public currState;
    uint256 public startBlock;
    bool isMatchingDone;

    uint256 idCounter;
    
    mapping (address => address) smartMeterToUser;
    

    //Additional array for flex bids, more optimal
    
     

    Match[] matchinges;

    //1 for CA, 2 for smart meter
    mapping (address => uint8) identities;

    //Balance for consumed energy that was not bought through orders
    //if the balance is below 0, then send event that turns of energy
    mapping (address => uint256) public collateral;

    //Linked list helper functions
    //Returns next in list
    function n(Order _o) internal returns(Order) {
        return idToOrder[_o.nex];
    }
    //Binds the node into list
    function bind(Order _prev, Order _curr, Order _next) internal{
        idToOrder[_curr.id] = _curr;
        idToOrder[_prev.id] = _prev;
        idToOrder[_next.id] = _next;
    }
    
    
    function remove(Order _prev, Order _curr) internal{
        _prev.nex = n(_curr).id;
        delete _curr;
    } 

    // modifiers
    modifier onlySmartMeters(){
        if (identities[msg.sender] != 2) throw;
        _;
    }
    modifier onlyUsers(){
        if (smartMeterToUser[msg.sender] == 0) throw;
        _;
    }
    modifier onlyCertificateAuthorities(){
        if (identities[msg.sender] != 1) throw;
        _;
    }
    
    modifier onlyInState(uint8 _state) {
        updateState();
        if(_state != currState) throw;
        _;
    }


 
    /*
    Wird bei jeder eingehenden Order ausgeführt. 
    Annahme: Es wird mindestens eine Order alle 12 Sekunden eingereicht.  
    inStateZero: Normale Orders können abgegeben werden. Dauer von -1/3*t bis +1/3*t (hier t=15)
    inStateOne: Nachdem normale orders gematchinged wurden, können ask orders für die Reserve abgeben werden. Dauer von 1/3*t bis 2/3*t (hier t=15).
    */
    function updateState() internal {
        if (inStateZero() && currState != 0){
            currState = 0;    
            determineReservePrice();
        } else if (inStateOne() && currState != 1) {
            currState = 1;
            determine_matching_price();
        } else {                                        // Zyklus beginnt von vorne
            startBlock = block.number;
            isMatchingDone = false;
              /* 
            TODO: 
            Zu Beginn der Periode müssten alle Orders gelöscht werden. Können wir statt idToOrder mapping ein array benutzen? Das könnte man dann mit delete auf null setzen.      
            */
            lowest_ask_id=0;
            highest_bid_id=0;
        }             
    }
 
    function inStateZero() internal returns (bool rv){
        if (block.number < (startBlock + 50)) {
            return true;
        }
        return false;
    }

    function inStateOne() internal returns (bool rv){
        if (block.number >= (startBlock + 50) && block.number < (startBlock + 75)){
            return true;
        }
        return false;
    }
    


    
    // Register Functions
    function registerSmartmeter(address _sm, address _user) onlyCertificateAuthorities(){
      identities[_sm] = 2;
      smartMeterToUser[_sm] = _user; 
    }
    
    function countBids() returns(uint256) {
        uint256 counter = 0;
        Order memory curr = minAsk;
        while(curr.id != 0) {
            counter++;
            curr = n(curr);
        }
        return counter;
    }

    //If this is called, just put it on the beginning on the list
    function submitFlexBid(uint256 _volume) {
        Order bid;
        bid.volume = _volume;
        flexBidVolume +=_volume;
        flexBids.push(bid);
    }

    function submitBid(uint256 _price, uint256 _volume)  {
        
        Order bid;
        bid.volume = _volume;
        bid.id = idCounter++;
        bid.price = _price;
        bid.owner = msg.sender;
        
        //Iterate over list till same price encountered
        Order memory curr = minBid;
        Order memory prev;
        prev.nex = minBid.id;
        if(minBid.id == 0) {
            minBid = bid;
            return;
        }

        while(bid.price > curr.price && curr.id != 0) {
            curr=n(curr);
            prev = n(prev);
        }
        //Have to do it here because solidity passes by value -.-
        bid.nex = curr.id;
        prev.nex = bid.id;
        bind(prev, bid, curr);
        if(bid.nex == minBid.id) {
            minBid = bid;
        }
        
    }
    
    //Calculate min ask to satisfy flexible bids on the way?
    function submitAsk(uint256 _price, uint256 _volume) {
        
        Order ask;
        ask.volume = _volume;
        ask.id = idCounter++;
        ask.price = _price;
        ask.owner = msg.sender;
        
        if(minAsk.id == 0){
            minAsk = ask;
            return;
        }
        
        //Iterate over list till same price encountered
        Order memory curr = minAsk;
        Order memory prev;
        prev.nex = minAsk.id;
        while(ask.price > curr.price && curr.id != 0) {
            curr=n(curr);
            prev = n(prev);
        }
        ask.nex = curr.id;
        prev.nex = ask.id;
        bind(prev, ask, curr);
        if(ask.nex == minAsk.id) {
            minAsk = ask;
        }

    } 
    
    

    //Producer can submit ask if he is able to supply two times the average needed volume of
    //electricity
    function submitReserveAsk(uint256 _price, uint256 _volume) onlyInState(1) onlyUsers() onlyBigProducers(_volume){

        Order reserveAsk;
        reserveAsk.volume = _volume;
        reserveAsk.id = idCounter++;
        reserveAsk.price = _price;
        reserveAsk.owner = msg.sender;
        
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
    
    function checkMatches() returns(uint256){
        return matches.length;
    }

    function test_submitASK() {
        submitAskOrder(20,25);
        submitAskOrder(23,45);
        submitAskOrder(24,1);
        submitAskOrder(30,40);
        submitAskOrder(30,50);
        submitBidOrder(999,67);
        submitBidOrder(10,200);
        submitBidOrder(30,10);

        //return determine_matching_price();
    }
 
      /* 
    Modifiers ignored for test purposes (internal)
    author: Magnus
    */
    uint256 public cumAskVol;
    uint256 public cumBidVol;
    bytes32[] public ask_orders;
    bytes32[] public bid_orders;

    function determine_matching_price() returns(bytes32[] rv1,bytes32[] rv2){   
        bool isMatched = false;
        bytes32 id_iter_ask = lowest_ask_id;
        bytes32 id_iter_bid = highest_bid_id;           
        uint256 ask_price = orders[lowest_ask_id].price;
        uint256 bid_price = orders[highest_bid_id].price;

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
            while (orders[id_iter_bid].price >= ask_price){     // TOD:O die bid preise gehe ich jedes Mal von vorne durch. effizienter macehn
                cumBidVol += orders[id_iter_bid].volume;
                id_iter_bid = bid_orderbook[id_iter_bid].next_id;
                bid_orders.push(id_iter_bid);
            }
            if (cumAskVol >= cumBidVol){
                isMatched = true;
            } else {
                ask_price = orders[id_iter_ask].price;
                id_iter_bid = highest_bid_id;
                cumBidVol=0;
                delete bid_orders;
            }
        }
        minAsk.id = 0;
        minBid.id = 0;
        
        isMatchingDone = true;
        //What remains remains...
        
    }

    //Settlement function called by smart meter, the user is checked if he payed enough
    //for electricity
    function settleUserPosition(uint256 _consumedVolume, uint256 _timestamp) onlySmartMeters(){


    }

    //TODO Magnus time controlled
    function determineReservePrice() returns (uint256){
        
    }

    //Constructor
    function Etherex(address _certificateAuthority) {
        identities[_certificateAuthority] = 1;
        idCounter = 1;
        startBlock = block.number; 
        currState = 0;
    }
}


   
