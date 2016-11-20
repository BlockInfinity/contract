# Todo

2. Analog zu den reserve-ask-order-price auch ein reserve-bid-order-price vorab bestimmen

3. Vollständiger Test vom js code mit simulierten Block-Zeitintervallen.

4. Testfunktionen für den js code schreiben. 

5. Überführung in solidity. 

6. Mit dem fehlerfreien! js code den solidity contract prüfen.

7. Programm mit echten Rohdaten speisen und analysieren => Abschlusspräsentation

# Background

http://www.ponton.de/downloads/mm/Einsatzpotenziale-der-Blockchain-im-Energiehandel_Merz_2016.pdf

# Links for development

https://ethereum.github.io/browser-solidity/#version=soljson-latest.js

https://github.com/ethereum/EIPs/issues/20

https://github.com/ethereum/go-ethereum/wiki/JavaScript-Console

https://github.com/ethereum/wiki/wiki/JavaScript-API

https://github.com/ethereum/go-ethereum/wiki/Connecting-to-the-network

https://media.readthedocs.org/pdf/solidity/latest/solidity.pdf

https://github.com/IISM-Ethereum/Guide

https://github.com/IISM-Ethereum/Miner

# Videos

Proof Of Stake / Scalability (devcon2)
https://www.youtube.com/watch?v=W9b4vQ37-qQ

# Run solidity tests

Prerequisites

1.) Install Ethereum RPC client https://github.com/ethereumjs/testrpc

Testing

1.) Start Ethereum RPC client, e.g. 1000 accounts
$ testrpc --accounts 1000

2.) cd ./dex

3.) truffle test