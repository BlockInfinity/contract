# Task Management

- Add issue for each task to be done
  - Assign issue to one specific person whenever possible
  - Assign milestone to each issue
  - Set state of issue:
    - Doing: issue is processed
    - Done: issue is finished
 
- Programming tasks
  - Definition of "Done"
     - Code has been peer-reviwed by at least one other team member
     - Code is fully tested

# Testing of JavaScript Code

- Put test code in same directory as the code to be tested
- Name test code filename.spec.js

## Testing

- $ mocha ./../filename.spec.js

# Testing of Solidity Code

- Describe each test as accurate as possible

## Prerequisites

- Install Ethereum RPC client https://github.com/ethereumjs/testrpc
- Put test code in directory "./dex/test"

## Testing

- $ testrpc --accounts 1000 (Start Ethereum RPC client, e.g. 1000 accounts)
- $ cd ./dex
- $ truffle test