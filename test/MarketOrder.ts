import { ContractFunctionVisibility } from "hardhat/internal/hardhat-network/stack-traces/model";

const { expect } = require("chai");
const { ethers } = require("hardhat");

function fixedSizeHex(s: string, len: number) {
  if (s.length > len) throw "size failed";
  return s.padStart(len, "0");
}

describe("OrderBook contract, market orders", function () {
  async function get_setup_values() {
    const [owner, acc1, acc2] = await ethers.getSigners();

    // Deploy heap libraries
    const max = await ethers.getContractFactory("MaxLinkedListLib");
    const maxList = await max.deploy();
    await maxList.deployed();

    const min = await ethers.getContractFactory("MinLinkedListLib");
    const minList = await min.deploy();
    await minList.deployed();

    // Deploy factory
    const Factory = await ethers.getContractFactory("Factory", {
      libraries: {
        MaxLinkedListLib: maxList.address,
        MinLinkedListLib: minList.address,
      },
    });
    const factory = await Factory.deploy(owner.address);
    await factory.deployed();

    // Deploy router
    const routerFactory = await ethers.getContractFactory("Router");
    const router = await routerFactory.deploy(factory.address);
    await router.deployed();

    await factory.setRouter(router.address);

    const token0_factory = await ethers.getContractFactory("TestERC20");
    let token0 = await token0_factory.deploy("Test Token 0", "TEST 0");
    await token0.deployed();

    const token1_factory = await ethers.getContractFactory("TestERC20");
    let token1 = await token1_factory.deploy("Test Token 1", "TEST 1");
    await token1.deployed();

    const tokenAmount = "10000000000000";
    await token0.mint(acc1.getAddress(), tokenAmount);
    await token0.connect(acc1).approve(router.address, tokenAmount);
    await token0.mint(acc2.getAddress(), tokenAmount);
    await token0.connect(acc2).approve(router.address, tokenAmount);

    await token1.mint(acc1.getAddress(), tokenAmount);
    await token1.connect(acc1).approve(router.address, tokenAmount);
    await token1.mint(acc2.getAddress(), tokenAmount);
    await token1.connect(acc2).approve(router.address, tokenAmount);

    // Create the order book
    const sizeTick = 100; // decimal=3 so multiples of 0.1
    const priceTick = 10; // decimal=3 so multiples of 0.001
    await factory.createOrderBook(token0.address, token1.address, 2, 1);

    return {
      router,
      token0,
      token1,
      owner,
      acc1,
      acc2,
      sizeTick,
      priceTick,
    };
  }

  it("Market orders tests by filling ask limit orders", async function () {
    const { router, acc1 } = await get_setup_values();

    // Create 5 ask limit orders
    await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // 2
    await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // 3
    await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // 4
    await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // 5
    await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // 6

    // Create market order to fill first three asks
    await router.connect(acc1).createMarketOrder(0, 3, 1, 0);

    let order_ids = await router.getLimitOrders(0);

    expect(order_ids[0].length).to.equal(2);
    expect(order_ids[0]).to.deep.equal([5, 6]);
  });

  it("Market orders tests by filling bid limit orders", async function () {
    const { router, acc1 } = await get_setup_values();

    // Create 5 ask limit orders
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // 2
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // 3
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // 4
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // 5
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // 6

    // Create market order to fill first three asks
    await router.connect(acc1).createMarketOrder(0, 3, 1, 1);

    let order_ids = await router.getLimitOrders(0);

    expect(order_ids[0].length).to.equal(2);
    expect(order_ids[0]).to.deep.equal([5, 6]);
  });

  it("Market order tests with fallback function", async function () {
    const { router, token0, token1, acc1, acc2 } = await get_setup_values();

    const tokenAmount = "10000000000000";

    const td = BigInt(1000000); // token decimals
    const startBalance = BigInt(tokenAmount);

    await (
      await acc1.sendTransaction({
        to: router.address,
        data:
          "0x01" +
          fixedSizeHex("0", 2) +
          fixedSizeHex("1", 2) +
          fixedSizeHex((BigInt(15) * td).toString(16), 16) +
          fixedSizeHex(BigInt(2).toString(16), 16) +
          fixedSizeHex("1", 2) +
          fixedSizeHex("0", 8),
      })
    ).wait();

    await (
      await acc1.sendTransaction({
        to: router.address,
        data:
          "0x01" +
          fixedSizeHex("0", 2) +
          fixedSizeHex("1", 2) +
          fixedSizeHex((BigInt(25) * td).toString(16), 16) +
          fixedSizeHex(BigInt(4).toString(16), 16) +
          fixedSizeHex("1", 2) +
          fixedSizeHex("0", 8),
      })
    ).wait();

    await (
      await acc1.sendTransaction({
        to: router.address,
        data:
          "0x01" +
          fixedSizeHex("0", 2) +
          fixedSizeHex("1", 2) +
          fixedSizeHex((BigInt(5) * td).toString(16), 16) +
          fixedSizeHex(BigInt(1).toString(16), 16) +
          fixedSizeHex("1", 2) +
          fixedSizeHex("3", 8),
      })
    ).wait();

    await (
      await acc2.sendTransaction({
        to: router.address,
        data:
          "0x04" +
          fixedSizeHex("0", 2) +
          fixedSizeHex((BigInt(45) * td).toString(16), 16) +
          fixedSizeHex(BigInt(100000).toString(16), 16) +
          fixedSizeHex("0", 2),
      })
    ).wait();

    expect(
      (await token0.balanceOf(acc2.address)).eq(
        startBalance + BigInt(4500) * td
      )
    ).to.be.true;
    expect(
      (await token1.balanceOf(acc2.address)).eq(startBalance - BigInt(135) * td)
    ).to.be.true;
  });
});
