const fs = require("fs");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const rchainToolkit = require("rchain-toolkit");

const { host, port, privateKey, publicKey } = require("./constants");
const { getProcessArgv, log, buildUnforgeableNameQuery } = require("./utils");

const launch = async () => {
  const counterFile = fs.readFileSync(`counter.rho`, "utf8");
  log("host : " + host);
  log("port : " + port);

  let perSecond = getProcessArgv("--per-second");
  if (!perSecond) {
    log("--per-second parameter not found");
    process.exit();
  }

  log("per second : " + perSecond);

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
    counterFile,
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

  const jsObject = rchainToolkit.utils.rholangMapToJsObject(
    data.exprs[0].e_map_body
  );

  const counterUnforgeableNameQuery = buildUnforgeableNameQuery(
    jsObject.unforgeable_name[0].gPrivate
  );

  log("incrementCh registry uri : " + jsObject.registry_uri);
  log("counter unforgeable name : " + jsObject.unforgeable_name[0].gPrivate);
  let i = 0;
  setInterval(() => {
    deployAndCheckCounter(
      grpcClient,
      grpcProposeClient,
      i,
      counterUnforgeableNameQuery,
      perSecond,
      jsObject.registry_uri
    );
    i += 1;
  }, 1000);
};

launch();

const deployAndCheckCounter = async (
  grpcClient,
  grpcProposeClient,
  i,
  counterUnforgeableNameQuery,
  perSecond,
  registryUri
) => {
  log(i + 1 + "th round");

  const deploys = [];
  const timestamp = new Date().valueOf();
  for (let j = 0; j < perSecond; j += 1) {
    const term = `new incrementCounterCh, lookup(\`rho:registry:lookup\`) in {
      lookup!(\`${registryUri}\`, *incrementCounterCh) |
      for(update <- incrementCounterCh) {
        update!("INCREMENT")
      }
    }`;
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
        rchainToolkit.grpc.propose({}, grpcProposeClient).then(p => {
          if (!p.error) {
            log(`propose for ${seconds}th round succesfull`);
            if (seconds % 10 === 0) {
              log(seconds + "th round, will check counter");
              rchainToolkit.grpc
                .listenForDataAtName(
                  {
                    name: counterUnforgeableNameQuery,
                    depth: 1000
                  },
                  grpcClient
                )
                .then(listenForDataAtNameResponse => {
                  const data = rchainToolkit.utils.getValueFromBlocks(
                    listenForDataAtNameResponse.payload.blockInfo
                  );

                  console.log("\n");
                  log("==== ");
                  log(
                    `value at ${seconds} seconds is ${
                      data.exprs[0].g_int
                    } and should be ${seconds * perSecond}`
                  );
                  if (parseInt(data.exprs[0].g_int) !== seconds * perSecond) {
                    log(
                      "    Error : value on chain does not equal the predicted value"
                    );
                  }
                  log("====\n");
                });
            }
          } else {
            log("error when proposing");
            console.log(p.error);
          }
        });
      }
    })
    .catch(err => {
      console.log(err);
    });
};
