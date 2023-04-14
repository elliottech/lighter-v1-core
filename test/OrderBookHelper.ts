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

    // Deploy order book helper
    const orderBookHelperFactory = await ethers.getContractFactory(
      "OrderBookHelper"
    );
    const orderBookHelper = await orderBookHelperFactory.deploy(
      factory.address,
      router.address
    );
    await orderBookHelper.deployed();

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
    await token0.connect(acc1).approve(orderBookHelper.address, tokenAmount);
    await token0.mint(acc2.getAddress(), tokenAmount);
    await token0.connect(acc2).approve(router.address, tokenAmount);
    await token0.connect(acc2).approve(orderBookHelper.address, tokenAmount);

    await token1.mint(acc1.getAddress(), tokenAmount);
    await token1.connect(acc1).approve(router.address, tokenAmount);
    await token1.connect(acc1).approve(orderBookHelper.address, tokenAmount);
    await token1.mint(acc2.getAddress(), tokenAmount);
    await token1.connect(acc2).approve(router.address, tokenAmount);
    await token1.connect(acc2).approve(orderBookHelper.address, tokenAmount);

    // Create the order book
    const sizeTick = 100; // decimal=3 so multiples of 0.1
    const priceTick = 10; // decimal=3 so multiples of 0.01
    // priceMultiplier = 100 * 10 / 10**3 = 1
    await factory.createOrderBook(token0.address, token1.address, 2, 1);

    return {
      router,
      orderBookHelper,
      token0,
      token1,
      owner,
      acc1,
      acc2,
      sizeTick,
      priceTick,
    };
  }

  it("swapExactInput test by selling token0", async function () {
    const { router, orderBookHelper, acc1 } = await get_setup_values();

    // Create 5 bid limit orders
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1

    // Create market order to fill first three asks
    await orderBookHelper.connect(acc1).swapExactInput(0, 1, 300, 3);

    let order_ids = await router.getLimitOrders(0);

    expect(order_ids[0].length).to.equal(2);
    expect(order_ids[0]).to.deep.equal([5, 6]);
  });

  it("swapExactInput test by selling token0 and refunding not filled amountIn", async function () {
    const { router, orderBookHelper, acc1, token1 } = await get_setup_values();

    // Create 5 bid limit orders
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1

    // Create market order to fill first three asks
    await orderBookHelper.connect(acc1).swapExactInput(0, 1, 600, 5);
    let order_ids = await router.getLimitOrders(0);

    expect(order_ids[0].length).to.equal(0);
    // test the token0 balance in order helper should be 0
    expect(
      await token1.connect(acc1).balanceOf(orderBookHelper.address)
    ).to.equal(0);
  });

  it("swapExactInput test by selling token0, even if size tick is wrong", async function () {
    const { router, orderBookHelper, acc1 } = await get_setup_values();

    // Create 5 bid limit orders
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1

    // Create market order to fill first three asks
    await orderBookHelper.connect(acc1).swapExactInput(0, 1, 379, 3);

    let order_ids = await router.getLimitOrders(0);

    expect(order_ids[0].length).to.equal(2);
    expect(order_ids[0]).to.deep.equal([5, 6]);
  });

  it("swapExactInput should fail if amountIn is smaller than size tick", async function () {
    const { router, orderBookHelper, acc1 } = await get_setup_values();

    // Create 5 bid limit orders
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1

    // Create market order to fill first three asks
    await expect(
      orderBookHelper.connect(acc1).swapExactInput(0, 1, 54, 6)
    ).to.be.revertedWith("Invalid size");
  });

  it("swapExactInput should fail if minAmountOut is not reached", async function () {
    const { router, orderBookHelper, acc1 } = await get_setup_values();

    // Create 5 bid limit orders
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
    await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1

    // Create market order to fill first three asks
    await expect(
      orderBookHelper.connect(acc1).swapExactInput(0, 1, 300, 6)
    ).to.be.revertedWith("Slippage is too high or not enough liquidty");
  });
});
