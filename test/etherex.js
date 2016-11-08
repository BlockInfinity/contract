//Initialization
var NUM_ADDRESSES = 100;

var eth = web3.eth;
var bidOrders = {};
var percentCertificateAuthorities = 0.01;
var percentValidAccounts = 0.8

var certificateAuthorities = [];
var smartMeters = [];
var users = [];
var validAccounts = [];
var invalidAccounts;


contract('Etherex', function(accounts) {
  
  //Initialization of accounts
  eth.defaultAccount = accounts[0];
  certificateAuthorities = accounts.slice(0, percentCertificateAuthorities * accounts.length);
  accounts = accounts.slice(percentCertificateAuthorities * accounts.length, accounts.length);
  //80% valid smart meter-account pairs
  validAccounts = accounts.slice(0, percentValidAccounts*accounts.length);
  smartMeters = accounts.slice(0, accounts.length * 0.5);
  users = accounts.slice(accounts.length * 0.5, accounts.length);

 it("The contract should be deployed to the blockchain", function(done) {
    //Initialize the contract
    var etherex = Etherex.deployed();
    assert(etherex != undefined);
    done();
  });


  it("Register certificate authorities", function(done) {

    var etherex = Etherex.deployed();

    for(var i = 0; i < certificateAuthorities.length; i++) {
        etherex.registerCertificateAuthority(certificateAuthorities[i], {from: accounts[0]})
    }

    done();

  });


    it("Register smart meters with users (valid)", function(done) {

        //Certificate authority registers
        var etherex = Etherex.deployed();
        for(var i = 0; i < smartMeters.length;i++) {
            etherex.registerSmartMeter(smartMeters[i], users[i], {from: certificateAuthorities[0]});
        }
        done();
    }); 


    it("Register smart meters with users (invalid), this should not be able to happen", function(done) {

        //The regitrator is not a CA
        var etherex = Etherex.deployed();
        for(var i = 0; i < 4;i++) {
            //Fail test when a submit succeeds
            etherex.registerSmartMeter(smartMeters[i], users[i], {from: users[i]}).
            then(function() {assert(false)}).catch(function(err){});
        }
        done();
  }); 


  it.skip("Basic accounts balance test, every account has some ether", function(done) {

    for(var i = 0; i < accounts.length; i++) {
        assert(eth.getBalance(accounts[i]) > 0, "The account " + accounts[i] + " does not have a balance > 0");
        break;
    }    
    done();

  });

  it("#submitBid access test", function(done) {
    var etherex = Etherex.deployed();

    etherex.submitBid(10,12,{from:users[0]}).then(function(){
        //It is ok
        assert(true);
    }).catch(function(err) {
        assert(false, "A valid user was not able to submit.")
    });

    etherex.submitBid(10,12,{from:smartMeters[0]}).then(function(){
        //It is not ok
        assert(false, "A smart meter was able to submit.")
    }).catch(function(err) {
        assert(true);
    });

    //TODO adding random bids from random users
    done();
  });


  it("#submitBid storage check", function(done) {
    var etherex = Etherex.deployed();
    //TODO adding random bids from random users
    console.log(etherex.minBid);
    done();
  });

  it("#submitAsk access test", function(done) {

    var etherex = Etherex.deployed();
    etherex.submitAsk(10,12,{from:users[0]}).then(function(){
        //It is ok
        assert(true);
    }).catch(function(err) {
        assert(false, "A valid user was not able to submit.")
    });

    etherex.submitAsk(10,12,{from:smartMeters[0]}).then(function(){
        //It is not ok
        assert(false, "A smart meter was able to submit.")
    }).catch(function(err) {
        assert(true);
    });

    //TODO adding random asks from random users
    done();

  });

  it.skip("#submitReserveAsk access test", function(done) {

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
