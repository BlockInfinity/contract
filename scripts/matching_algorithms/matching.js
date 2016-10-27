//Algorithm tests in javascript
//you can write tests here, just require the defined algorithm, example already supplied

var matching_alg = require('./acc_matching');

matching_alg.submitBid(10, 20, 123445);
matching_alg.submitAsk(10, 20, 123435);


matching_alg.submitFlexBid(10, 20, 123)



console.log("Printing flex bids: ");
console.log(matching_alg.flexBids);


NUM_TEST_BIDS = 1000;
NUM_TEST_ASKS = 1000;
NUM_TEST_FLEXBIDS = 1000;

MAX_PRICE = 1000;
MIN_PRICE = 10;

MAX_VOLUME = 1000;
MIN_VOLUME =  1;


function randV() {
    return Math.random() * (MAX_VOLUME - MIN_VOLUME) + MIN_VOLUME;
}

function randP() {
    return Math.random() * (MAX_PRICE - MIN_PRICE) + MIN_PRICE;
}


var asks = [];
var bids = [];
var flexBids = [];
var addressCounter = 0;


//Generating test data
for(var i = 0; i < NUM_TEST_ASKS; i++) {
    matching_alg.submitAsk(randP(), randV(), addressCounter++); 
}

for(var i = 0; i < NUM_TEST_BIDS; i++) {
    matching_alg.submitBid(randP(), randV(), addressCounter++); 
}

for(var i = 0; i < NUM_TEST_FLEXBIDS; i++) {
    matching_alg.submitFlexBid(randV(), addressCounter++); 
}


//For benchmarking
var start = Date.now();

matching_alg.matching();
var end = Date.now()  -start;
console.log("################################################################################");
console.log("Time: " + end + " milliseconds");
delete matching_alg;
delete asks;
delete bids;
delete flexBids;
delete addressCounter;

