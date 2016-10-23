
    contract Etherex {
        Market[] markets;

        struct Market{
          uint256 id;
          bytes32 name;
          address addr;
          uint256 last_price;
          address owner;
          uint256 blockNumber;
          bytes32 lowest_ask_id;
          bytes32 highest_bid_id;

          mapping (bytes32 => Trade_id) ask_orderbook;
          mapping (bytes32 => Trade_id) bid_orderbook;

        }
        struct Trade_id{
          bytes32 id;
          bytes32 next_id;
          bytes32 prev_id;
        }
        struct Trade {
          bytes32 typ;
          uint256 amount;
          uint256 price;
          uint256 market_id;
          bytes32 id;
          address owner;
          uint256 blockNumber;
        }
        struct BalanceSt {
          uint256 available;
          uint256 trading;
        }

        mapping (bytes32 => Trade) trades;
        mapping (address => mapping (uint256 => BalanceSt)) public balances;
        mapping (bytes32 => uint256) markets_name;
        mapping (address => uint256) markets_id;

        uint256 public next_market_id = 0;

        uint256 public fees;
        Token public token;
        Market m;

        // #################################################################################################################################################
        // ################################ test section ###################################################################################################
        //##################################################################################################################################################


        function test_add_market(address addr, bytes32 name) {

          markets.push(Market(next_market_id,name,addr,1,msg.sender,block.number,0,0));
          balances[msg.sender][next_market_id].available = 5000000;


          next_market_id +=1;
          token = Token(addr);
          Refresh(2);
        }

        function getMarketAddress(uint256 market_id) constant returns (address rv){
          return markets[next_market_id-1].addr;
        }

        function getAvailableBalance(uint256 market_id) constant returns (uint256 rv){
          return balances[msg.sender][market_id].available;
        }


        uint256[] bidQuotes;
        uint256[] bidAmounts;
        function getBidOrders(uint256 market_id) constant returns (uint256[] rv1,uint256[] rv2) {
          bytes32 id_iter_bid = markets[market_id].highest_bid_id;
          bidQuotes = rv1;
          bidAmounts = rv2;

          while (trades[id_iter_bid].amount != 0){
            bidAmounts.push(trades[id_iter_bid].amount);
            bidQuotes.push(trades[id_iter_bid].price);
            id_iter_bid = markets[market_id].bid_orderbook[id_iter_bid].next_id;
          }

          return(bidQuotes,bidAmounts);
        }

        uint256[] askQuotes;
        uint256[] askAmounts;
        function getAskOrders(uint256 market_id) constant returns (uint256[] rv1,uint256[] rv2){
          askQuotes = rv1;
          askAmounts = rv2;
          bytes32 id_iter_ask = markets[market_id].lowest_ask_id;
          while (trades[id_iter_ask].amount != 0){
            askQuotes.push(trades[id_iter_ask].price);
            askAmounts.push(trades[id_iter_ask].amount);
            id_iter_ask = markets[market_id].ask_orderbook[id_iter_ask].next_id;
          }

          return(askQuotes,askAmounts);
        }

        uint256[] ids;
        bytes32[] names;


        function test_getMarketNames() constant returns (uint256[] rv1, bytes32[] rv2){

             for (uint256 x=0;x < markets.length;x++){
                ids.push(markets[x].id);
                names.push(markets[x].name);
            }
            return(ids,names);
        }

        function ytest_getMarket(uint256 id)constant returns(uint256 rv1){
            return(markets[id].id);
        }




        // ##################################################################################################################################################
        // ###################### end of test section #######################################################################################################
        // ##################################################################################################################################################
        // end of test section


        // id gelöscht ÄNDERUNG
        function add_market(address addr, bytes32 name) {

          markets.push(Market(next_market_id,name,addr,0,msg.sender,block.number,0,0));

          next_market_id +=1;
          token = Token(addr);
          Refresh(2);
        }


      // parameter direkt genommen ÄNDERUNG
      // warum der umweg über die transferFrom Funktion, warum nicht direkt.
    function deposit(uint256 amount,uint256 market_id) returns (uint256 rv){
            token = Token(markets[market_id]); 
            if (token.transferFrom(msg.sender, this, amount)){
              uint256 balance = balances[msg.sender][market_id].available;
              balance = balance + amount;
              balances[msg.sender][market_id].available = balance;
              Refresh(2);
              return token.balanceOf(this);
            }
        }

    function check_trade(uint256 amount, uint256 price, uint256 market_id) returns (bool rv){
      if (amount <= 0 || price <=0 || market_id <0) return false;
      return true;
    }

    function check_fees(address sender, uint256 value) returns (bool rv){
      if (value == fees) return true;
      if (value > fees){
        sender.send(value - fees);
        return true;
      }
      return false;
    }

    function buy(uint256 amount, uint256 price, uint256 market_id) payable {
      uint256 rv;
      if (!check_trade(amount, price, market_id)) throw;
      rv = ((amount*price) * 10000000000000000);
      if (msg.value < rv) throw;
      if (msg.value >= rv){
        msg.sender.send(msg.value - rv);
      }

      save_trade("BID",amount,price,market_id);
      trade(market_id);
      Refresh(2);
    }


    function sell(uint256 amount, uint256 price, uint256 market_id){
      if (!check_trade(amount, price, market_id)) throw;
      //if (!check_fees(msg.sender, msg.value)) throw;

      uint256 balance = balances[msg.sender][market_id].available;
      if (balance > amount){
        save_trade("ASK",amount,price,market_id);
        balances[msg.sender][market_id].available -= amount;
        balances[msg.sender][market_id].trading += amount;
      }
      trade(market_id);
      Refresh(2);
    }


    function min(uint a, uint b) returns (uint) {
        if (a < b) return a;
        else return b;
    }


    bytes32 public prev;
    bytes32 public id;
    bytes32 public next;

  // todo: available balance does not change.

    function save_trade(bytes32 _typ,uint256 _amount, uint256 _price, uint256 _market_id) returns(bytes32 rv){
     // inititialisieren zwecks test
     bytes32 typ = _typ;
     uint256 amount = _amount;
     uint256 market_id = _market_id;
     uint256 price = _price;
     // end initilialisieren

     bytes32 trade_id = sha3(typ,amount,price,market_id,msg.sender,block.number);

     if (trades[trade_id].id != 0) throw;

       trades[trade_id].typ = typ;
       trades[trade_id].amount = amount;
       trades[trade_id].price = price;
       trades[trade_id].market_id = market_id;
       trades[trade_id].owner = msg.sender;
       trades[trade_id].blockNumber = block.number;
       trades[trade_id].id = trade_id;


       bool positionFound = false;
       bytes32 id_iter;
       if (typ == "ASK"){
         bytes32 lowest_ask_id = markets[market_id].lowest_ask_id;
         markets[market_id].ask_orderbook[trade_id].id = trade_id;
         if (trades[lowest_ask_id].price == 0 || price < trades[lowest_ask_id].price){     // fälle wo ask ganz vorne dran gehangen wird
           if (trades[lowest_ask_id].price == 0) {
             markets[market_id].lowest_ask_id  = trade_id;
           } else {
             markets[market_id].ask_orderbook[trade_id].next_id = markets[market_id].lowest_ask_id ;
             markets[market_id].lowest_ask_id = trade_id;
           }
         } else {
            id_iter = lowest_ask_id;
           while (!positionFound){ // ask wird iwo zwischen gesetzt
             if (price < trades[markets[market_id].ask_orderbook[id_iter].next_id].price) {
               markets[market_id].ask_orderbook[trade_id].next_id = markets[market_id].ask_orderbook[id_iter].next_id;
               markets[market_id].ask_orderbook[trade_id].prev_id = id_iter;
               markets[market_id].ask_orderbook[markets[market_id].ask_orderbook[id_iter].next_id].prev_id = trade_id;
               markets[market_id].ask_orderbook[id_iter].next_id = trade_id;
               positionFound = true;
             }
             if (markets[market_id].ask_orderbook[id_iter].next_id == 0){ // ask wird ganz hinten dran gehangen
               markets[market_id].ask_orderbook[trade_id].prev_id = id_iter;
               markets[market_id].ask_orderbook[id_iter].next_id = trade_id;
               positionFound = true;
             }
             id_iter = markets[market_id].ask_orderbook[id_iter].next_id;
           }
         }
       prev = markets[market_id].ask_orderbook[trade_id].prev_id;
       id = markets[market_id].ask_orderbook[trade_id].id;
       next = markets[market_id].ask_orderbook[trade_id].next_id;
       }

       if (typ == "BID"){
         bytes32 highest_bid_id = markets[market_id].highest_bid_id;
         markets[market_id].bid_orderbook[trade_id].id = trade_id;
         if (trades[highest_bid_id].price == 0 || price > trades[highest_bid_id].price){     // fälle wo bid ganz vorne dran gehangen wird
           if (trades[highest_bid_id].price == 0) {
             markets[market_id].highest_bid_id  = trade_id;
           } else {
             markets[market_id].bid_orderbook[trade_id].next_id = markets[market_id].highest_bid_id ;
             markets[market_id].highest_bid_id = trade_id;
           }
         } else {
            id_iter = highest_bid_id;
           while (!positionFound){ // bid wird iwo zwischen gesetzt
             if (price > trades[markets[market_id].bid_orderbook[id_iter].next_id].price) {
               markets[market_id].bid_orderbook[trade_id].next_id = markets[market_id].bid_orderbook[id_iter].next_id;
               markets[market_id].bid_orderbook[trade_id].prev_id = id_iter;
               markets[market_id].bid_orderbook[markets[market_id].bid_orderbook[id_iter].next_id].prev_id = trade_id;
               markets[market_id].bid_orderbook[id_iter].next_id = trade_id;
               positionFound = true;
             }
             if (markets[market_id].bid_orderbook[id_iter].next_id == 0){ // bid wird ganz hinten dran gehangen
               markets[market_id].bid_orderbook[trade_id].prev_id = id_iter;
               markets[market_id].bid_orderbook[id_iter].next_id = trade_id;
               positionFound = true;
             }
             id_iter = markets[market_id].bid_orderbook[id_iter].next_id;
           }
         }
       prev = markets[market_id].bid_orderbook[trade_id].prev_id;
       id = markets[market_id].bid_orderbook[trade_id].id;
       next = markets[market_id].bid_orderbook[trade_id].next_id;
       }

    }

    // umbennnen
    function remove_trade(bytes32 trade_id, uint256 market_id){

      bytes32 flag = "BID";


      if (trades[trade_id].typ == flag){

          if (markets[market_id].highest_bid_id == trade_id){
            markets[market_id].highest_bid_id = markets[market_id].bid_orderbook[trade_id].next_id;
            bytes32 highest = markets[market_id].highest_bid_id;

          }
      bytes32 prev_id = markets[market_id].bid_orderbook[trade_id].prev_id;
      bytes32 next_id = markets[market_id].bid_orderbook[trade_id].next_id;

      markets[market_id].bid_orderbook[prev_id].next_id = next_id;
      markets[market_id].bid_orderbook[next_id].prev_id = prev_id;

      markets[market_id].bid_orderbook[trade_id].id = 0;
      markets[market_id].bid_orderbook[trade_id].next_id = 0;
      markets[market_id].bid_orderbook[trade_id].prev_id = 0;
      } else {
        if (markets[market_id].lowest_ask_id == trade_id){
          markets[market_id].lowest_ask_id = markets[market_id].ask_orderbook[trade_id].next_id;
          bytes32 lowest = markets[market_id].highest_bid_id;

        }

        prev_id = markets[market_id].ask_orderbook[trade_id].prev_id;
        next_id = markets[market_id].ask_orderbook[trade_id].next_id;

        markets[market_id].ask_orderbook[prev_id].next_id = next_id;
        markets[market_id].ask_orderbook[next_id].prev_id = prev_id;

        markets[market_id].ask_orderbook[trade_id].id = 0;
        markets[market_id].ask_orderbook[trade_id].next_id = 0;
        markets[market_id].ask_orderbook[trade_id].prev_id = 0;
      }


      trades[trade_id].typ = 0;
      trades[trade_id].amount = 0;
      trades[trade_id].price = 0;
      trades[trade_id].market_id = 0;
      trades[trade_id].id = 0;
      trades[trade_id].blockNumber = 0;


    }


    /*
    todo: matching based on order volume
    */


    function trade(uint256 market_id) {

      bool bid_matched = false;
      bool ask_matched = false;
      bool orderiszero = false;
      bytes32 id_iter_bid = markets[market_id].highest_bid_id;
      bytes32 id_iter_ask = markets[market_id].lowest_ask_id;
      uint256 fill;
      uint256 payback;
      uint256 profit;

      bytes32 id_iter_ask_helper;
      bytes32 id_iter_bid_helper;


          //if (block.number <= trades[id_iter_ask].blockNumber) continue;   // todo: da trade im Zuge von buy() aufgerufen wird, kann es nicht funktionieren
          while (trades[id_iter_bid].price >= trades[id_iter_ask].price ) {  // es wird mehr geboten als gefragt
            if (trades[id_iter_bid].amount == 0) return;
            if (trades[id_iter_ask].amount == 0) return;
            //bid_matched = false; // ??
           if (trades[id_iter_bid].amount > trades[id_iter_ask].amount){
              fill =  trades[id_iter_ask].amount;
              trades[id_iter_bid].amount -= fill;
              balances[trades[id_iter_ask].owner][market_id].trading -= fill;
              balances[trades[id_iter_bid].owner][market_id].available += fill;

              profit = fill * trades[id_iter_ask].price * 10000000000000000;
              trades[id_iter_ask].owner.send(profit);

              if (trades[id_iter_bid].price > trades[id_iter_ask].price){
                payback = fill * (trades[id_iter_bid].price - trades[id_iter_ask].price) * 10000000000000000;
                trades[id_iter_bid].owner.send(payback);
              }

              id_iter_ask_helper = id_iter_ask;
              id_iter_ask = markets[market_id].ask_orderbook[id_iter_ask].next_id;
              remove_trade(id_iter_ask_helper,market_id);
            } else if (trades[id_iter_bid].amount == trades[id_iter_ask].amount) {

              fill =  trades[id_iter_bid].amount;
              balances[trades[id_iter_ask].owner][market_id].trading -= fill;
              balances[trades[id_iter_bid].owner][market_id].available += fill;
              profit = fill * trades[id_iter_ask].price * 10000000000000000;
              trades[id_iter_ask].owner.send(profit);

              if (trades[id_iter_bid].price > trades[id_iter_ask].price){
                payback = fill * (trades[id_iter_bid].price - trades[id_iter_ask].price) * 10000000000000000;
                trades[id_iter_bid].owner.send(payback);
              }
              id_iter_ask_helper = id_iter_ask;
              id_iter_bid_helper = id_iter_bid;
              id_iter_ask = markets[market_id].ask_orderbook[id_iter_ask].next_id;
              id_iter_bid = markets[market_id].bid_orderbook[id_iter_bid].next_id;
              remove_trade(id_iter_ask_helper,market_id);
              remove_trade(id_iter_bid_helper,market_id);
            } else if (trades[id_iter_bid].amount < trades[id_iter_ask].amount) {
              fill =  trades[id_iter_bid].amount;
              trades[id_iter_ask].amount -= fill;
              balances[trades[id_iter_ask].owner][market_id].trading -= fill;
              balances[trades[id_iter_bid].owner][market_id].available += fill;
              profit = fill * trades[id_iter_ask].price * 10000000000000000;
              trades[id_iter_ask].owner.send(profit);

              if (trades[id_iter_bid].price > trades[id_iter_ask].price){
                payback = fill * (trades[id_iter_bid].price - trades[id_iter_ask].price) * 10000000000000000;
                trades[id_iter_bid].owner.send(payback);
              }
              id_iter_bid_helper = id_iter_bid;
              id_iter_bid = markets[market_id].bid_orderbook[id_iter_bid].next_id;
              remove_trade(id_iter_bid_helper,market_id);
            }
          }



    }

    function test_orders() payable{    // beachte da ich hier kaufe und transaktionsgebühren bezahle stets value mitgeben
           test_add_market(address(1234), "asdf");
           sell(1,4,0);

           sell(1,6,0);
           buy(2,6,0);
           sell(10,7,0);


           }
    event Refresh(uint256 x);



    function bytes32ToString (bytes32 data) constant internal returns (string) {
      bytes memory bytesString = new bytes(32);
      for (uint j=0; j<32; j++) {
          byte char = byte(bytes32(uint(data) * 2 ** (8 * j)));
          if (char != 0) {
              bytesString[j] = char;
          }
      }
      return string(bytesString);
  }

    }

