pragma solidity ^0.4.2;

import "Token.sol";
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
    uint256 idCounter;
    
    mapping (address => address) userToSmartMeter;
    
    Order minAsk;
    Order minBid;
    Order [] flexBids;
    uint256 flexBidVolume = 0;
    //Additional array for flex bids, more optimal
    
     

    Match [] matches;

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
        if (userToSmartMeter[msg.sender] == 0) throw;
        _;
    }
    modifier onlyCertificateAuthorities(){
        if (identities[msg.sender] != 1) throw;
        _;
    }
    
    modifier onlyInState(uint8 _state) {
        if(_state != currState) throw;
        _;
    }
    
    //TODO Function that has to update the state based on time,
    //should be called as often as possible :)
    function updateState() internal {
            
    }
    
    // Register Functions
    function registerSmartmeter(address _sm) onlyCertificateAuthorities(){
      identities[_sm] = 2;
    }


    //If this is called, just put it on the beginning on the list
    function submitFlexBid(uint256 _volume) onlyInState(0) onlyUsers(){
        Order bid;
        bid.volume = _volume;
        flexBidVolume +=_volume;
        flexBids.push(bid);
    }

    function submitBid(uint256 _price, uint256 _volume) onlyInState(0) onlyUsers(){
        
        Order bid;
        bid.volume = _volume;
        bid.id = idCounter++;
        bid.price = _price;
        bid.owner = msg.sender;
        
        //Iterate over list till same price encountered
        Order memory curr = minBid;
        Order memory prev;
        prev.nex = minBid.id;
        while(bid.price > curr.price) {
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
        while(ask.price > curr.price) {
            curr=n(curr);
            prev = n(prev);
        }
        bind(prev, ask, curr);
        
    } 
    
    
    //TODO ?
    function submitCompAsk(uint256 _price, uint256 _volume) onlyInState(0) onlyUsers(){

    } 


    //TODO Magnus Has to be automatically called from the blockchain
    //Currently without accumulating, does accumulating make sense?
    function matching() onlyInState(1){
        
        Order memory prevBid;
        Order memory prevAsk;
        Order memory currBid = minBid;
        Order memory currAsk = minAsk;
        uint tmp;
        
        //Solve flexible bids first
        uint256 askVolume = 0;
        uint256 price = 0;
        while(askVolume < flexBidVolume) {
            askVolume += currAsk.volume;
            price = currAsk.price;
        }
        currAsk = minAsk;
        //Wouldnt it be fair that all of them go to the aftermarket
        //instead of only the last one? Round-robin too much?
        for(uint i = 0; i < flexBids.length; i++ ) {
            if(currAsk.volume > flexBids[i].volume) {
                matches.push(Match(flexBids[i].volume, price, currAsk.owner, flexBids[i].owner));
                currAsk.volume -= flexBids[i].volume;
            }else if(currAsk.volume < flexBids[i].volume) {
                matches.push(Match(currAsk.volume, price, currAsk.owner, flexBids[i].owner));
                flexBids[i].volume -= currAsk.volume;
                tmp = currAsk.nex;
                remove(prevAsk, currAsk);
                currAsk = idToOrder[tmp]; 
                i-=1;
            } else {
                matches.push(Match(currAsk.volume, price, currAsk.owner, flexBids[i].owner));
                tmp = currAsk.nex;
                remove(prevAsk, currAsk);
                currAsk = idToOrder[tmp]; 
            }
        }
        //Matching of bids and asks with fixed price
        //Iterate till you come to the end of ask or bid lists
        while(currAsk.id != 0 && currBid.id != 0) {

            //Round robin so that everyone gets something?
            if(currAsk.volume > currBid.volume) {
                matches.push(Match(currBid.volume, currAsk.price, currAsk.owner, currBid.owner));
                currAsk.volume -= currBid.volume;
            }else if(currAsk.volume < currBid.volume) {
                matches.push(Match(currAsk.volume, price, currAsk.owner, currBid.owner));
                currBid.volume -= currAsk.volume;
                tmp = currAsk.nex;
                remove(prevAsk, currAsk);
                currAsk = idToOrder[tmp]; 
            } else {
                matches.push(Match(currAsk.volume, price, currAsk.owner, flexBids[i].owner));
                tmp = currAsk.nex;
                remove(prevAsk, currAsk);
                currAsk = idToOrder[tmp]; 
            }


        }

        //What remains remains...
        
    }

    //TODO Magnus
    function settle(uint256 _consumed, uint256 _timestamp) onlyInState(2) onlySmartMeters(){

    }

    //TODO Magnus time controlled
    function determineCompPrice() {

    }

    //Constructor
  function Etherex(address _certificateAuthority) {

    identities[_certificateAuthority] = 1;
    idCounter = 1;

  }
  
 


}


   
