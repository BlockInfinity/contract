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
  
  eth.defaultAccount = accounts[0];
  certificateAuthorities = accounts.slice(0, percentCertificateAuthorities * accounts.length);
  accounts = accounts.slice(percentCertificateAuthorities * accounts.length, accounts.length);
  //80% valid smart meter-account pairs
  validAccounts = accounts.slice(0, percentValidAccounts*accounts.length);
  smartMeters = accounts.slice(0, accounts.length * 0.5);
  users = accounts.slice(accounts.length * 0.5, accounts.length);


  describe("Register certificate authorities", function() {

    var etherex = Etherex.deployed();
    for(var i = 0; i < certificateAuthorities.length; i++) {
        etherex.registerCertificateAuthority(certificateAuthorities[i], {from: accounts[0]})
    }

  });


  it("Basic accounts balance test, every account has some ether", function(done) {

    for(var i = 0; i < accounts.length; i++) {
        assert(eth.getBalance(accounts[i]) > 0, "The account " + accounts[i] + " does not have a balance > 0");
        break;
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
