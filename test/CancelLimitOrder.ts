const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

function fixedSizeHex(s: string, len: number) {
  if (s.length > len) throw "size failed";
  return s.padStart(len, "0");
}

describe("Cancel limit order function", function () {
  const hre = require("hardhat");
  const { expect } = require("chai");
  const { ethers } = require("hardhat");

  async function expect_bids_to_be(
    id_arr: number[],
    router: any,
    orderBookId: number
  ) {
    const [ids, _a, _b, _c, isAsk] = await router.getLimitOrders(orderBookId);
    const bid_arr = [];
    for (let i = 0; i < ids.length; i++) {
      if (!isAsk[i]) bid_arr.push(ids[i]);
    }
    expect(id_arr).to.eql(bid_arr);
  }

  async function setupFixture() {
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
    const priceTick = 100; // decimal=3 so multiples of 0.1
    await factory.createOrderBook(token0.address, token1.address, 2, 2);

    // Mint tokens for test accounts
    const tokenAmount = "10000000000000";
    await token0.mint(acc1.getAddress(), tokenAmount);
    await token0.connect(acc1).approve(router.address, tokenAmount);
    await token0.mint(acc2.getAddress(), tokenAmount);
    await token0.connect(acc2).approve(router.address, tokenAmount);

    await token1.mint(acc1.getAddress(), tokenAmount);
    await token1.connect(acc1).approve(router.address, tokenAmount);
    await token1.mint(acc2.getAddress(), tokenAmount);
    await token1.connect(acc2).approve(router.address, tokenAmount);

    // const x = await factory.getOrderBookDetails(token0.address, token1.address);
    // console.log("Order book address: " + x);

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

  it("Should not allow canceling another user's order", async function () {
    const { router, token0, token1, owner, acc1, acc2, sizeTick, priceTick } =
      await loadFixture(setupFixture);

    // price = amount1 * dec0 / amount0
    // price = amount1 * 10 / base

    async function tryToCancel() {
      // Create a limit order from acc1
      await (
        await acc1.sendTransaction({
          to: router.address,
          data:
            "0x01" +
            fixedSizeHex("0", 2) +
            fixedSizeHex("1", 2) +
            fixedSizeHex((2).toString(16), 16) +
            fixedSizeHex(((3 * sizeTick * 10) / 2).toString(16), 16) +
            fixedSizeHex("0", 2) +
            fixedSizeHex("0", 8),
        })
      ).wait();
      // Try to cancel the order created by acc1
      await (
        await acc2.sendTransaction({
          to: router.address,
          data:
            "0x03" +
            fixedSizeHex("0", 2) +
            fixedSizeHex("1", 2) +
            fixedSizeHex("2", 8) +
            fixedSizeHex("0", 2),
        })
      ).wait();
    }

    await expect(tryToCancel()).to.be.rejectedWith(
      "The caller should be the owner of the order"
    );
  });

  it("Should not revert when canceling an order that does not exist", async function () {
    const { router, acc1 } = await loadFixture(setupFixture);

    // Should not revert
    await router.connect(acc1).cancelLimitOrder(0, 2);
  });

  it("Should not revert when canceling an order that does not exist when batch canceling", async function () {
    const { router, acc1 } = await loadFixture(setupFixture);

    // Should not revert
    await router.connect(acc1).cancelLimitOrderBatch(0, 1, [2]);
  });

  it("Should cancel and then maintain the correct order", async function () {
    const { router, acc1, acc2, sizeTick } = await loadFixture(setupFixture);

    // 2
    await (
      await acc1.sendTransaction({
        to: router.address,
        data:
          "0x01" +
          fixedSizeHex("0", 2) +
          fixedSizeHex("1", 2) +
          fixedSizeHex((2).toString(16), 16) +
          fixedSizeHex(((1 * sizeTick * 10) / 2).toString(16), 16) +
          fixedSizeHex("0", 2) +
          fixedSizeHex("0", 8),
      })
    ).wait();
    // 3
    await (
      await acc2.sendTransaction({
        to: router.address,
        data:
          "0x01" +
          fixedSizeHex("0", 2) +
          fixedSizeHex("1", 2) +
          fixedSizeHex((10).toString(16), 16) +
          fixedSizeHex(((1 * sizeTick * 10) / 10).toString(16), 16) +
          fixedSizeHex("0", 2) +
          fixedSizeHex("0", 8),
      })
    ).wait();
    // 4
    await (
      await acc1.sendTransaction({
        to: router.address,
        data:
          "0x01" +
          fixedSizeHex("0", 2) +
          fixedSizeHex("1", 2) +
          fixedSizeHex((5).toString(16), 16) +
          fixedSizeHex(((2 * sizeTick * 10) / 5).toString(16), 16) +
          fixedSizeHex("0", 2) +
          fixedSizeHex("0", 8),
      })
    ).wait();
    // 5
    await (
      await acc2.sendTransaction({
        to: router.address,
        data:
          "0x01" +
          fixedSizeHex("0", 2) +
          fixedSizeHex("1", 2) +
          fixedSizeHex((5).toString(16), 16) +
          fixedSizeHex(((1 * sizeTick * 10) / 5).toString(16), 16) +
          fixedSizeHex("0", 2) +
          fixedSizeHex("0", 8),
      })
    ).wait();

    await expect_bids_to_be([2, 4, 5, 3], router, 0);

    await (
      await acc1.sendTransaction({
        to: router.address,
        data:
          "0x03" +
          fixedSizeHex("0", 2) +
          fixedSizeHex("1", 2) +
          fixedSizeHex("4", 8) +
          fixedSizeHex("0", 2),
      })
    ).wait();
    await expect_bids_to_be([2, 5, 3], router, 0);

    await (
      await acc2.sendTransaction({
        to: router.address,
        data:
          "0x03" +
          fixedSizeHex("0", 2) +
          fixedSizeHex("1", 2) +
          fixedSizeHex("3", 8) +
          fixedSizeHex("0", 2),
      })
    ).wait();
    await expect_bids_to_be([2, 5], router, 0);

    // 6
    await (
      await acc1.sendTransaction({
        to: router.address,
        data:
          "0x01" +
          fixedSizeHex("0", 2) +
          fixedSizeHex("1", 2) +
          fixedSizeHex((1).toString(16), 16) +
          fixedSizeHex(((1 * sizeTick * 10) / 1).toString(16), 16) +
          fixedSizeHex("0", 2) +
          fixedSizeHex("4", 8),
      })
    ).wait();
    await expect_bids_to_be([6, 2, 5], router, 0);
  });
});
