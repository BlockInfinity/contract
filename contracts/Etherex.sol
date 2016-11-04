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
    uint256[] stateTimes = [10, 10, 10 ,10];
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
    
    Order minAsk;
    Order minBid;
    Order minReserveAsk;
    Order[] flexBids;
    uint256 flexBidVolume = 0;
    uint256 bigProducerMinVolume = 100000;
    //Additional array for flex bids, more optimal
    
     

    Match[] matches;

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
        _prev.nex = _curr.id;
        _curr.id = _next.id;
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

    modifier onlyBigProducers(uint256 _volume) {
        if (_volume <  bigProducerMinVolume) throw;
        _;
    }


 
    /*
    Wird bei jeder eingehenden Order ausgeführt. 
    Annahme: Es wird mindestens eine Order alle 12 Sekunden eingereicht.  
    inStateZero: Normale Orders können abgegeben werden. Dauer von -1/3*t bis +1/3*t (hier t=15)
    inStateOne: Nachdem normale orders gematched wurden, können ask orders für die Reserve abgeben werden. Dauer von 1/3*t bis 2/3*t (hier t=15).
    */
    function updateState() internal {
        if (inStateZero() && currState != 0){
            currState = 0;    
            determineReservePrice();
        } else if (inStateOne() && currState != 1) {
            currState = 1;
            matching();
        } else {                                        // Zyklus beginnt von vorne
            startBlock = block.number;
            isMatchingDone = false;
              /* 
            TODO: 
            Zu Beginn der Periode müssten alle Orders gelöscht werden. Können wir statt idToOrder mapping ein array benutzen? Das könnte man dann mit delete auf null setzen.      
            */
            delete flexBids;
            idCounter=1;
            minAsk.id=0;
            minAsk.nex=0;
            minBid.id=0;
            minBid.nex=0;
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


    //If this is called, just put it on the beginning on the list
    function submitFlexBid(uint256 _volume) onlyInState(0) onlyUsers(){
        Order bid;
        bid.volume = _volume;
        flexBidVolume +=_volume;
        flexBids.push(bid);
    }

    function submitBid(uint256 _price, uint256 _volume) onlyInState(0) onlyUsers() {
        
        Order bid;
        bid.volume = _volume;
        bid.id = idCounter++;
        bid.price = _price;
        bid.owner = msg.sender;
        
        //Iterate over list till same price encountered
        Order memory curr = minBid;
        Order memory prev;
        prev.nex = minBid.id;
        while(bid.price > curr.price && curr.id != 0) {
            curr=n(curr);
            prev = n(prev);
        }
        bind(prev, bid, curr);
        
    }
    
    //Calculate min ask to satisfy flexible bids on the way?
    function submitAsk(uint256 _price, uint256 _volume) onlyInState(0) onlyUsers(){
        
        Order ask;
        ask.volume = _volume;
        ask.id = idCounter++;
        ask.price = _price;
        ask.owner = msg.sender;
        
        
        
        //Iterate over list till same price encountered
        Order memory curr = minBid;
        Order memory prev;
        prev.nex = minAsk.id;
        while(ask.price > curr.price && curr.id != 0) {
            curr=n(curr);
            prev = n(prev);
        }
        bind(prev, ask, curr);
        
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
        while(reserveAsk.price > curr.price && curr.id != 0) {
            curr=n(curr);
            prev = n(prev);
        }
        bind(prev, reserveAsk, curr);


    } 


    //TODO Magnus Has to be automatically called from the blockchain
    //Currently without accumulating, does accumulating make sense?
    function matching() internal{
        
        Order memory prevBid;
        Order memory prevAsk;
        Order memory currBid = minBid;
        Order memory currAsk = minAsk;
        uint tmp;
        
        //Solve flexible bids first
        uint256 askVolume = 0;
        uint256 price = 0;
        while(askVolume < flexBidVolume currAsk.id != 0) {       
            askVolume += currAsk.volume;
            price = currAsk.price;
        }
        currAsk = minAsk;                       // QUESTION: muss das nicht in die schleife rein?? 

        //Wouldnt it be fair that all of them go to the aftermarket
        //instead of only the last one? Round-robin too much?
        for(uint i = 0; i < flexBids.length; i++ ) {
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

            }else if(currAsk.volume < currBid.volume) {
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
        isMatchingDone = true;
        //What remains remains...
        
    }

    //Settlement function called by smart meter, the user is checked if he payed enough
    //for electricity
    function settle(uint256 _consumedVolume, uint256 _timestamp) onlySmartMeters(){

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
        if(payedForVolume < _consumedVolume) {
            //Pay for remaining electricity
            uint256 price = determineReservePrice();
        }

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


   
