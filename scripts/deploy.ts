import { ethers } from "hardhat";
const { BigNumber } = require("ethers");

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const HARDHAT_ACCOUNTS: string[] = [""];

// Change if you deploy new tokens, arbitrum goerli test token addresses
const token0Address = "0xcC4a8FA63cE5C6a7f4A7A3D2EbCb738ddcD31209"; //USDC
const token1Address = "0x4d541F0B8039643783492F9865C7f7de4F54eB5f"; //WETH
const token2Address = "0xF133Eb356537F0B3B4fDfB98233b45Ef8138aA56"; //WBTC
const token3Address = "0x61D602BF3B1e511C746059ba089409aC43299be4"; //LINK
const token4Address = "0xC96649C363E93874467480D4b3Eba97064608B18"; //UNI

async function deployFakeTokens() {
  const token0_factory = await ethers.getContractFactory("TestERC20");
  let token0 = await token0_factory.deploy("USDC", "USDC");
  await token0.deployed();
  await token0.setDecimals(6);

  const token1_factory = await ethers.getContractFactory("TestERC20");
  let token1 = await token1_factory.deploy("WETH", "WETH");
  await token1.deployed();
  await token1.setDecimals(18);

  const token2_factory = await ethers.getContractFactory("TestERC20");
  let token2 = await token2_factory.deploy("WBTC", "WBTC");
  await token2.deployed();
  await token2.setDecimals(8);

  const token3_factory = await ethers.getContractFactory("TestERC20");
  let token3 = await token3_factory.deploy("LINK", "LINK");
  await token3.deployed();
  await token3.setDecimals(18);

  const token4_factory = await ethers.getContractFactory("TestERC20");
  let token4 = await token4_factory.deploy("UNI", "UNI");
  await token4.deployed();
  await token4.setDecimals(18);

  await delay(15000);

  console.log(
    token0.address,
    token1.address,
    token2.address,
    token3.address,
    token4.address
  );
  console.log(
    await token0.decimals(),
    await token1.decimals(),
    await token2.decimals(),
    await token3.decimals(),
    await token4.decimals()
  );
}

async function deployContracts(owner: string) {
  const max = await ethers.getContractFactory("MaxLinkedListLib");
  const maxList = await max.deploy();
  await maxList.deployed();
  console.log("deployed max list lib at:", maxList.address);
  await delay(15000);

  const min = await ethers.getContractFactory("MinLinkedListLib");
  const minList = await min.deploy();
  await minList.deployed();
  console.log("deployed min list lib at", minList.address);
  await delay(15000);

  const Factory = await ethers.getContractFactory("Factory", {
    libraries: {
      MaxLinkedListLib: maxList.address,
      MinLinkedListLib: minList.address,
    },
  });
  const factory = await Factory.deploy(owner);
  await factory.deployed();
  await delay(15000);
  console.log("Created factory at: ", factory.address);

  const routerFactory = await ethers.getContractFactory("Router");
  const router = await routerFactory.deploy(factory.address);
  await router.deployed();
  await delay(15000);
  console.log("Created router at: ", router.address);

  await factory.setRouter(router.address);
  await delay(15000);

  // WETH - USDC (size multiples of 0.001, 10^15), price multiples of 0.01, 10^4
  console.log(
    await factory.createOrderBook(token1Address, token0Address, 14, 4)
  );

  // WBTC - USDC (size multiples of 0.0001, 10^15), price multiples of 0.1, 10^5
  console.log(
    await factory.createOrderBook(token2Address, token0Address, 4, 5)
  );

  // LINK - USDC (size multiples of 0.01, 10^16), price multiples of 0.01, 10^4
  console.log(
    await factory.createOrderBook(token3Address, token0Address, 16, 4)
  );

  // UNI - USDC (size multiples of 0.01, 10^16), price multiples of 0.01, 10^4
  console.log(
    await factory.createOrderBook(token4Address, token0Address, 16, 4)
  );

  await delay(15000);
}

async function mintAndApprove(mint: boolean, routerAddress: string) {
  const IERC20ABI = [
    "function mint(address account, uint256 amount) public",
    "function approve(address spender, uint256 amount) external returns (bool)",
  ];

  for (const account of HARDHAT_ACCOUNTS) {
    const signer = await ethers.getSigner(account);
    const USDC = await ethers.getContractAt(IERC20ABI, token0Address, signer);
    const WETH = await ethers.getContractAt(IERC20ABI, token1Address, signer);
    const WBTC = await ethers.getContractAt(IERC20ABI, token2Address, signer);
    const LINK = await ethers.getContractAt(IERC20ABI, token3Address, signer);
    const UNI = await ethers.getContractAt(IERC20ABI, token4Address, signer);

    if (mint) {
      await USDC.mint(account, BigNumber.from("1500000000000000000"));
      await WETH.mint(account, BigNumber.from("10000000000000000000000000000"));
      await WBTC.mint(account, BigNumber.from("2000000000000000000"));
      await LINK.mint(
        account,
        BigNumber.from("10000000000000000000000000000000")
      );
      await UNI.mint(
        account,
        BigNumber.from("10000000000000000000000000000000")
      );
    }
    await USDC.approve(
      routerAddress,
      BigNumber.from("100000000000000000000000000000000000000")
    );
    await WETH.approve(
      routerAddress,
      BigNumber.from("1000000000000000000000000000000000000000")
    );
    await WBTC.approve(
      routerAddress,
      BigNumber.from("1000000000000000000000000000000000000000")
    );
    await LINK.approve(
      routerAddress,
      BigNumber.from("1000000000000000000000000000000000000000")
    );
    await UNI.approve(
      routerAddress,
      BigNumber.from("1000000000000000000000000000000000000000")
    );
  }
}

async function main() {
  // call the necessary functions
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
