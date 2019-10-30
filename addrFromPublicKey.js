const keccak256 = require("js-sha3").keccak256;
const blake = require("blakejs");
const base58 = require("base-58");

// Algorithm to generate ETH and REV address is taken from RNode source
// https://github.com/rchain/rchain/blob/bf7a30e1d388d46aa9e5f4b8c04089fc8e31d771/rholang/src/main/scala/coop/rchain/rholang/interpreter/util/AddressTools.scala#L47

// Prefix as defined in https://github.com/rchain/rchain/blob/c6721a6/rholang/src/main/scala/coop/rchain/rholang/interpreter/util/RevAddress.scala#L13
const prefix = { coinId: "000000", version: "00" };

const bytesFromHex = hexStr => {
  const byte2hex = ([arr, bhi], x) =>
    bhi ? [[...arr, parseInt(`${bhi}${x}`, 16)]] : [arr, x];
  const [resArr] = Array.from(hexStr).reduce(byte2hex, [[]]);
  return Uint8Array.from(resArr);
};

const toBase58 = hexStr => {
  const bytes = bytesFromHex(hexStr);
  return base58.encode(bytes);
};

const getAddrFromEth = ethAddr => {
  if (!ethAddr || ethAddr.length !== 40) return;

  // Hash ETH address
  const ethAddrBytes = bytesFromHex(ethAddr);
  const ethHash = keccak256(ethAddrBytes);

  // Add prefix with hash and calculate checksum (blake2b-256 hash)
  const payload = `${prefix.coinId}${prefix.version}${ethHash}`;
  const payloadBytes = bytesFromHex(payload);
  const checksum = blake.blake2bHex(payloadBytes, void 666, 32).slice(0, 8);

  // Return REV address
  return toBase58(`${payload}${checksum}`);
};

const getAddrFromPublicKey = publicKey => {
  if (!publicKey || publicKey.length !== 130) return;

  // Public key bytes from hex string
  const pubKeyBytes = bytesFromHex(publicKey);
  // Remove one byte from pk bytes and hash
  const pkHash = keccak256(pubKeyBytes.slice(1));
  // Take last 40 chars from hashed pk (ETH address)
  const pkHash40 = pkHash.slice(-40);

  // Return both REV and ETH address
  return {
    revAddr: getAddrFromEth(pkHash40),
    ethAddr: pkHash40
  };
};

[
  "04e68895ca7664e6d6b8b2d28df46ee55c33cd500ef2567dfe941cfe158a44e5ecedcb944cc22423d1b6765d363560a9e3beafbabbda43043efb6e0ab41327d7ee",
  "04bdd82857366a2a97e84ef3b713ec00a6f6ab36e0be1762e9030c1fd5c8c07c203f29d55d4087a98ef5299e05be8faf3cd1597448566649f12c16700e92ec7384",
  "04a4e8095e2b6e77fe9ab9bbc8f9186ef6c7967d47b9c424913b734515ae601d86dc6f926eb3d30c0e8fa2377de76cdee34f9217b7416fd894440186fdde805915",
  "04d0540f2088fe08368b676249c82035fe1295de3d2dd09f3586c49bd0cab344f46bad45fdb126be67b1f7d4f276c928e8d562c0092eb2543569c82214b731ee84",
  "047d17b88844884a33ed5c112eb8dda15f2da25eb4f95bad4707a0533b3b926d7e3e68797570ebb608e6aec5a62c78b7f8adfc26b85208aeddffe04b0bf25e73bf",
].forEach((a, i) => {
  const b = getAddrFromPublicKey(a);
  console.log(a + " : ");
  console.log("REV : " + b.revAddr);
  console.log("ETH : " + b.ethAddr + "\n");
});
