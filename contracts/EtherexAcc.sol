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


    //If this is called, just put it on the beginning on the list
    function submitFlexBidOrder(uint256 _volume) onlyInState(0) onlyUsers(){
    }


    // ################################ TEST ################################

    bytes32 lowest_ask_id;
    bytes32 highest_bid_id;
    
    mapping (bytes32 => Pointer) ask_orderbook;
    mapping (bytes32 => Pointer) bid_orderbook;
    mapping (bytes32 => Order) orders;

    struct Order{
        bytes32 typ;
        uint256 volume;
        uint256 price;
        bytes32 id;
        address owner;
        uint256 blockNumber;
    }

    struct Pointer{
        bytes32 id;
        bytes32 next_id;
    }

    /* 
    Modifiers ignored for test purposes (payable, onlyInState(0) onlyUsers())
    author: Magnus
    */
    function submitBidOrder(uint256 _price, uint256 _volume) {
        if (_volume <= 0 || _price <=0) throw;
        /*uint256 toPay;
        toPay = ((_volume*_price) * 10000000000000000);
        if (msg.value < toPay) throw;
        if (msg.value >= toPay){
            msg.sender.send(msg.value - toPay);
        }*/
        save_order("BID",_volume,_price);
    } 

    /* 
    Modifiers ignored for test purposes (onlyInState(0) onlyUsers())
    author: Magnus
    */
    function submitAskOrder(uint256 _price, uint256 _volume) {
        if (_volume <= 0 || _price <=0) throw;
        save_order("ASK",_volume,_price);
    }

    /*
    saves bid / ask orders based on best price
    author: Magnus
    */
    function save_order(bytes32 _typ,uint256 _volume, uint256 _price) internal returns(bytes32 rv){

        bytes32 order_id = sha3(_typ,_volume,_price,msg.sender,block.number);

        if (orders[order_id].id != 0) throw;

        orders[order_id].typ = _typ;
        orders[order_id].volume = _volume;
        orders[order_id].price = _price;
        orders[order_id].owner = msg.sender;
        orders[order_id].blockNumber = block.number;
        orders[order_id].id = order_id;


        bool positionFound = false;
        bytes32 id_iter;
        if (_typ == "ASK"){ 
            ask_orderbook[order_id].id = order_id;                  // oder_id kann schon gesetzt werden und next_id muss im folgenden bestimmt werden 
            if (orders[lowest_ask_id].price == 0) {                 // Fall 1: es sind noch keine orders vorhanden                    
                lowest_ask_id  = order_id;
            } else if (_price < orders[lowest_ask_id].price) {       // Fall 2: order wird vorne dran gehangen   
                ask_orderbook[order_id].next_id = lowest_ask_id;
                lowest_ask_id = order_id;              
            } else {                                                // Fall 3: aorder wird zwischendrin platziert
                id_iter = lowest_ask_id;
                while (!positionFound){ 
                    if (_price < orders[ask_orderbook[id_iter].next_id].price) {
                        ask_orderbook[order_id].next_id = ask_orderbook[id_iter].next_id;
                        ask_orderbook[id_iter].next_id = order_id;
                        positionFound = true;
                    }
                    if (ask_orderbook[id_iter].next_id == 0){       // Fall 4: order wird ganz hinten dran gehangen
                        ask_orderbook[id_iter].next_id = order_id;
                        positionFound = true;
                    }
                id_iter = ask_orderbook[id_iter].next_id;
                }
            }
        }

        if (_typ == "BID"){
        bid_orderbook[order_id].id = order_id;
            if (orders[highest_bid_id].price == 0) {
             highest_bid_id  = order_id;
            } else if (_price > orders[highest_bid_id].price){
             bid_orderbook[order_id].next_id = highest_bid_id ;
             highest_bid_id = order_id; 
            } else {
                id_iter = highest_bid_id;
                while (!positionFound){ 
                    if (_price > orders[bid_orderbook[id_iter].next_id].price) {
                        bid_orderbook[order_id].next_id = bid_orderbook[id_iter].next_id;
                        bid_orderbook[id_iter].next_id = order_id;
                        positionFound = true;
                    }
                    if (bid_orderbook[id_iter].next_id == 0){ 
                        bid_orderbook[id_iter].next_id = order_id;
                        positionFound = true;
                    }
                    id_iter = bid_orderbook[id_iter].next_id;
                }
            }
        }
    }

    /*
    Returns ordered list of bid orders 
    author: Magnus
    */
    uint256[] bidQuotes;
    uint256[] bidAmounts;
    function getBidOrders() constant returns (uint256[] rv1,uint256[] rv2) {
        bytes32 id_iter_bid = highest_bid_id;
        bidQuotes = rv1;
        bidAmounts = rv2;

        while (orders[id_iter_bid].volume != 0){
            bidAmounts.push(orders[id_iter_bid].volume);
            bidQuotes.push(orders[id_iter_bid].price);
            id_iter_bid = bid_orderbook[id_iter_bid].next_id;
        }

        return(bidQuotes,bidAmounts);
    }

     /*
    Returns ordered list of ask orders 
    author: Magnus
    */
    uint256[] askQuotes;
    uint256[] askAmounts;
    function getAskOrders() constant returns (uint256[] rv1,uint256[] rv2){
        askQuotes = rv1;
        askAmounts = rv2;
        bytes32 id_iter_ask = lowest_ask_id;
        while (orders[id_iter_ask].volume != 0){
            askQuotes.push(orders[id_iter_ask].price);
            askAmounts.push(orders[id_iter_ask].volume);
            id_iter_ask = ask_orderbook[id_iter_ask].next_id;
        }
        return(askQuotes,askAmounts);
    }
    

    //Producer can submit ask if he is able to supply two times the average needed volume of
    //electricity
    function submitReserveAsk(uint256 _price, uint256 _volume) onlyInState(1) onlyUsers(){

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

 

        while(!isMatched) {
            while (orders[id_iter_ask].price == ask_price){
                cumAskVol += orders[id_iter_ask].volume;
                id_iter_ask = ask_orderbook[id_iter_ask].next_id;
                ask_orders.push(id_iter_ask);
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
        return(ask_orders,bid_orders);
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


   