import { ContractFunctionVisibility } from "hardhat/internal/hardhat-network/stack-traces/model";

const { expect } = require("chai");
const { ethers } = require("hardhat");
const hre = require("hardhat");

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fixedSizeHex(s: string, len: number) {
  if (s.length > len) throw "size failed";
  return s.padStart(len, "0");
}

describe("OrderBook contract, limit orders", function () {
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

    // Create the order book
    const sizeTick = 100; // decimal=3 so multiples of 0.1
    const priceTick = 10; // decimal=3 so multiples of 0.01
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

  it("Limit order tests", async function () {
    const { router, token0, token1, acc1, acc2 } = await get_setup_values();

    const tokenAmount = "10000000000000";
    // Mint 10000000000000 token0 and token1 for acc1 and acc2
    await token0.mint(acc1.getAddress(), tokenAmount);
    await token0.connect(acc1).approve(router.address, tokenAmount);
    await token0.mint(acc2.getAddress(), tokenAmount);
    await token0.connect(acc2).approve(router.address, tokenAmount);

    await token1.mint(acc1.getAddress(), tokenAmount);
    await token1.connect(acc1).approve(router.address, tokenAmount);
    await token1.mint(acc2.getAddress(), tokenAmount);
    await token1.connect(acc2).approve(router.address, tokenAmount);

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

    expect(
      (await token0.balanceOf(acc1.address)).eq(
        startBalance - BigInt(1500) * td
      )
    ).to.be.true;

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

    expect(
      (await router
        .connect(acc1)
        .getMockIndexToInsert(0, BigInt(2500) * td, BigInt(50) * td, 1)) === 2
    ).to.be.true;

    expect(
      (await token0.balanceOf(acc1.address)).eq(
        startBalance - BigInt(4000) * td
      )
    ).to.be.true;

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

    expect(
      (await token0.balanceOf(acc1.address)).eq(
        startBalance - BigInt(4500) * td
      )
    ).to.be.true;

    await (
      await acc2.sendTransaction({
        to: router.address,
        data:
          "0x01" +
          fixedSizeHex("0", 2) +
          fixedSizeHex("1", 2) +
          fixedSizeHex((BigInt(40) * td).toString(16), 16) +
          fixedSizeHex(BigInt(1).toString(16), 16) +
          fixedSizeHex("0", 2) +
          fixedSizeHex("0", 8),
      })
    ).wait();

    expect(
      (await token0.balanceOf(acc1.address)).eq(
        startBalance - BigInt(4500) * td
      )
    ).to.be.true;
    expect(
      (await token0.balanceOf(acc2.address)).eq(startBalance + BigInt(500) * td)
    ).to.be.true;
    expect(
      (await token1.balanceOf(acc1.address)).eq(
        startBalance + (td * BigInt(10)) / BigInt(2)
      )
    ).to.be.true;
    expect(
      (await token1.balanceOf(acc2.address)).eq(startBalance - BigInt(40) * td)
    ).to.be.true;

    await (
      await acc2.sendTransaction({
        to: router.address,
        data:
          "0x01" +
          fixedSizeHex("0", 2) +
          fixedSizeHex("1", 2) +
          fixedSizeHex((BigInt(20) * td).toString(16), 16) +
          fixedSizeHex(BigInt(2).toString(16), 16) +
          fixedSizeHex("0", 2) +
          fixedSizeHex(
            Number(
              await router
                .connect(acc1)
                .getMockIndexToInsert(0, BigInt(20) * td, BigInt(40) * td, 0)
            ).toString(16),
            8
          ),
      })
    ).wait();

    await (
      await acc1.sendTransaction({
        to: router.address,
        data:
          "0x01" +
          fixedSizeHex("0", 2) +
          fixedSizeHex("1", 2) +
          fixedSizeHex((BigInt(35) * td).toString(16), 16) +
          fixedSizeHex(BigInt(2).toString(16), 16) +
          fixedSizeHex("1", 2) +
          fixedSizeHex(
            Number(
              await router
                .connect(acc1)
                .getMockIndexToInsert(0, BigInt(3500) * td, BigInt(70) * td, 1)
            ).toString(16),
            8
          ),
      })
    ).wait();

    expect(
      (await token0.balanceOf(acc1.address)).eq(
        startBalance - BigInt(8000) * td
      )
    ).to.be.true;
    expect(
      (await token0.balanceOf(acc2.address)).eq(
        startBalance + BigInt(2500) * td
      )
    ).to.be.true;
    expect(
      (await token1.balanceOf(acc1.address)).eq(
        startBalance + BigInt(450) * (td / BigInt(10))
      )
    ).to.be.true;
    expect(
      (await token1.balanceOf(acc2.address)).eq(startBalance - BigInt(80) * td)
    ).to.be.true;
  });

  it("Should create limit orders correctly with different hintIds", async function () {
    const { router, token0, acc1, acc2 } = await get_setup_values();
    await token0.mint(acc1.getAddress(), 1000000000000000);
    await token0.mint(acc2.getAddress(), 1000000000000000);
    await token0.connect(acc1).approve(router.address, 1000000000000000);
    await token0.connect(acc2).approve(router.address, 1000000000000000);

    const acc1Address = await acc1.getAddress();
    const acc2Address = await acc2.getAddress();

    //  v
    // [0] -> [1]
    // orderId = 2
    await router.connect(acc1).createLimitOrder(0, 100, 100, 1, 0);

    //  v
    // [0] -> 2 -> [1]
    // orderId = 3
    await router.connect(acc1).createLimitOrder(0, 100, 400, 1, 0);

    //        v
    // [0] -> 2 -> 3 -> [1]
    // orderId = 4
    await router.connect(acc2).createLimitOrder(0, 100, 200, 1, 2);

    //                        v
    // [0] -> 2 -> 4 -> 3 -> [1]
    // orderId = 5
    await router.connect(acc2).createLimitOrder(0, 100, 300, 1, 1);

    //             v
    // [0] -> 2 -> 4 -> 5 -> 3 -> [1]
    // orderId = 6
    await router.connect(acc2).createLimitOrder(0, 100, 500, 1, 4);

    //[0] -> 2 -> 4 -> 5 -> 3 -> 6 -> [1]

    let order_ids = await router.getLimitOrders(0);

    expect(order_ids.length).to.equal(5);
    expect(order_ids[0]).to.deep.equal([2, 4, 5, 3, 6]);
    expect(order_ids[1]).to.deep.equal([
      acc1Address,
      acc2Address,
      acc2Address,
      acc1Address,
      acc2Address,
    ]);
    expect(order_ids[2]).to.deep.equal([
      Number("10000"),
      Number("10000"),
      Number("10000"),
      Number("10000"),
      Number("10000"),
    ]);
    expect(order_ids[3]).to.deep.equal([
      Number("10000"),
      Number("20000"),
      Number("30000"),
      Number("40000"),
      Number("50000"),
    ]);
    expect(order_ids[4]).to.deep.equal([true, true, true, true, true]);

    await router.connect(acc2).cancelLimitOrder(0, 4);

    // [0] -> 2 -> 5 -> 3 -> 6 -> [1]
    //           /
    //          4
    //          ^

    // orderId = 7
    await router.connect(acc2).createLimitOrder(0, 100, 200, 1, 4);

    // [0] -> 2 -> 7 -> 5 -> 3 -> 6 -> [1]

    order_ids = await router.getLimitOrders(0);
    expect(order_ids.length).to.equal(5);
    expect(order_ids[0]).to.deep.equal([2, 7, 5, 3, 6]);
    expect(order_ids[1]).to.deep.equal([
      acc1Address,
      acc2Address,
      acc2Address,
      acc1Address,
      acc2Address,
    ]);
    expect(order_ids[2]).to.deep.equal([
      Number("10000"),
      Number("10000"),
      Number("10000"),
      Number("10000"),
      Number("10000"),
    ]);
    expect(order_ids[3]).to.deep.equal([
      Number("10000"),
      Number("20000"),
      Number("30000"),
      Number("40000"),
      Number("50000"),
    ]);
    expect(order_ids[4]).to.deep.equal([true, true, true, true, true]);
  });
});
