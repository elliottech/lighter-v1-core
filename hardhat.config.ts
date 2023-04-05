import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
import "hardhat-preprocessor";
import "hardhat-deploy";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
dotenvConfig({ path: resolve(__dirname, "./.env") });

import fs from "fs";
import { HardhatUserConfig } from "hardhat/config";

function getRemappings() {
  return fs
    .readFileSync("remappings.txt", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => line.trim().split("="));
}

const getEtherscanKey = () => {
  let network;
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--network') {
      network = process.argv[i+1];
      break
    }
  }

  if (!network) {
    return ''
  }

  switch (network) {
    case 'mainnet':
      return process.env.MAINNET_ETHERSCAN_KEY
    case 'polygon':
      return process.env.POLYGON_ETHERSCAN_KEY
    case 'opt':
      return process.env.OPTIMISM_ETHERSCAN_KEY
    case 'arbitrum':
      return process.env.ARBITRUM_ETHERSCAN_KEY
    default:
      return ''
  }
}

const mnemonic = process.env.MNEMONIC;
if (!mnemonic) {
  throw new Error("Please set your MNEMONIC in a .env file");
}

const ethereumRPC = process.env.ETHEREUM_RPC;
if (!ethereumRPC) {
  throw new Error("Please set your ETHEREUM_RPC in a .env file");
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.16",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000000,
      },
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      accounts: {
        mnemonic,
      },
      chainId: 31337,
      forking: {
        url: `${ethereumRPC}`,
        blockNumber: 13770153,
      },
    },
    goerli: {
      url: process.env.GOERLI_RPC,
      gasPrice: 20_000_000_000, // 40 gwei
      gasMultiplier: 1,
      chainId: 5,
      accounts: {
        mnemonic,
      },
    },
    mumbai: {
      url: process.env.POLYGON_MUMBAI_RPC,
      gasPrice: 5_000_000_000, // 5 gwei
      gasMultiplier: 1.5,
      chainId: 80001,
      accounts: {
        mnemonic,
      },
    },
  },
  etherscan: {
    apiKey: {
      ethereum: process.env.ETHERSCAN_API_KEY,
    }
  },
  paths: {
    sources: "./contracts", // Use ./src rather than ./contracts as Hardhat expects
    cache: "./cache_hardhat", // Use a different cache for Hardhat than Foundry
  },
  // This fully resolves paths for imports in the ./lib directory for Hardhat
  preprocess: {
    eachLine: (hre) => ({
      transform: (line: string) => {
        if (line.match(/^\s*import /i)) {
          getRemappings().forEach(([find, replace]) => {
            if (line.match(find)) {
              line = line.replace(find, replace);
            }
          });
        }
        return line;
      },
    }),
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
};

export default config;