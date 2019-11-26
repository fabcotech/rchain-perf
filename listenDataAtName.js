const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const rchainToolkit = require("rchain-toolkit");

const main = async () => {
  const d = new Date().getTime();
  const deployQuery = {
    unforgeables: [
      {
        g_private_body: {
          id: Buffer.from(
            "0b6af07b9245bb888daa26dddcd1275e270aad4c1560a709b56a42cb67a4a907",
            "hex"
          )
        }
      }
    ]
  };

  const grpcClient = await rchainToolkit.grpc.getGrpcDeployClient(
    `node2.testnet.rchain-dev.tk:${40401}`,
    grpc,
    protoLoader
  );

  const listenForDataAtNameResponse = await rchainToolkit.grpc.listenForDataAtName(
    {
      name: deployQuery,
      depth: 1000
    },
    grpcClient
  );
  console.log(listenForDataAtNameResponse.payload.blockInfo);

  console.log("It took ", (new Date().getTime() - d) / 1000);
};

main();
