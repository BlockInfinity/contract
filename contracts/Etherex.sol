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


    // Register Functions
    function register_smartmeter(address sm) onlyCertificateAuthorities(){
      smartmeters[sm] = true;
    }


    function submitBestBid(uint256 _volume) onlyUsers(){
      
    }

    function submitBid(uint256 _price, uint256 _amount) onlyUsers(){
      
    }

    function submitAsk(uint256 _price, uint256 _amount) onlyUsers(){

    } 

    function submitCompAsk(uint256 _price, uint256 _amount) onlyUsers(){

    } 


    //TODO Magnus Has to be automatically called from the blockchain
    //TODO time controlled
    function matching() {

    }

    //TODO Magnus
    function settle(uint256 _consumed, uint256 _timestamp) onlySmartMeters(){

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


   
