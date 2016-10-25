# Todo


## function withdraw
Es gibt noch keine withdraw Funktion. Sprich das Analog zur deposit Funktion fehlt! Nutzer sollten Ihr Geld auch wieder tum token contract schicken können ;-) 

## function register_smartmeter
Funktion darf nur vom account der Zertifizierungsstelle (Bundesnetzagentur) ausgeführt werden. 
fügt einen public key in einen array ein. Der array beinhaltet alles registrierten smart meters. 

## function trade 
Matching Funktion ändern. Im Laufe des mathcings darf Geld nicht mehr direkt hin und her versandt werden, sondern muss lediglich weggesperrt werden

## function settleSellOrder(public key from user, data from user's smart meter, data of the matched orders)
if einspeisung >= versprochen in order, transfer locked money to seller
if einspeisung < versprochen in order, kauf Reststrom für best bid und überweise was übrig bleibt an seller
if einspeisung != tatsächliche Einspeisung, emit best ask/bid orders

## function settleBuyOrder(public key from user, data from user's meter, data of the matched orders)
if verbrauch != tatsächlicher verbrauch, emit best ask/bid orders
Um die bid orders dann automatisch zu emitieren, müssten die users geld als sicherheit hinterlegen. Wenn Sicherheit aufgebraucht und Strom weiterhin verbraucht wird, dann müsste contract durch ein event jmd beauftragen den Strom abzuschalten.

## gas limit
logik muss aufgeteilt werden auf mehrere contracts da gas limit nicht ausreicht, da wir jedoch auf private chain sind, ist es vorerst  kein Problem und hat keine Eile.


# Konzept:

http://prezi.com/dk4hnl5ocrhe/?utm_campaign=share&utm_medium=copy&rc=ex0share


# Links


https://ethereum.github.io/browser-solidity/#version=soljson-latest.js

https://github.com/ethereum/EIPs/issues/20

https://github.com/ethereum/go-ethereum/wiki/JavaScript-Console

https://github.com/ethereum/wiki/wiki/JavaScript-API

https://github.com/ethereum/go-ethereum/wiki/Connecting-to-the-network

https://media.readthedocs.org/pdf/solidity/latest/solidity.pdf

https://github.com/IISM-Ethereum/Guide

https://github.com/IISM-Ethereum/Miner






