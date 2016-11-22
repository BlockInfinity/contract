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

# Run solidity tests

## Prerequisites

- Install Ethereum RPC client https://github.com/ethereumjs/testrpc

## Testing

- Start Ethereum RPC client, e.g. 1000 accounts: $ testrpc --accounts 1000
- cd ./dex
- truffle test