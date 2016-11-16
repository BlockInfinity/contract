'use strict';

const co = require('co');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
chai.use(chaiAsPromised);

const eth = web3.eth;

const PERCENTAGE_CERTIFICATE_AUTHORITIES = 0.05;
const PERCENTAGE_VALID_ACCOUNTS = 0.8;
const PERCENTAGE_SMART_METERS = 0.5;

contract('Etherex', function(accounts) {

  var certificateAuthorities;
  var smartMeters;
  var users;
  var validAccounts;
  var invalidAccounts;
  var etherex;

  beforeEach(function() {
    // default account
    eth.defaultAccount = accounts[0];
    // certificate authorities
    certificateAuthorities = accounts.slice(0, PERCENTAGE_CERTIFICATE_AUTHORITIES * accounts.length);
    // all acounts
    accounts = accounts.slice(PERCENTAGE_CERTIFICATE_AUTHORITIES * accounts.length, accounts.length);
    // valid accounts
    validAccounts = accounts.slice(0, PERCENTAGE_VALID_ACCOUNTS * accounts.length);
    // producers
    smartMeters = accounts.slice(0, PERCENTAGE_SMART_METERS * accounts.length);
    // consumers
    users = accounts.slice(PERCENTAGE_SMART_METERS * accounts.length, accounts.length);
    // set up etherex
    etherex = Etherex.deployed();
  });

  it('The contract should be deployed to the blockchain', function(done) {
    assert(etherex);
    done();
  });

  it('Register certificate authorities', function() {
    return expect(co(function*() {
      assert(accounts[0]);
      for (var i = 0; i < certificateAuthorities.length; i++) {
        assert(certificateAuthorities[i]);
        yield etherex.registerCertificateAuthority(certificateAuthorities[i], {from: accounts[0]});
      }
    })).not.to.be.rejected;
  });

  it('Register smart meters with users - should work', function() {
    return expect(co(function*() {
      assert(certificateAuthorities[0]);
      for (var i = 0; i < smartMeters.length; i++) {
        assert(smartMeters[i]);
        assert(users[i]);
        yield etherex.registerSmartMeter(smartMeters[i], users[i], {from: certificateAuthorities[0]});
      }
    })).not.to.be.rejected;
  });

  it('Register smart meters with users - should not work', function() {
    for (var i = 0; i < smartMeters.length; i++) {
      assert(users[0]);
      return expect(co(function*() {
        assert(smartMeters[i]);
        assert(users[i]);
        yield etherex.registerSmartMeter(smartMeters[i], users[i], {from: users[0]});
      })).to.be.rejected;
    }
  });

  it.skip('Basic accounts balance test, every account has some ether', function() {
    for (var i = 0; i < accounts.length; i++) {
      assert(eth.getBalance(accounts[i]) > 0, 'The account ' + accounts[i] + ' does not have a balance > 0');
    }
  });

  it('submit bids by consumers - should work', function() {
    for (var i = 0; i < users.length; i++) {
      return expect(co(function*() {
        yield etherex.submitBid(i, i, {from: users[i]});
      })).not.to.be.rejected;
    }
  });

  it('submit bids by producers - should not work', function() {
    for (var i = 0; i < smartMeters.length; i++) {
      return expect(co(function*() {
        yield etherex.submitBid(i, i, {from: smartMeters[i]});
      })).to.be.rejected;
    }
  });

  it('submit asks by producers - should work', function() {
    for (var i = 0; i < smartMeters.length; i++) {
      return expect(co(function*() {
        yield etherex.submitAsk(i, i, {from: smartMeters[i]});
      })).not.to.be.rejected;
    }
  });

  it('submit asks by consumers - should not work', function() {
    for (var i = 0; i < users.length; i++) {
      return expect(co(function*() {
        yield etherex.submitAsk(i, i, {from: users[i]});
      })).to.be.rejected;
    }
  });

  it('#submitBid storage check', function(done) {
    //TODO adding random bids from random users
    //console.log(etherex.minBid);
    done();
  });

  describe('#matching', function() {
    it('Matching should be done correctly (dependant on the algorithm)', function(done) {
        done();
      });
  });

  describe('#updateState', function() {
    it('State should update correctly dependant on blocks', function(done) {
      done();
    });
  });

  describe('#determineReservePrice', function() {
    it('Correctness of determining the reserve price', function(done) {
      done();
    });
  });

  describe('#settle', function() {
    it('Correctness of settleing', function(done) {
      done();
    });
  });
});
