This repo contains various performance tests for rnode

Check the `contants.js` file if you want to connect to a GRPC API other than `localhost:40401` and use a different private/public key.

Use the `--per-second` parameter to control the number of deploy that are done each seconds (and bring your machine/network down :D ).

Use the `--stop-after` parameter to stop the test after n seconds, make sure this number is a multiple of 5. AFter the test is over, the program will check the value onchain until it is the right value. This allows send a huge number of deploys in a short period, and know the time it takes for the node/network to process it.


```
git clone https://github.com/fabcotech/rchain-perf.git
cd rchain-perf
npm i
```

### Counter test

A number is stored on a channel, and incremented at each deploys.

- A block is proposed each 5 seconds.
- The number value is checked each 10 seconds

```
# Constant flow of 4 deploys per second, check indefinitly
node counter.js --per-second 4

# 80 deploys per second for 5 seconds, then poll the value on-chain until it is right
node counter.js --per-second 80 --stop-after 5
```

### REV transfer test

You must have rnode running with REV balances with high number, like 1000000 .

You can use the `addrFromPublicKey.js` file to obtain REV and ETH addresses from public keys.

The `from` value in `constants.js` must be the REV address that matches with the `publicKey` and `privateKey`. This address must have REVS.

Bob sends 1 rev to Alice at each deploy.
- A block is proposed each 5 seconds.
- The number value is checked each 10 seconds

```
# 2 deploys (= 2 REVs) per second
node transferFunds.js --per-second 2

# 4 deploys (= 4 REVs) per second
node transferFunds.js --per-second 4 --stop-after 20
```