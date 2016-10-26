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
    
    //state times in minutes
    uint256[] stateTimes = [10, 10, 10 ,10];
    uint8[] states = [0,1,2,3];
    

    enum OrderType {Ask, Bid}
    struct Order {
        address owner;
        uint256 volume;
        uint256 price;
        //Ask or bid order
        OrderType typ;
    }
    
    uint8 public currState;
    
    mapping (address => address) userToSmartMeter;
    
    Order bestAsk;
    Order bestBid;
    Match [] matches;


    mapping (address => bool) certificateAuthorities;
    mapping (address => bool) public smartmeters;

    //Balance for consumed energy that was not bought through orders
    //if the balance is below 0, then send event that turns of energy
    mapping (address => uint256) public collateral;


    // modifiers
    modifier onlySmartMeters(){
        if (!smartmeters[msg.sender]) throw;
        _;
    }
    modifier onlyUsers(){
        if (userToSmartMeter[msg.sender] == 0) throw;
        _;
    }
    modifier onlyCertificateAuthorities(){
        if (!certificateAuthorities[msg.sender]) throw;
        _;
    }
    
    modifier onlyInState(uint8 state) {
        if(state != currState) throw;
        _;
    }
    
    //TODO Function that has to update the state based on time
    function updateState() internal {
            
    }
    
    // Register Functions
    function registerSmartmeter(address sm) onlyCertificateAuthorities(){
      smartmeters[sm] = true;
    }


    function submitBestBid(uint256 _volume) onlyInState(0) onlyUsers(){
      
    }

    function submitBid(uint256 _price, uint256 _amount) onlyInState(0) onlyUsers(){
      
    }

    function submitAsk(uint256 _price, uint256 _amount) onlyInState(0) onlyUsers(){

    } 

    function submitCompAsk(uint256 _price, uint256 _amount) onlyInState(0) onlyUsers(){

    } 


    //TODO Magnus Has to be automatically called from the blockchain
    function matching() onlyInState(1){

    }

    //TODO Magnus
    function settle(uint256 _consumed, uint256 _timestamp) onlyInState(2) onlySmartMeters(){

    }

    //TODO Magnus time controlled
    function determineCompPrice() {

    }


    
  
    function addOrder() internal{

    }

    function removeOrder() internal{

    } 

    //Constructor
  function Etherex(address _certificateAuthority) {

    certificateAuthorities[_certificateAuthority] = true;
    

  }
  
 


}


   
