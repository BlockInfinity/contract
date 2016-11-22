# Todo

2. Analog zu den reserve-ask-order-price auch ein reserve-bid-order-price vorab bestimmen

3. Vollständiger Test vom js code mit simulierten Block-Zeitintervallen.

4. Testfunktionen für den js code schreiben. 

5. Überführung in solidity. 

6. Mit dem fehlerfreien! js code den solidity contract prüfen.

7. Programm mit echten Rohdaten speisen und analysieren => Abschlusspräsentation

# Run solidity tests

Prerequisites

1.) Install Ethereum RPC client https://github.com/ethereumjs/testrpc

Testing

1.) Start Ethereum RPC client, e.g. 1000 accounts
$ testrpc --accounts 1000

2.) cd ./dex

3.) truffle test