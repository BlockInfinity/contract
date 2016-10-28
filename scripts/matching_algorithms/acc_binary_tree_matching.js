/*

Global TODOS:

Modifiers for time dependant operations.
Communication with smart meter.
The order of the functions has to be determined.

*/

 
function log(msg) {
    if(this.log) {
        log(msg)
    }
}


function addToTree(_order, tree){


    var ind = 1
    while(ind < tree.length && tree[ind].id != 0) {
        if(order.price <= tree[ind].price) {
            ind = ind*2;
        } else {
            ind = ind*2 +1;
        }
    }

    while(ind >= tree.length) {
        tree.push({id: 0});
    }
    tree[ind] = _order;
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

    addToTree(bid, false);
    
}

//Calculate min ask to satisfy flexible bids on the way?
function submitAsk( _price, _volume, _sender) {
    
    var  ask = {};
    ask.volume = _volume;
    ask.id = this.idCounter++;
    ask.price = _price;
    ask.owner = _sender;
    
    log("Submitted ask: " + JSON.stringify(ask));

    addToTree(ask, false);
    
}


function flexBidMatching(i, _indAsk) {

    if(_indAsk >= this.askTree.length || i >= flexBids.length || this.flexBidVolume == 0) {
        return i;
    }
    i = flexBidMatching(i, _indAsk*2);

    if(_indAsk >= this.askTree.length || i >= flexBids.length || this.flexBidVolume == 0) {
        return;
    }

    //Logic over this node
    var currAsk = this.askTree[_indAsk];
    if(currAsk.volume > this.flexBids[i].volume) {
        this.matches.push({volume: this.flexBids[i].volume, price: price, askOwner: currAsk.owner, bidOwner: this.flexBids[i].owner});
        currAsk.volume -= this.flexBids[i].volume;
        i++;
    }else if(currAsk.volume < this.flexBids[i].volume) {
        this.matches.push({volume: currAsk.volume, price: price, askOwner: currAsk.owner, bidOwner: this.flexBids[i].owner});
        this.flexBids[i].volume -= currAsk.volume;
    } else {
        this.matches.push({volume: currAsk.volume, price: price, askOwner: currAsk.owner, bidOwner: this.flexBids[i].owner});
        i++;
    }    

    flexBidMatching(i, _indAsk*2+1);

}


function normalBidMatching(_indBid, _indAsk) {


    if(_indAsk >= this.askTree.length || _indBid >= this.bidTree.length) {
        return false;
    } 

    //Advance to the most possible left of both trees
    if(!normalBidMatching(_indBid*2, _indAsk*2)) 
        if(!normalBidMatching(_indBid*2, _indAsk))
            if(!normalBidMatching(_indBid, _indAsk*2))

    currAsk = this.askTree[_indAsk];
    currBid = this.bidTree[_indBid];
    if(currAsk.volume > currBid.volume) {
        this.matches.push({volume: currBid.volume, price: currAsk.price, askOwner: currAsk.owner, bidOwner: currBid.owner});
        currAsk.volume -= currBid.volume;
    }else if(currAsk.volume < currBid.volume) {
        this.matches.push({volume: currAsk.volume, price: price, askOwner: currAsk.owner, bidOwner: currBid.owner});
        currBid.volume -= currAsk.volume;
    } else {
        matches.push({volume: currAsk.volume, price: price, askOwner: currAsk.owner, bidOwner: this.flexBids[i].owner});
        tmp = currAsk.nex;
    }

    if(!normalBidMatching(_indBid*2+1, _indAsk*2+1)) 
        if(!normalBidMatching(_indBid*2+1, _indAsk))
            if(!normalBidMatching(_indBid, _indAsk*2+1))

    return true;
}



//TODO Magnus Has to be automatically called from the blockchain
//Currently without accumulating, does accumulating make sense?
function matching() {
    
    var stackAsk = [];
    var stackBid = []
    
    //Solve flexible bids first
    var  askVolume = 0;
    var  price = 0;
    while(askVolume < this.flexBidVolume) {
        askVolume += currAsk.volume;
        price = currAsk.price;
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
    askTree: [],
    bidTree: [],
    iter: 0,
    flexBidVolume: 0,
    matches: [],
    flexBids: [],
    idCounter: 1,
    log: false,

}



