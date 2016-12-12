pragma solidity ^0.4.2;

contract Etherex {

    // turns off modifiers 
    bool DEBUG = true;

    // ########################## Variables for user management  #########################################################

    // users' money balances
    mapping(uint256 => int256) colleteral;
    mapping(address => uint256) identities;
    // 1: CA, 2: producer, 3: consumer  
    uint8[] userType;
    uint256 currentUserId;
    uint256 numUsers;

    // ########################## Variables for state/period management  ##################################################

    uint256 currentPeriod;
    uint8 currState;
    uint256 startBlock;

    // ########################## Variables for saveorder function  #######################################################

    struct Order {
        uint256 id;
        uint256 next;
        address owner;
        uint256 volume;
        int256 price;
    }
    // contains all orders 
    Order[] orders;
    // pointers to the best prices 
    uint256 minAsk;
    uint256 maxBid;
    uint256 orderIdCounter;

    // ########################## Variables for matching function  ########################################################  

    mapping(uint256 => mapping(address => uint256)) matchedAskOrders;
    mapping(uint256 => mapping(address => uint256)) matchedBidOrders;
    mapping(uint256 => int256) matchingPrices;
    uint256[] currMatchedAskOrderMapping;
    uint256[] currmatchedBidOrders;

    // ########################## Variables for reserve function  ########################################################

    uint256 MIN_RESERVE_ASK_VOLUME = 1000;  
    uint256 MIN_RESERVE_BID_VOLUME = 1000; 
    mapping (uint256 => mapping (address =>  uint256)) public matchedAskReserveOrders;   // maps volume to currentPeriod and owner
    mapping (uint256 => mapping (address =>  uint256)) public matchedBidReserveOrders;   // maps volume to currentPeriod and owner
    mapping (uint256 => int256) public askReservePrices;                        // maps reserveprice to currentPeriod
    mapping (uint256 => int256) public bidReservePrices;

    // ########################## Variables for settle function  #########################################################

    struct SettleUserData {
        address user;
        uint256 smVolume;
    }
    struct settleData{
        mapping(address => bool) alreadySettled;
        uint256 settleCounter;
        uint256 sumProduced;
        uint256 sumConsumed;
        uint256 excess;
        uint256 lack;
        SettleUserData[] askSmData;
        SettleUserData[] bidSmData;
    }
    mapping(uint256 => settleData) public settleMapping;


    // ###################################################################################################################
    // ########################## Modifiers ##############################################################################
    // ###################################################################################################################

    modifier onlyCertificateAuthorities() {
        if (userType[identities[msg.sender]] != 0 && !DEBUG) throw;
        _;
    }
    modifier onlyProducers() {
        if (userType[identities[msg.sender]] != 1 && !DEBUG) throw;
        _;
    }
    modifier onlyConsumers() {
        if (userType[identities[msg.sender]] != 2 && !DEBUG) throw;
        _;
    }


    // ###################################################################################################################
    // ########################## Constructor ############################################################################
    // ###################################################################################################################

    function Etherex() {
        currentUserId = 0;
        numUsers = 0;
        currentPeriod = 0;
        startBlock = block.number;
        currState = 0;
        minAsk = 0;
        maxBid = 0;
        Order memory blankOrder = Order(0, 0, 0, 0, 0);
        orders.push(blankOrder);
        orderIdCounter = 1;
    }

    // ###################################################################################################################
    // ########################## Registration  ##########################################################################
    // ###################################################################################################################

    function registerCertificateAuthority(address _user) {
        identities[_user] = currentUserId++;
        userType.push(0);
    }

    function registerProducer(address _user) onlyCertificateAuthorities() {
        identities[_user] = currentUserId++;
        userType.push(1);
        numUsers++;
    }

    function registerConsumer(address _user) onlyCertificateAuthorities() {
        identities[_user] = currentUserId++;
        userType.push(2);
        numUsers++;
    }


    // ###################################################################################################################
    // ########################## state management  ######################################################################
    // ###################################################################################################################

    /*
    !!! executed whenever contract is called !!!  
    Annahme: Es wird mindestens eine Order alle 12 Sekunden eingereicht.  
    inStateZero: Normale Orders können abgegeben werden. Dauer von -1/3*t bis +1/3*t (hier t=15)
    inStateOne: Nachdem normale orders gematched wurden, können ask orders für die Reserve abgegeben werden. Dauer von 1/3*t bis 2/3*t (hier t=15).
    */
    // todo(ms): this should be called automatically/internally, now public for testing purposes
    function nextState() /* internal */ {
        if (currState == 0) {
            // if matching success, move to state 1
            if (matching()) {
                minAsk = 0;
                maxBid = 0;
                // move on to state 1
                currState = 1;
            // matching failed due to empty orderbook,
            // init and just increment currentPeriod
            } else {
                init();
            }
        } else if (currState == 1) {
            // compute reserve prices
            determineReserveAskPrice();
            determineReserveBidPrice();
            init();
            // move on to state 0
            currState = 0;
        } else {
            throw;
        }
    }

    function init() internal {
        minAsk = 0;
        maxBid = 0;
        // reset orders
        delete orders;
        Order memory blankOrder = Order(0, 0, 0, 0, 0);
        orders.push(blankOrder); // insert blanko order into orders because idx=0 is a placeholder
        orderIdCounter = 1;
        // increment period
        currentPeriod++;
        // update start block
        startBlock = block.number;
    }
  
    function inStateZero() internal returns (bool rv) {
        if (block.number < (startBlock + 25)) {
            return true;
        }
        return false;
    }

    function inStateOne() internal returns (bool rv) {
        if (block.number >= (startBlock + 25) && block.number < (startBlock + 50)) {
            return true;
        }
        return false;
    }

    // ###################################################################################################################
    // ########################## user interace  #########################################################################
    // ###################################################################################################################

    function submitBid(int256 _price, uint256 _volume) onlyConsumers() {
        saveOrder("BID", _price, _volume);
    }

    function submitAsk(int256 _price, uint256 _volume) onlyProducers() {
        saveOrder("ASK", _price, _volume);
    } 


    // ###################################################################################################################
    // ########################## CORE LOGIC  ############################################################################
    // ###################################################################################################################
    

    function saveOrder(bytes32 _type, int256 _price, uint256 _volume) internal {
        if (!(_type == "ASK" || _type == "BID")) {
            throw;
        }
        if (_volume == 0) {
            throw;
        }

        // allocate new order
        Order memory currOrder = Order(orderIdCounter++, 0, msg.sender, _volume, _price);
 
        // store maxBid or minAsk
        uint256 bestOrder;

        // type = ask -> ascending
        // type = bid -> descending
        int8 ascending = 0;

        if (_type == "ASK") {
            bestOrder = minAsk;
            ascending = 1;  
        } else if (_type == "BID") {
            bestOrder = maxBid;
            ascending = -1;
        } else {
            throw;
        }

        // save and return if this the first bid
        if (bestOrder == 0) {
            orders.push(currOrder);
            bestOrder = currOrder.id;
            
        } else {
            // iterate over list till same price encountered
            uint256 curr = bestOrder;
            uint256 prev = 0;
            while ((ascending * currOrder.price) > (ascending * orders[curr].price) && curr != 0) {
                prev = curr;
                curr = orders[curr].next;
            }

            // update pointer 
            currOrder.next = curr;
    
            // insert order
            orders.push(currOrder);
    
            // curr_order added at the end
            if (currOrder.next == bestOrder) {
                bestOrder = currOrder.id;
                
            // at least one prev order exists
            } else {
                orders[prev].next = currOrder.id;
            }
        }
        
        // update maxBid or minAsk
        if (_type == "ASK") {
            minAsk = bestOrder;      
        } else if (_type == "BID") {
            maxBid = bestOrder;        
        }
    }

    // match bid and ask orders
    function matching() internal returns(bool) {
        // no orders submitted at all or at least one ask and bid missing
        // return if no orders or no match possible since minAsk greater than maxBid
        if (orders.length == 1) {
            matchingPrices[currentPeriod] = 2**128-1;
            return false;
        }
        if (minAsk == 0 || maxBid == 0 || (orders[minAsk].price > orders[maxBid].price)) {
            matchingPrices[currentPeriod] = 2**128-1;
            return false;
        }

        uint256 cumAskVol = 0;
        uint256 cumBidVol = 0;

        int256 matchingPrice = orders[minAsk].price;
        bool isMatched = false;
        bool outOfAskOrders = false;

        uint256 currAsk = minAsk;
        uint256 currBid = maxBid;

        uint256 next;

        delete currMatchedAskOrderMapping;
        delete currmatchedBidOrders;

        while (!isMatched) {
            // cumulates ask volume for fixed price level
            // Todo(ms): Optimize: Precompute cumulated volume for orders with same same price,
            // then use here instead of iterating over it
            while (currAsk != 0 && orders[currAsk].price == matchingPrice) {
                cumAskVol += orders[currAsk].volume;
                currMatchedAskOrderMapping.push(orders[currAsk].id);
                next = orders[currAsk].next;
                if (next != 0) {
                    currAsk = next;
                } else {
                    outOfAskOrders = true;
                    break;
                }
            }

            // cumulates ask volume for order price greater then or equal to matching price
            // Todo(ms): Optimize: Precompute cumulated volume for orders with same same price,
            // then use here instead of iterating over it
            while (orders[currBid].price >= matchingPrice) {
                cumBidVol += orders[currBid].volume;
                currmatchedBidOrders.push(orders[currBid].id);
                currBid = orders[currBid].next;
                if (currBid == 0) {
                    break;
                }
            }

            // enough ask volume sufficient to satisfy bids or no more asks left at all
            if (cumAskVol >= cumBidVol || outOfAskOrders) {
                isMatched = true;
                // set the matching price
                matchingPrices[currentPeriod] = matchingPrice;
            // need another iteration, get more ask volume, also increase matching price
            } else {
                matchingPrice = orders[currAsk].price;
                currBid = maxBid;
                cumBidVol = 0;
                // Todo(ms): do not delete, just traverse in reverse order and reuse existing array
                delete currmatchedBidOrders;
            }
        }

        // calculates how much volume each producer can release into 
        // the grid within the next interval
        if (cumBidVol < cumAskVol) {
            for (uint256 i=0; i<currMatchedAskOrderMapping.length; i++) {

                matchedAskOrders[currentPeriod][orders[currMatchedAskOrderMapping[i]].owner] 
                = (cumBidVol * orders[currMatchedAskOrderMapping[i]].volume) / cumAskVol;
            }
            for (uint256 ii=0; ii<currmatchedBidOrders.length; ii++) {
                matchedBidOrders[currentPeriod][orders[currmatchedBidOrders[ii]].owner] 
                = orders[currmatchedBidOrders[ii]].volume;
            }
        } else {
            for (uint256 j=0; j<currmatchedBidOrders.length; j++) {
                matchedBidOrders[currentPeriod][orders[currmatchedBidOrders[j]].owner] 
                = (cumAskVol * orders[currmatchedBidOrders[j]].volume) / cumBidVol;
            }
            for (uint256 jj=0; jj<currMatchedAskOrderMapping.length; jj++) {
                matchedAskOrders[currentPeriod][orders[currMatchedAskOrderMapping[jj]].owner] 
                = orders[currMatchedAskOrderMapping[jj]].volume;
            }
        }

        return true;
    }
    
    // determines price till volume of MIN_RESERVE_ASK_VOLUME is accumulated  
    function determineReserveBidPrice() internal returns(bool) {
        if (maxBid == 0) {
            bidReservePrices[currentPeriod] = 2**128-1;
            return false;
        }
        uint256 cumBidReserveVol = 0;
        int256 reserveBidPrice = orders[maxBid].price;
        bool isFound = false;
        uint256 bidIterId = maxBid;

        while (!isFound) {
            while (orders[bidIterId].price == reserveBidPrice) {
                uint256 volume = orders[bidIterId].volume;
                address owner = orders[bidIterId].owner;

                cumBidReserveVol += volume;
                matchedBidReserveOrders[currentPeriod][owner] = volume;

                uint256 nextOrder = orders[bidIterId].next;

                if (nextOrder != 0) {
                    bidIterId = nextOrder;
                } else {
                    isFound = true;
                    break;
                }
            }

            if (cumBidReserveVol >= MIN_RESERVE_ASK_VOLUME) {
                isFound = true;
            } else {
                reserveBidPrice = orders[bidIterId].price;
            }
        }
        bidReservePrices[currentPeriod] = reserveBidPrice;
        return true;
    }

    // determines price till volume of MIN_RESERVE_BID_VOLUME is accumulated  
    function determineReserveAskPrice() internal returns(bool) {
        if (minAsk == 0) {
            askReservePrices[currentPeriod] = 2**128-1;
            return false;
        }
        uint256 cumAskReserveVol = 0;
        int256 reserve_price = orders[minAsk].price;
        bool isFound = false;
        uint256 ask_id_iter = minAsk;

        while (!isFound) {
            while (orders[ask_id_iter].price == reserve_price) {
                uint256 volume = orders[ask_id_iter].volume;     // redundant, aber übersichtlicher
                address owner = orders[ask_id_iter].owner;

                cumAskReserveVol += volume;
                matchedAskReserveOrders[currentPeriod][owner] = volume;

                uint256 next_order = orders[ask_id_iter].next;
                if (next_order != 0) {
                    ask_id_iter = next_order;
                } else {
                    isFound = true;
                    break;     // Mindestmenge an Energie konnten nicht erreicht werden, da selbst beim höchsten Preis nicht ausreichend Energie vorhanden war
                }
            }

            if (cumAskReserveVol >= MIN_RESERVE_BID_VOLUME) {
              isFound = true;
            } else {
              reserve_price = orders[ask_id_iter].price;
            }        
        }
        askReservePrices[currentPeriod] = reserve_price;  
        return true;     
    }

    // ###################################################################################################################
    // ########################## testing area  ##########################################################################
    // ###################################################################################################################

    // function test_settle_AskReserve(){
    //     address _user = address(123);
    //     identities[_user] = 1;
    //     currentPeriod = 1;
    //     matchedAskReserveOrders[currentPeriod][_user] = 100;
    //     settle(2,200,currentPeriod++);
    // }          

    // function test_settle_AskNormal(){
    //     address _user = address(123);
    //     identities[_user] = 1;
    //     currentPeriod = 1;
    //     matchingPrices[currentPeriod] = 10;
    //     bidReservePrices[currentPeriod] = 5;
    //     askReservePrices[currentPeriod] = 20;
    //     matchedAskOrders[currentPeriod][_user] = 100;
    //     settle(2,100,currentPeriod++);          
    // }  

    // function test_settle_NoAskOrderEmitted(){
    //     address _user = address(123);
    //     identities[_user] = 1;
    //     currentPeriod = 1;
    //     matchingPrices[currentPeriod] = 10;
    //     bidReservePrices[currentPeriod] = 5;
    //     askReservePrices[currentPeriod] = 20;
    //     settle(2,100,currentPeriod++);          
    // }  

    // function test_settle_BidReserve(){
    //     registerSmartMeter(address(123),address(123));
    //     address _user = address(123);
    //     currentPeriod = 1;
    //     matchedBidReserveOrders[currentPeriod][_user] = 100;
    //     settle(address(123),1,200,currentPeriod++);      
    // }       

    // function test_settle_BidNormal(){
    //     registerSmartMeter(address(123),address(123));
    //     address _user = address(123);
    //     currentPeriod = 1;
    //     matchingPrices[currentPeriod] = 10;
    //     bidReservePrices[currentPeriod] = 5;
    //     askReservePrices[currentPeriod] = 20;
    //     matchedBidOrders[currentPeriod][_user] = 100;
    //     settle(address(123),1,200,currentPeriod++);          
    // }  

    // function test_settle_NoBidOrderEmitted(){
    //     registerSmartMeter(address(123),address(123));
    //     address _user = address(123);
    //     identities[_user] = 1;
    //     currentPeriod = 1;
    //     matchingPrices[currentPeriod] = 10;
    //     bidReservePrices[currentPeriod] = 5;
    //     askReservePrices[currentPeriod] = 20;
    //     settle(address(123),1,100,currentPeriod++);          
    // }  



    event InAskReserve(uint256 , uint256 );
    event InAskNormal(int256, uint256, uint256,int256);
    event InNoAskOrder(int256, uint256, uint256,int256);

    event InBidReserve(uint256, uint256);
    event InBidNormal(int256, uint256, uint256,int256);
    event InNoBidOrder(int256, uint256, uint256,int256);

    event log(string msg);
    event check(bool);

    // for debug purposes not defined in function 
    uint256 public ordered;
    uint256 public offered;
    uint256 public diff;
    uint256 public userId;

    // ###################################################################################################################
    // ########################## end of testing area  ###################################################################
    // ###################################################################################################################

   
    // Settlement function called by smart meter
    // _type=1 for Consumer and _type=2 for Producer
    // for debug purposes not included 
    function settle(address _user, int8 _type, uint256 _volume, uint256 _period) onlyProducers() onlyConsumers() {
        if (!(_type == 1 || _type == 2)) {
            throw;
        }
        // currentPeriod needs to be greater than the _period that should be settled 
        if (!(currentPeriod >= _period)) {
            throw;    
        }

        // smart meter has already sent data for this particular user
        if (settleMapping[_period].alreadySettled[_user]) {
            throw;
        }
        // for debug purposes not defined here
        ordered = 0;
        offered = 0;
        diff = 0;
        userId = identities[_user];
    
        // producer 
        if (_type == 1) {
            // case 1: reserve ask guy
            if (matchedAskReserveOrders[_period][_user] != 0) {          // TODO: matchedReserveOrders needs to be splitted in matchedAskReserveOrders and matchedBidReserveOrders
                // Smart Meter Daten werden vorerst gespeichert für die spätere Abrechnung in der endSettle Funktion
                settleMapping[_period].askSmData.push(SettleUserData(_user,_volume));
                settleMapping[_period].sumProduced += _volume; 
    
                // for debug pruposes 
                log("in ask reserve");
                InAskReserve(settleMapping[_period].askSmData[0].smVolume, settleMapping[_period].sumProduced);
    
            // case 2: normal ask order guy
            } else if (matchedAskOrders[_period][_user] != 0) {
                offered = matchedAskOrders[_period][_user];
                 // _user hat zu wenig Strom eingespeist
                if (_volume < offered) {
                      // für den eingespeisten Strom bekommt er den matching preis bezahlt
                    colleteral[userId] += int256(_volume) * matchingPrices[_period];
                    // die Differenzt muss er nachkaufen für den teuren reserveAskPrice
                    diff = offered - _volume;
                    colleteral[userId] -= (int256(diff) * askReservePrices[_period]);
                    // rechnerisch ist nun -diff strom zu wenig im netz
                    settleMapping[_period].lack += diff; 
                    log("has produced too less");
                } else if (_volume > offered) {
                    // Für das Ordervolumen bekommt er den matchingpreis bezahlt
                    colleteral[userId] += int256(offered) * matchingPrices[_period];
                    // Für die Differenz bekommt er den niedrigen reserveBidPrice bezahlt
                    diff = _volume - offered;
                    colleteral[userId] += int256(diff) * bidReservePrices[_period];
                    // rechnerisch ist diff strom zu viel im Netz
                    settleMapping[_period].excess += diff;
                    log("has produced too much");
    
                    // _user hat genau so viel strom eingepeist wie abgemacht
                } else {
                    colleteral[userId] += int256(_volume) * matchingPrices[_period];
                     log("has produced exactly the offered amount");
                }
                // wird auf undefined gesetzt damit selbiger _user nicht nochmals settlen kann
                // matchedAskOrders[_period][_user] = undefined;
    
                // Volumen was von den normalen _usern erzeugt wurde
                settleMapping[_period].sumProduced += _volume;
    
                // for debug purposes              
                InAskNormal(colleteral[userId],_volume,offered,matchingPrices[_period]);
       
            // case 3: no order emitted
            } else {
                // track collaterial
                colleteral[userId] += int256(_volume) * bidReservePrices[_period];
                // track excess
                settleMapping[_period].excess += _volume;
                // volumen was von den normalen _usern erzeugt wurde
                settleMapping[_period].sumProduced += _volume;
                // wird auf undefined gesetzt damit selbiger _user nicht nochmals settlen kann
                //matchedAskOrders[_period][_user] = undefined;
                log("No ask order emitted");
                InNoAskOrder(colleteral[userId],_volume,0,bidReservePrices[_period]);
            }
        }
    
        // consumer
        if (_type == 2) {
            // case 1: reserve bid guy
            if (matchedBidReserveOrders[_period][_user] != 0) {
                log("in bid reserve");
                // smart meter daten werden vorerst gespeichert für die spätere Abrechnung in der endSettle Funktion
                ordered = matchedBidReserveOrders[_period][_user];
                // process later
                settleMapping[_period].bidSmData.push(SettleUserData(_user, _volume));
                // Volumen was von den reserve Leute vom Netz genommen wurde, weil zu viel Strom vorhanden war
                settleMapping[_period].sumConsumed += _volume; 
                // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
                // matchedBidReserveOrderMapping[_period][user] = undefined;
                InBidReserve(settleMapping[_period].bidSmData[0].smVolume, settleMapping[_period].sumConsumed);
    
            // case 2: normal bid order guy 
            } else if (matchedBidOrders[_period][_user] != 0) {
                ordered = matchedBidOrders[_period][_user];
                // user hat zu viel Strom verbraucht
                if (_volume > ordered) {
                    // das Ordervolumen kann noch zum matching price bezahlt werden
                    colleteral[userId] -= int256(ordered) * matchingPrices[_period];
                    // die Differenz muss für den höheren reserveAskPrice bezahlt werden
                    diff = _volume - ordered;
                    colleteral[userId] -= (int256(diff) * askReservePrices[_period]);
                    // rechnerisch ist nun -diff Strom zu wenig im Netz
                    settleMapping[_period].lack += diff; 
                    log("has consumed too much");  
    
                // user hat zu wenig Strom verbraucht
                } else if (_volume < ordered) {
                    // das Ordervolumen muss bezahlt werden für den matching price
                    colleteral[userId] -= (int256(ordered) * matchingPrices[_period]);
                    // die differenz kann für den schlechten reserveBidPrice verkauft werden
                    diff = ordered - _volume;
                    colleteral[userId] += (int256(diff) * bidReservePrices[_period]);
                    // recherisch ist nun +diff zu viel Strom im Netz
                    settleMapping[_period].excess += diff;
                    log("has consumed too less");
    
                // user hat genau so viel verbraucht wie zuvor vereinbart
                } else {
                    colleteral[userId] -= (int256(_volume) * matchingPrices[_period]);
                    log("has consumed just right");
                }
                // was die normalen user verbaucht haben
                settleMapping[_period].sumConsumed += _volume;
                // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
                //matchedBidOrders[_period][user] = undefined;
                InBidNormal(colleteral[userId],_volume,ordered,matchingPrices[_period]);
    
            // case 3: No Order emitted
            } else {
                // track collaterial
                colleteral[userId] -= (int256(_volume) * askReservePrices[_period]);
                // track lack
                settleMapping[_period].lack += _volume;
                // volumen was die normalen usern verbraucht haben
                settleMapping[_period].sumConsumed += _volume;
                // wird auf undefined gesetzt damit selbiger user nicht nochmals settlen kann
                //matchedBidOrders[_period][user] = undefined;
                log("no bid order emitted");
                InNoBidOrder(colleteral[userId],_volume,0,matchingPrices[_period]);
            }
        }
    
        // increment settle counter
        settleMapping[_period].settleCounter += 1;
    
        // set user as settled for currentPeriod
        settleMapping[_period].alreadySettled[_user] = true;
    
        // todo: endSettle Funktion muss beim Eingang des letzten smart meter datensatzes automatisch ausgeführt werden
        if (settleMapping[_period].settleCounter == numUsers) {
            log("before endSettle");
            endSettle(_period);
        }
    }

    // ###################################################################################################################
    // ########################## testing area  ##########################################################################
    // ###################################################################################################################


    // function test_endSettle_lack() {
    //     address consumer = address(123);
    //     address reserveGuy = address(1234);
    //     registerSmartMeter(consumer,consumer);
    //     registerSmartMeter(address(1234),address(1234));
    //     address _user = address(123);
    //     currentPeriod = 1;
    //     matchingPrices[currentPeriod] = 10;
    //     bidReservePrices[currentPeriod] = 5;
    //     askReservePrices[currentPeriod] = 20;
    //     matchedBidOrders[currentPeriod][_user] = 100;
    //     matchedAskReserveOrders[currentPeriod][reserveGuy]=200;
    //     currentPeriod++;
    //     settle(reserveGuy,2,100,1); 
    //     settle(consumer,1,200,1);         
    // }  


    event ShowDiff(int256);

    // ###################################################################################################################
    // ########################## end of testing area ####################################################################
    // ###################################################################################################################

    function endSettle(uint256 _period) internal {
        int256 diff = int256(settleMapping[_period].excess) - int256(settleMapping[_period].lack);
        int256 smVolume = 0;
        address user;
        uint256 userId;
    
        ShowDiff(diff);
        
        if (diff >= 0) {
            for (uint256 i = 0; i<settleMapping[_period].bidSmData.length; i++) {   
                log("is in for loop with positive diff"); 
                smVolume = int256(settleMapping[_period].bidSmData[i].smVolume);
                if (smVolume == 0) continue;
                user = settleMapping[_period].bidSmData[i].user;
                userId = identities[user];
                if (smVolume <= diff) {
                    colleteral[userId] -= smVolume * bidReservePrices[_period];
                    diff -= smVolume;
                } else {
                    colleteral[userId] -= diff * bidReservePrices[_period];
                    colleteral[userId] -= (smVolume - diff) * askReservePrices[_period];
                    diff = 0;
                }
            }
        }
    
        smVolume = 0;
    
        if (diff <= 0) {
            diff = -1 * diff;
            for (uint256 j = 0;j<settleMapping[_period].askSmData.length;j++) {
                    log("is in for loop with negative diff"); 
                    smVolume = int256(settleMapping[_period].askSmData[i].smVolume);
                    if (smVolume == 0) continue;
                    user = settleMapping[_period].askSmData[i].user;
                    userId = identities[user];
                    if (smVolume <= diff) {
                        colleteral[userId] += smVolume * askReservePrices[_period];
                        diff -= smVolume;
                    } else {
                        colleteral[userId] += diff * askReservePrices[_period];
                        colleteral[userId] += (smVolume - diff) * bidReservePrices[_period];
                        diff = 0;
                    }
            }
        }
    
        int256 moneyLeft = 0;
        for (uint256 k=0; k<currentUserId-1; k++) {
            if (userType[k] == 1 || userType[k] == 2) {
                moneyLeft += colleteral[k];
            }
        }
        ShowDiff(moneyLeft);
        int256 shareOfEachUser = moneyLeft / int256(numUsers);
        shareOfEachUser = shareOfEachUser * -1;
        ShowDiff(shareOfEachUser);
        for (uint256 l=0; l<currentUserId-1; l++) {
            if (userType[l] == 1 || userType[l] == 2) {
                colleteral[l] += shareOfEachUser;
            }
        }
    }


    // ###################################################################################################################
    // ########################## READ-ONLY FUNCTIONS ####################################################################
    // ###################################################################################################################
 
    function getOrderIdLastOrder() constant returns(uint256) {
        if (orderIdCounter == 1) {
            return 0;
        }        
        return orderIdCounter-1;
    }


    int256[] bidQuotes;
    uint256[] bidAmounts;
    function getBidOrders() constant returns (int256[] rv1, uint256[] rv2) {
        uint256 id_iter_bid = maxBid;
        bidQuotes = rv1;
        bidAmounts = rv2;
        while (orders[id_iter_bid].volume != 0) {
            bidAmounts.push(orders[id_iter_bid].volume);
            bidQuotes.push(orders[id_iter_bid].price);
            id_iter_bid = orders[id_iter_bid].next;
        }
        return (bidQuotes, bidAmounts);
    }


    int256[] askQuotes;
    uint256[] askAmounts;
    function getAskOrders() constant returns (int256[] rv1, uint256[] rv2) {
        uint256 id_iter_ask = minAsk;
        askQuotes = rv1;
        askAmounts = rv2;
        while (orders[id_iter_ask].volume != 0) {
            askQuotes.push(orders[id_iter_ask].price);
            askAmounts.push(orders[id_iter_ask].volume);
            id_iter_ask = orders[id_iter_ask].next;
        }
        return (askQuotes, askAmounts);
    }

    function getOrderId(uint256 _orderId) constant returns(uint256) {
        return orders[_orderId].id;
    }

    function getOrderNext(uint256 _orderId) constant returns(uint256) {
        return orders[_orderId].next;
    }

    function getOrderPrice(uint256 _orderId) constant returns(int256) {
        return orders[_orderId].price;
    }

    function getOrderVolume(uint256 _orderId) constant returns(uint256) {
        return orders[_orderId].volume;
    }

    function getMatchedAskOrders(uint256 _period, address _owner) constant returns(uint256) {
        return matchedAskOrders[_period][_owner];
    }

    function getMatchedBidOrders(uint256 _period, address _owner) constant returns(uint256) {
        return matchedBidOrders[_period][_owner];
    }

    function getMatchingPrices(uint256 _period) constant returns(int256) {
        return matchingPrices[_period];
    }

    function getLack(uint256 _period) constant returns(uint256) {
        return settleMapping[_period].lack;
    }

    function getExcess(uint256 _period) constant returns(uint256) {
        return settleMapping[_period].excess;
    }

    function getCollateral(address _owner) constant returns(int256) {
        uint256 userId = identities[_owner];
        return colleteral[userId];
    }

    function getSumConsumed(uint256 _period) constant returns(uint256) {
        return settleMapping[_period].sumConsumed;
    }

    function getSumProduced(uint256 _period) constant returns(uint256) {
        return settleMapping[_period].sumProduced;
    }

    function getSumOfColleteral() constant returns(int256) {
        int256 sum = 0;
        for (uint256 i=0; i<currentUserId-1; i++) {
            sum += colleteral[i];
        }
        return sum;
    }

    function getEnergyBalance(uint256 _period) constant returns(uint256) {
        uint256 sumReserveConsumed = 0;
        for (uint256 i=0; i<settleMapping[_period].bidSmData.length; i++) {
            sumReserveConsumed += settleMapping[_period].bidSmData[i].smVolume;
        }
        uint256 sumReserveProduced = 0;
        for (uint256 j=0; j<settleMapping[_period].askSmData.length; j++) {
            sumReserveProduced += settleMapping[_period].askSmData[j].smVolume;
        }
        return (settleMapping[_period].sumConsumed + sumReserveConsumed) 
            - (settleMapping[_period].sumProduced + sumReserveProduced);
    }

    function reset() {
        startBlock = block.number;
        currState = 0;
        minAsk = 0;
        maxBid = 0;
        // reset orders
        delete orders;
        Order memory blankOrder = Order(0, 0, 0, 0, 0);
        orders.push(blankOrder);
        orderIdCounter = 1;
        // reset collateral
        for (uint256 i=0; i<currentUserId-1; i++) {
            colleteral[i] = 0;
        }
    }

}
    