#!/bin/bash
## this script sets up a test blockchain
## The gas and difficulty parameters are the same as in the real ethereum blockchain. In order to get significant scalability results they need to be adjusted accordingly.
## Generates a blockchain with 10 Accounts with a predefined amount of money in each account


cd $(dirname $0)
CHAINPATH=testChain2/
mkdir $CHAINPATH


CUSTOMGENESIS="{
    \"nonce\": \"0x1779246622\",
    \"timestamp\": \"0x0\",
    \"parentHash\": \"0x0000000000000000000000000000000000000000000000000000000000000000\",
    \"extraData\": \"0x0\",
    \"gasLimit\": \"0x800000000\",
    \"difficulty\": \"0x400\",
    \"mixhash\": \"0x0000000000000000000000000000000000000000000000000000000000000000\",
    \"coinbase\": \"0x3333333333333333333333333333333333333333\",
    \"alloc\":
    {
        \"0xa599c969e8236e441c2aba769bd45b3a3cb02b6a\": {\"balance\" : \"20000000000000000000\"}                }
}"


GENESISPATH=customgenesis.json

echo $CUSTOMGENESIS > $CHAINPATH$GENESISPATH


geth --datadir "$CHAINPATH" init "$CHAINPATH$GENESISPATH"


PWDTXT="accPwd.txt"
echo "fred" > $CHAINPATH$PWDTXT
for i in `seq 1 10`
do
    geth --datadir "$CHAINPATH" --password $CHAINPATH$PWDTXT account new
done 


## Adds ether to all accounts
ACCOUNTS="$(geth --datadir $CHAINPATH account list)"


ALLOC="\"alloc\":{"
for i in `seq 1 10`;
do
    ACCOUNTS=${ACCOUNTS#*: {}
    ACCOUNTS3=${ACCOUNTS:0:40}
    ALLOC=$ALLOC\"$ACCOUNTS3\"": {\"balance\" : \"20000000000000000000\"},"
    echo $ACCOUNTS3
done
               
ALLOC=${ALLOC%,}
ALLOC=$ALLOC"} }"               

echo ${CUSTOMGENESIS%%\"alloc*}$ALLOC > $CHAINPATH$GENESISPATH
geth --datadir "$CHAINPATH" init "$CHAINPATH$GENESISPATH"

echo "Use the following command to open a geth console:"
echo "geth --port 30303 --rpc --rpcport 8454 --rpccorsdomain \"http://0.0.0.0:8081\" --networkid 1100  --datadir" "$CHAINPATH" "console"
