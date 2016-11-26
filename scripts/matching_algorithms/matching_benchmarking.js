//Algorithm tests in javascript
//you can write tests here, just require the defined algorithm, example already supplied

var matching_alg = require('./acc_matching');




NUM_TEST_BIDS = 10000;
NUM_TEST_ASKS = 10000;
NUM_TEST_FLEXBIDS = 10000;

MAX_PRICE = 10000;
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

//For benchmarking
start = Date.now();

//Generating test data
for(var i = 0; i < NUM_TEST_ASKS; i++) {
    matching_alg.submitAsk(randP(), randV(), addressCounter++); 
}

stop = Date.now();
end = stop - start;
console.log("################################################################################");
console.log("Time adding asks: " + end + " milliseconds");

start = Date.now()
for(var i = 0; i < NUM_TEST_BIDS; i++) {
    matching_alg.submitBid(randP(), randV(), addressCounter++); 
}
stop = Date.now();
end = stop - start;
console.log("################################################################################");
console.log("Time adding bids: " + end + " milliseconds");


start = Date.now()
for(var i = 0; i < NUM_TEST_FLEXBIDS; i++) {
    matching_alg.submitFlexBid(randV(), addressCounter++); 
}

stop = Date.now();
end = stop - start;
console.log("################################################################################");
console.log("Time adding flex bids: " + end + " milliseconds");



//Set logging to false for more precise benchmarking, or to true to see matches
matching_alg.log = false;

//For benchmarking
var start = Date.now();
matching_alg.matching();
var end = Date.now() -start;
console.log("################################################################################");
console.log("Time matching: " + end + " milliseconds");

delete matching_alg;
delete asks;
delete bids;
delete flexBids;
delete addressCounter;
