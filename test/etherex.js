//Initialization
var NUM_ADDRESSES = 100;

var eth = web3.eth;


contract('Etherex', function(accounts) {
  
  eth.defaultAccount = accounts[0];


  it("Basic accounts balance test, every account has some ether", function(done) {

    for(var i = 0; i < accounts.length; i++) {
        assert(eth.getBalance(accounts[i]) > 0, "The account " + accounts[i] + " does not have a balance > 0");
    }    
    done();

  });



  it("The contract should be deployed to the blockchain", function(done) {
    //Initialize the contract
    var etherex = Etherex.deployed();
    assert.isTrue(etherex != undefined);
    done();
  });


  describe("#submitBid", function() {

    it("User should be able to submit", function(done){

        done();

    })

  });


  describe("#submitAsk", function() {

    it("User should be able to submit", function(done){

        done();

    })

  });


describe("#submitReserveAsk", function() {

    it("User should be able to submit", function(done){

        done();

    })

  });


describe("#matching", function() {

    it("Matching should be done correctly (dependant on the algorithm)", function(done){

        done();

    })

  });

describe("#updateState", function() {

    it("State should update correctly dependant on blocks", function(done) {

        done();
    

    });


})

describe("#determineReservePrice", function() {

    it("Correctness of determining the reserve price", function(done) {

        done();
    

    });


});

describe("#settle", function() {

    it("Correctness of settleing", function(done) {

        done();
    

    });


})



});
