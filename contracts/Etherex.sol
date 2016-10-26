pragma solidity ^0.4.2;

import "Token.sol";

contract Etherex {

    struct Trade {
      uint256 volume;
      uint256 price;
      Order ask;
      Order bid;
    }
    
    enum OrderType {Ask, Bid}
    struct Order {

        address owner;
        uint256 id;
        uint256 nex;
        uint256 volume;
        uint256 price;
        //Ask or bid order
        OrderType typ;
        bool notNull;
    }
    

    mapping (uint256 => Order) idToOrder;
    mapping (address => address) userToSmartMeter;
    
    Order rootAsk;
    Order rootBid;
    Trade [] trades;


    address[] public certificateAuthorities;
    address[] public smartmeters;
    address[] public users;


    // modifiers

    modifier onlySmartMeters(address _sm){
      bool notFound = true;
        for (uint256 i = 0; i<smartmeters.length; i++){
              if(smartmeters[i] == _sm){
                notFound = false;
              }
        }  
        if (notFound) throw;
        _;
    }

    modifier onlyUsers(address _user){
      bool notFound = true;
        for (uint256 i = 0; i<users.length; i++){
              if(users[i] == _user){
                notFound = false;
              }
        }  
        if (notFound) throw;
        _;
    }

    modifier onlyCertificateAuthorities(address _ca){
      bool notFound = true;
        for (uint256 i = 0; i<certificateAuthorities.length; i++){
              if(certificateAuthorities[i] == _ca){
                notFound = false;
              }
        }  
        if (notFound) throw;
        _;
    }


    // Register Functions
    
    function register_smartmeter(address sm) onlyCertificateAuthorities(msg.sender){
      if (msg.sender != CA) throw;
      smartmeters.push(sm);
    }

    function buy(uint256 _price, uint256 _amount) onlyUsers(msg.sender){
      
    }

    function sell(uint256 _price, uint256 _amount) onlyUsers(msg.sender){

    } 


    function settle(uint256 consumed) onlySmartMeters(msg.sender){

    }


    
    //Next function
    function n(Order order) internal returns(Order){
        return idToOrder[order.nex];
    
    }
    
    function bind(Order prev, Order order, Order nex) internal {
        prev.nex = order.id;
        order.nex = nex.id;
    }  
    
    function addBidOrder(Order order) internal{
        
        Order memory iter = rootAsk;
        Order memory prev;
        uint256 boughtVolume = 0;
        //Scan through asks to find passing, currently one bid can be satisfied with
        //at most one ask from this algorithm
        while(iter.notNull) {
           
           if(iter.price <= order.price && order.volume <= iter.volume) {
              //TODO Create trade  
              //Reduce ask volume by volume in trade
              iter.volume -= order.volume;
              //Return because bid is satisfied
              return;
           } else {
                prev = iter;
                iter = n(iter);
           }
           
       }
       //If the bid was not satisfied, add it to the bid list
       iter = rootAsk;
       prev = Order(0,0,0,0,0, OrderType.Bid, false);
       while(iter.notNull) {
           if(iter.price < order.price || iter.price == order.price && iter.volume < order.volume) {
               break;
           } else {
               prev = iter;
               iter = n(iter);
           }
       }
       bind(prev, order, iter);
        
        
    }
    
    //Add and when possible match
    function addAskOrder(Order order) internal returns (bool) {
        Order memory iter = rootBid;
        Order memory prev;
        //Scan through bids
        while(iter.notNull || order.volume != 0) {
           
           if(iter.price >= order.price && order.volume >= iter.volume) {
              //TODO Create trade  
              //Reduce by volume in trade
              order.volume -= iter.volume;
              
           } else {
                prev = iter;
                iter = n(iter);
           }
           
       }
       //If there is something left, add it to the ask orders list
        if(order.volume > 0) {
           iter = rootAsk;
           prev = Order(0,0,0,0,0, OrderType.Ask, false);
           while(iter.notNull) {
               if(iter.price < order.price || iter.price == order.price && iter.volume < order.volume) {
                   break;
               } else {
                   prev = iter;
                   iter = n(iter);
               }
           }
           bind(prev, order, iter);
        }
    }
    
  
    //Returns next after removed
    function removeAskOrder(Order order) internal returns (Order){
        
        
    }
    
    //Returns next after removed
    function removeBidOrder(Order order) internal returns (Order){
        
        
    }
    
 
    

    //Constructor
  function Etherex(address _certificateAuthority) {

    certificateAuthorities.push(_certificateAuthority);
    //Initialize array ... is not needed

  }
  
 


}


   
