contract('Etherex', function(accounts) {
    

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
