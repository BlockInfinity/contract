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
      Order ask;
      Order bid;
    }
    
    enum OrderType {Ask, Bid}
    struct Order {

        address owner;
        uint256 volume;
        uint256 price;
        //Ask or bid order
        OrderType typ;
    }
    

    mapping (address => address) userToSmartMeter;
    
    Order bestAsk;
    Order bestBid;
    Match [] matches;


    address public certificateAuthority;
    mapping (address => bool) public smartmeterExists;

    //Balance for consumed energy that was not bought through orders
    //if the balance is below 0, then send event that turns of energy
    mapping (address => uint256) public collateral;


    // modifiers
    //msg.sender inside of modifier?
    //TODO MVP
    modifier onlySmartMeters(address _sm){
      bool notFound = true;
        
        if (notFound) throw;
        _;
    }

    //TODO MVP
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

    //TODO MVP
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
    //TODO MVP
    function register_smartmeter(address sm) onlyCertificateAuthorities(msg.sender){
      if (msg.sender != CA) throw;
      smartmeters.push(sm);
    }


    function submitBestBid(uint256 _volume) onlyUsers(msg.sender){
      
    }

    function submitBid(uint256 _price, uint256 _amount) onlyUsers(msg.sender){
      
    }

    function submitAsk(uint256 _price, uint256 _amount) onlyUsers(msg.sender){

    } 

    function submitCompAsk(uint256 _price, uint256 _amount) onlyUsers(msg.sender){

    } 


    //TODO Magnus Has to be automatically called from the blockchain
    //TODO time controlled
    function matching() {

    }


    function settle(uint256 _consumed, uint256 _timestamp) onlySmartMeters(msg.sender){

    }

    //TODO time controlled
    function determineCompPrice() {

    }


    
  
    function addOrder() internal{

    }

    function removeOrder() internal{

    } 

    //Constructor
  function Etherex(address[] _certificateAuthority) {

    certificateAuthority = _certificateAuthority;

  }
  
 


}


   
