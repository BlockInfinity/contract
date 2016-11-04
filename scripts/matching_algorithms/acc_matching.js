/*

Global TODOS:

Modifiers for time dependant operations.
Communication with smart meter.
The order of the functions has to be determined.

*/

 
function n(bid) {
    return bid.nex;
}

function bind(prev, curr, next) {
    prev.nex = curr;
    curr.nex = next;
}

function log(msg) {
    if(this.log) {
        log(msg)
    }
}

//If this is called, just put it on the beginning on the list
function submitFlexBid(_volume, _sender) {
    var bid = {};
    bid.volume = _volume;
    bid.owner = _sender;
    this.flexBidVolume +=_volume;
    this.flexBids.push(bid);
    log("Submitted flex bid: " + JSON.stringify(bid));
}

function submitBid(_price, _volume, _sender) {
    
    var bid = {};
    bid.volume = _volume;
    bid.id = this.idCounter++;
    bid.price = _price;
    bid.owner = _sender;

    log("Submitted bid: " + JSON.stringify(bid));

    if(this.minBid.id == 0) {
        this.minBid = bid;
        return;
    }
    
    //Iterate over list till same price encountered
    var curr = this.minBid;
    var prev = {};
    prev.nex = this.minBid;
    while(curr && bid.price > curr.price) {
        curr=n(curr);
        prev = n(prev);
    }
    bind(prev, bid, curr);
    if(bid.nex == this.minBid) {
        this.minBid == bid;
    }


}

//Calculate min ask to satisfy flexible bids on the way?
function submitAsk( _price, _volume, _sender) {
    
    var  ask = {};
    ask.volume = _volume;
    ask.id = this.idCounter++;
    ask.price = _price;
    ask.owner = _sender;
    
    log("Submitted ask: " + JSON.stringify(ask));


    if(this.minAsk.id == 0) {
        this.minAsk = ask;
        return;
    }
    
    //Iterate over list till same price encountered
    var curr = this.minAsk;
    var prev = {};
    prev.nex = this.minAsk;
    while(curr && ask.price > curr.price) {
        curr=n(curr);
        prev = n(prev);
        this.minAsk.id++
    }
    prev.nex = ask;
    ask.nex = curr;
    if(ask.nex == this.minAsk) {
        this.minAsk == ask;
    }
} 

function countAsks() {
    var curr = this.minAsk;
    counter = 0;
    while(curr){
        counter++;
        curr = n(curr);
    }
    return counter;
}

function remove(prev, curr) {
    prev.nex = curr.nex;
    delete curr;
}
//TODO Magnus Has to be automatically called from the blockchain
//Currently without accumulating, does accumulating make sense?
function matching() {
    
    var prevBid = {id: 0};
    var prevAsk = {id: 0};
    var currBid = this.minBid;
    var currAsk = this.minAsk;
    var tmp;
    
    //Solve flexible bids first
    var  askVolume = 0;
    var  price = 0;
    while(askVolume < this.flexBidVolume && currAsk) {
        askVolume += currAsk.volume;
        price = currAsk.price;
        currAsk = currAsk.nex;
    }
    currAsk = this.minAsk;
    //Wouldnt it be fair that all of them go to the aftermarket
    //instead of only the last one? Round-robin too much?
    for(var i = 0; i < this.flexBids.length && currAsk; i++ ) {
        if(currAsk.volume > this.flexBids[i].volume) {
            this.matches.push({volume: this.flexBids[i].volume, price: price, askOwner: currAsk.owner, bidOwner: this.flexBids[i].owner});
            currAsk.volume -= this.flexBids[i].volume;
        }else if(currAsk.volume < this.flexBids[i].volume) {
            this.matches.push({volume: currAsk.volume, price: price, askOwner: currAsk.owner, bidOwner: this.flexBids[i].owner});
            this.flexBids[i].volume -= currAsk.volume;
            tmp = currAsk.nex;
            remove(prevAsk, currAsk);
            currAsk = tmp; 
            i-=1;
        } else {
            this.matches.push({volume: currAsk.volume, price: price, askOwner: currAsk.owner, bidOwner: this.flexBids[i].owner});
            tmp = currAsk.nex;
            remove(prevAsk, currAsk);
            currAsk = tmp; 
        }
        log("Match: " + JSON.stringify(this.matches[this.matches.length-1]))
    }
    //Matching of bids and asks with fixed price
    //Iterate till you come to the end of ask or bid lists
    while(currAsk  && currBid) {

        //Round robin so that everyone gets something?
        if(currAsk.volume > currBid.volume) {
            this.matches.push({volume: currBid.volume, price: currAsk.price, askOwner: currAsk.owner, bidOwner: currBid.owner});
            currAsk.volume -= currBid.volume;
        }else if(currAsk.volume < currBid.volume) {
            this.matches.push({volume: currAsk.volume, price: price, askOwner: currAsk.owner, bidOwner: currBid.owner});
            currBid.volume -= currAsk.volume;
            tmp = currAsk.nex;
            remove(prevAsk, currAsk);
            currAsk = tmp; 
        } else {
            matches.push({volume: currAsk.volume, price: price, askOwner: currAsk.owner, bidOwner: this.flexBids[i].owner});
            tmp = currAsk.nex;
            remove(prevAsk, currAsk);
            currAsk = tmp; 
        }


    }

    //What remains remains...
    
}


module.exports = {

    submitFlexBid: submitFlexBid,
    submitBid: submitBid,
    submitAsk: submitAsk,
    matching: matching,
    count: countAsks,
    minAsk: {id: 0, price: 0},
    minBid: {id: 0, price: 0},
    flexBidVolume: 0,
    matches: [],
    flexBids: [],
    idCounter: 1,
    log: false,

}



