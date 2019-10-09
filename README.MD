This repo contains various performance tests for rnode

Check the `contants.js` file if you want to connect to a GRPC API other than `localhost:40401` and use a different pribvate/public key.

### Counter test

A number is stored on a channel, and incremented at each deploys.

- A block is proposed each 5 seconds.
- The number value is checked each 30 seconds

Use the `--per-second` to control the number of deploy that are done each seconds (and bring your machine/network down :D ).

```
# 4 deploys per second
node counter.js --per-second 4

# 20 deploys per second
node counter.js --per-second 20
```
