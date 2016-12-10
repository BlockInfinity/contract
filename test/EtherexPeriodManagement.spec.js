'use strict';

const co = require('co');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
chai.use(chaiAsPromised);
const assert = require('assert');

const eth = web3.eth;

const PERCENTAGE_CERTIFICATE_AUTHORITIES = 0.05;
const PERCENTAGE_PRODUCERS = 0.5;

contract('Etherex', function(accounts) {

  var certificateAuthorities;
  var producers;
  var consumers;
  var etherex;
  var stateUpdates;
  var invalidStates;
  var priceMultiplier = 2;
  var volumeMultiplier = 2;
  var beginningBlock;

  beforeEach(function() {
    // default account
    eth.defaultAccount = accounts[0];
    // certificate authorities
    certificateAuthorities = accounts.slice(0, PERCENTAGE_CERTIFICATE_AUTHORITIES * accounts.length);
    // all accounts
    accounts = accounts.slice(PERCENTAGE_CERTIFICATE_AUTHORITIES * accounts.length, accounts.length);
    // producers
    producers = accounts.slice(0, PERCENTAGE_PRODUCERS * accounts.length);
    // consumers
    consumers = accounts.slice(PERCENTAGE_PRODUCERS * accounts.length, accounts.length);
    // set up etherex
    etherex = Etherex.deployed();

    beginningBlock = eth.blockNumber;

    stateUpdates = etherex.StateUpdate();
    invalidStates = etherex.InvalidState();


  });

  afterEach(function() {
      stateUpdates.stopWatching();

      return co(function*() {
        yield etherex.reset();
      });
   });

  describe('Test period management', function() {
    it('The contract should be deployed to the blockchain', function(done) {
      assert(etherex);
      done();
    });


    it('test state and period updates', function(done) {

      var periods = 0;

      stateUpdates.watch(function(error, result) {

        if(error == null) {
          var args = result.args;
          var blocks = args.blockNumber - args.startBlock;

          if(args.blockNumber - args.startBlock >= 50) {

            assert(args.newState.toNumber() == 0, "State is 1 in 3/3 of period, args: " + args.startBlock + " " + args.blockNumber + " blocks: " + blocks);

          } else if(args.blockNumber - args.startBlock >= 25 && args.blockNumber - args.startBlock < 50) {
            assert(args.newState.toNumber() == 1, "State is 0 in 2/3 of period, args: " + args.startBlock + " " + args.blockNumber + " blocks: " + blocks);
          } else {
            assert(args.newState.toNumber() == 0, "State is 1 in 1/3 of period, args: "+ args.startBlock + " " + args.blockNumber + " blocks: " + blocks);
          }

        } else {
          assert(false, "Error: " + error)
        }

        if(args.blockNumber - beginningBlock == 76) {
          assert(args.period == 1, "Period in block 76 did not change to 1.");
          stateUpdates.stopWatching();
          console.log("Finished 75 blocks");
          done();
        }


      });

      //Iterate over first part of period

      for(var j = 0; j < 3; j++)
      for (var i = 0; i < 30; i++) {

        if(i %2 == 0)
          etherex.submitBid(i * priceMultiplier, i * volumeMultiplier, {from: consumers[i]});
        else
          etherex.submitAsk(i * priceMultiplier, i * volumeMultiplier, {from: producers[i]});        
     
      }


    });

  });


});
