const fs = require("fs");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const rchainToolkit = require("rchain-toolkit");

const { host, port, privateKey, publicKey, to, from } = require("./constants");
const { getProcessArgv, log, buildUnforgeableNameQuery } = require("./utils");

let balance;
let startTime;
const launch = async () => {
  const transferFundsFile = fs.readFileSync(`transfer_funds.rho`, "utf8").replace('%FROM', from).replace('%TO', to);
  const checkBalanceFile = fs.readFileSync('check_balance.rho', 'utf8').replace('%FROM', from);
  log("host : " + host);
  log("port : " + port);

  let perSecond = getProcessArgv("--per-second");
  if (!perSecond) {
    log("--per-second parameter not found");
    process.exit();
  }

  log("per second : " + perSecond);

  stopAfter = getProcessArgv("--stop-after");
  if (!stopAfter) {
    log("--stop-after parameter not found");
    stopAfter = 10000000000;
  }

  log("stop after : " + stopAfter);

  const grpcClient = await rchainToolkit.grpc.getGrpcDeployClient(
    `${host}:${port}`,
    grpc,
    protoLoader
  );

  const grpcProposeClient = await rchainToolkit.grpc.getGrpcProposeClient(
    `${host}:${port}`,
    grpc,
    protoLoader
  );

  const timestamp = new Date().valueOf();
  const privateNamePreviewResponse = await rchainToolkit.grpc.previewPrivateNames(
    {
      user: Buffer.from(publicKey, "hex"),
      timestamp: timestamp,
      nameQty: 1
    },
    grpcClient
  );

  const basketPrivateName = rchainToolkit.utils.unforgeableWithId(
    privateNamePreviewResponse.payload.ids[0]
  );

  const deployData = await rchainToolkit.utils.getDeployData(
    "secp256k1",
    timestamp,
    checkBalanceFile,
    privateKey,
    publicKey,
    1,
    1000000,
    -1
  );

  const deployResponse = await rchainToolkit.grpc.doDeploy(
    deployData,
    grpcClient
  );
  if (deployResponse.error) {
    log("Unable to deploy");
    console.log(deployResponse.error.messages);
    process.exit();
  }

  await rchainToolkit.grpc.propose({}, grpcProposeClient);

  const unforgeableNameQuery = buildUnforgeableNameQuery(basketPrivateName);

  const listenForDataAtNameResponse = await rchainToolkit.grpc.listenForDataAtName(
    {
      name: unforgeableNameQuery,
      depth: 1000
    },
    grpcClient
  );

  const data = rchainToolkit.utils.getValueFromBlocks(
    listenForDataAtNameResponse.payload.blockInfo
  );

  balance = rchainToolkit.utils.rhoValToJs(
    data
  );

  log("initial balance is : " + balance);

  let i = 0;
  startTime = new Date().getTime();
  setInterval(() => {
    if (i < stopAfter) {
      deployAndCheckBalance(
        grpcClient,
        grpcProposeClient,
        i,
        perSecond,
        transferFundsFile,
        checkBalanceFile,
        i === stopAfter -1
      );
      i += 1;
    }
  }, 1000);
};

launch();

const deployAndCheckBalance = async (
  grpcClient,
  grpcProposeClient,
  i,
  perSecond,
  transferFundsFile,
  checkBalanceFile,
  last
) => {
  log(i + 1 + "th round");

  const deploys = [];
  const timestamp = new Date().valueOf();
  for (let j = 0; j < perSecond; j += 1) {
    const term = transferFundsFile;
    const deployData = rchainToolkit.utils.getDeployData(
      "secp256k1",
      timestamp + j,
      term,
      privateKey,
      publicKey,
      1,
      1000000,
      -1
    );
    deploys.push(deployData);
  }

  await Promise.all(
    deploys.map(d => {
      return rchainToolkit.grpc.doDeploy(d, grpcClient);
    })
  )
    .then(a => {
      const res = a
        .map(b => {
          if (!b.error) {
            return "1";
          }
          return "0";
        })
        .join("");
      const seconds = i + 1;
      if (seconds % 5 === 0) {
        log("seconds % 5 === 0 , will propose");
        const proposeAndCheck = () => {
          rchainToolkit.grpc.propose({}, grpcProposeClient).then(async p => {
            if (!p.error) {
              log(`propose for ${seconds}th round succesfull`);
              if (last || (seconds % 10 === 0)) {
                log(seconds + "th round, will check balance");
                const timestamp = new Date().valueOf();
                const privateNamePreviewResponse = await rchainToolkit.grpc.previewPrivateNames(
                  {
                    user: Buffer.from(publicKey, "hex"),
                    timestamp: timestamp,
                    nameQty: 1
                  },
                  grpcClient
                )

                const basketPrivateName = rchainToolkit.utils.unforgeableWithId(
                  privateNamePreviewResponse.payload.ids[0]
                );

                const deployData = await rchainToolkit.utils.getDeployData(
                  "secp256k1",
                  timestamp,
                  checkBalanceFile,
                  privateKey,
                  publicKey,
                  1,
                  1000000,
                  -1
                );
                
                const deployResponse = await rchainToolkit.grpc.doDeploy(
                  deployData,
                  grpcClient
                );

                await rchainToolkit.grpc.propose({}, grpcProposeClient);

                const unforgeableNameQuery = buildUnforgeableNameQuery(basketPrivateName);
              
                const checkValue = async () => {
                  const listenForDataAtNameResponse = await rchainToolkit.grpc.listenForDataAtName(
                    {
                      name: unforgeableNameQuery,
                      depth: 1000
                    },
                    grpcClient
                  );
                  
                  const data = rchainToolkit.utils.getValueFromBlocks(
                    listenForDataAtNameResponse.payload.blockInfo
                  );
                
                  const value = rchainToolkit.utils.rhoValToJs(data);
    
                  console.log("\n");
                  log("==== ");
                  log(
                    `value at ${seconds} seconds is ${
                      value
                    } and should be ${balance - (seconds * perSecond)} (${seconds * perSecond} deploys sent, ${seconds / 10} proposes)`
                  );
                  
                  if (parseInt(value) !== balance - (seconds * perSecond)) {
                    log(
                      "error : value on chain does not equal the predicted value"
                    );
                    if (last) {
                      checkValue();
                    }
                  } else {
                    log(`success : rnode is synced with the deploys, ${seconds * perSecond} deploys processed in ${(new Date().getTime() - startTime) / 1000} seconds`)
                  }
                  log("====\n");
                }

                checkValue();

              }
            } else {
              log("error when proposing");
              console.log(p.error);
              if (last) {
                setTimeout(() => {
                  proposeAndCheck();
                }, 1000);
              }
            }
          });
        }
        proposeAndCheck();
      }
    })
    .catch(err => {
      console.log(err);
    });
};
