const ethers = require("ethers");
const fs = require("fs");
const tokenArtifacts = require("openzeppelin-solidity/build/contracts/ERC20Mintable.json");

const generateBots = async (number, funderMnemonic, ethRpc, tokenAddress) => {
  console.log("Called with opts:");
  console.log("   - number", number);
  console.log("   - funderMnemonic", funderMnemonic);
  console.log("   - ethRpc", ethRpc);
  console.log("   - tokenAddress", tokenAddress);

  // some basic error handling
  if (!number) {
    throw new Error("No number of bots to generate provided");
  }
  if (!funderMnemonic) {
    throw new Error("No funder mnemonic provided");
  }
  if (!ethRpc) {
    throw new Error("No eth rpc url provided");
  }
  if (!tokenAddress) {
    throw new Error("No token address provided");
  }

  // make the funder account and wallet
  const ethGift = "1";
  const tokenGift = "10000";
  const cfPath = "m/44'/60'/0'/25446";
  const provider = new ethers.providers.JsonRpcProvider(ethRpc);
  const funder = new ethers.Wallet.fromMnemonic(funderMnemonic).connect(provider);
  const token = new ethers.Contract(tokenAddress, tokenArtifacts.abi, funder);

  let obj = {};
  for (let i = 0; i < number; i++) {
    const botMnemonic = ethers.Wallet.createRandom().mnemonic;
    const hdNode = ethers.utils.HDNode.fromMnemonic(botMnemonic).derivePath(cfPath);
    const xpub = hdNode.neuter().extendedKey;
    const addr = ethers.Wallet.fromMnemonic(botMnemonic, cfPath).address;

    // send eth
    console.log(`\nSending ${ethGift} eth to ${addr}`);
    const ethTx = await funder.sendTransaction({
      to: addr,
      value: ethers.utils.parseEther(ethGift),
    });
    await funder.provider.waitForTransaction(ethTx.hash);
    console.log(`Transaction mined! Hash: ${ethTx.hash}q`);

    // send tokens
    console.log(`Minting ${tokenGift} tokens for ${addr}`);
    const tokenTx = await token.mint(addr, ethers.utils.parseEther(tokenGift));
    await funder.provider.waitForTransaction(tokenTx.hash);
    console.log(`Transaction mined! Hash: ${tokenTx.hash}`);

    obj[i + 1] = { mnemonic: botMnemonic, xpub };
  }
  fs.writeFileSync("bots.json", JSON.stringify(obj, null, 2));
};

generateBots(process.argv[2], process.argv[3], process.argv[4], process.argv[5]).then(() =>
  console.log("Completed"),
);