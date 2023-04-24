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

    const [, orderBookAddress] = await factory.getOrderBookDetailsFromId(0);

    return {
      router,
      orderBookHelper,
      orderBookAddress,
      token0,
      token1,
      owner,
      acc1,
      acc2,
      sizeTick,
      priceTick,
    };
  }

  describe("getAllOrderBooks", function () {
    it("getAllOrderBooks test", async function () {
      const { orderBookHelper } = await get_setup_values(); // Create the order book

      const result = await orderBookHelper.getAllOrderBooks();

      expect(result.orderBookIds[0]).to.equal(0);
      expect(result.orderBookAddresses[0]).to.equal(
        "0x75537828f2ce51be7289709686A69CbFDbB714F1"
      );
      expect(result.token0s[0]).to.equal(
        "0x0165878A594ca255338adfa4d48449f69242Eb8F"
      );
      expect(result.token1s[0]).to.equal(
        "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"
      );
      expect(result.sizeTicks[0]).to.equal(100);
      expect(result.priceTicks[0]).to.equal(10);
    });
  });

  describe("quoteExactOutput, isAsk=True", function () {
    it("quoteExactOutput test by selling token0", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 bid limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1

      // Create market order to fill first three asks
      const result = await orderBookHelper
        .connect(acc1)
        .quoteExactOutput(0, 1, 3);

      expect(result[0]).to.equal(300);
      expect(result[1]).to.equal(3);
    });

    it("quoteExactOutput test by selling token0, diff price", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 bid limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 2, 0, 0); // amount0 = 100, amount1 = 2
      await router.connect(acc1).createLimitOrder(0, 1, 3, 0, 0); // amount0 = 100, amount1 = 3
      await router.connect(acc1).createLimitOrder(0, 1, 4, 0, 0); // amount0 = 100, amount1 = 4
      await router.connect(acc1).createLimitOrder(0, 1, 5, 0, 0); // amount0 = 100, amount1 = 5

      // Create market order to fill first three asks
      const result = await orderBookHelper
        .connect(acc1)
        .quoteExactOutput(0, 1, 12);

      expect(result[0]).to.equal(300);
      expect(result[1]).to.equal(12);
    });

    it("quoteExactOutput test by selling token0, not enough liquidity", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 bid limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 2, 0, 0); // amount0 = 100, amount1 = 2
      await router.connect(acc1).createLimitOrder(0, 1, 3, 0, 0); // amount0 = 100, amount1 = 3
      await router.connect(acc1).createLimitOrder(0, 1, 4, 0, 0); // amount0 = 100, amount1 = 4
      await router.connect(acc1).createLimitOrder(0, 1, 5, 0, 0); // amount0 = 100, amount1 = 5

      // Create market order to fill first three asks
      const result = await orderBookHelper
        .connect(acc1)
        .quoteExactOutput(0, 1, 20);

      expect(result[0]).to.equal(500);
      expect(result[1]).to.equal(15);
    });

    it("quoteExactOutput test by selling token0, wrong tick", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 bid limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 2, 0, 0); // amount0 = 100, amount1 = 2
      await router.connect(acc1).createLimitOrder(0, 1, 3, 0, 0); // amount0 = 100, amount1 = 3
      await router.connect(acc1).createLimitOrder(0, 1, 4, 0, 0); // amount0 = 100, amount1 = 4
      await router.connect(acc1).createLimitOrder(0, 1, 5, 0, 0); // amount0 = 100, amount1 = 5

      // Create market order to fill first three asks
      const result = await orderBookHelper
        .connect(acc1)
        .quoteExactOutput(0, 1, 6);

      expect(result[0]).to.equal(100);
      expect(result[1]).to.equal(5);
    });
  });

  describe("quoteExactOutput, isAsk=False", function () {
    it("quoteExactOutput test by selling token1", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1

      // Create market order to fill first three asks
      const result = await orderBookHelper
        .connect(acc1)
        .quoteExactOutput(0, 0, 300);

      expect(result[0]).to.equal(3);
      expect(result[1]).to.equal(300);
    });

    it("quoteExactOutput test by selling token1, diff price", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 ask  limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 2, 1, 0); // amount0 = 100, amount1 = 2
      await router.connect(acc1).createLimitOrder(0, 1, 3, 1, 0); // amount0 = 100, amount1 = 3
      await router.connect(acc1).createLimitOrder(0, 1, 4, 1, 0); // amount0 = 100, amount1 = 4
      await router.connect(acc1).createLimitOrder(0, 1, 5, 1, 0); // amount0 = 100, amount1 = 5

      // Create market order to fill first three asks
      const result = await orderBookHelper
        .connect(acc1)
        .quoteExactOutput(0, 0, 500);

      expect(result[0]).to.equal(15);
      expect(result[1]).to.equal(500);
    });

    it("quoteExactOutput test by selling token0, not enough liquidity", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 bid limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 2, 1, 0); // amount0 = 100, amount1 = 2
      await router.connect(acc1).createLimitOrder(0, 1, 3, 1, 0); // amount0 = 100, amount1 = 3
      await router.connect(acc1).createLimitOrder(0, 1, 4, 1, 0); // amount0 = 100, amount1 = 4
      await router.connect(acc1).createLimitOrder(0, 1, 5, 1, 0); // amount0 = 100, amount1 = 5

      // Create market order to fill first three asks
      const result = await orderBookHelper
        .connect(acc1)
        .quoteExactOutput(0, 0, 600);

      expect(result[0]).to.equal(15);
      expect(result[1]).to.equal(500);
    });
  });

  describe("quoteExactInput, isAsk=True", function () {
    it("quoteExactInput test by selling token0", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 bid limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1

      // Create market order to fill first three asks
      const result = await orderBookHelper
        .connect(acc1)
        .quoteExactInput(0, 1, 300);

      expect(result[0]).to.equal(300);
      expect(result[1]).to.equal(3);
    });

    it("quoteExactInput test by selling token0, diff price", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 bid limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 2, 0, 0); // amount0 = 100, amount1 = 2
      await router.connect(acc1).createLimitOrder(0, 1, 3, 0, 0); // amount0 = 100, amount1 = 3
      await router.connect(acc1).createLimitOrder(0, 1, 4, 0, 0); // amount0 = 100, amount1 = 4
      await router.connect(acc1).createLimitOrder(0, 1, 5, 0, 0); // amount0 = 100, amount1 = 5

      // Create market order to fill first three asks
      const result = await orderBookHelper
        .connect(acc1)
        .quoteExactInput(0, 1, 300);

      expect(result[0]).to.equal(300);
      expect(result[1]).to.equal(12);
    });

    it("quoteExactInput test by selling token0, not enough liquidity", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 bid limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 2, 0, 0); // amount0 = 100, amount1 = 2
      await router.connect(acc1).createLimitOrder(0, 1, 3, 0, 0); // amount0 = 100, amount1 = 3
      await router.connect(acc1).createLimitOrder(0, 1, 4, 0, 0); // amount0 = 100, amount1 = 4
      await router.connect(acc1).createLimitOrder(0, 1, 5, 0, 0); // amount0 = 100, amount1 = 5

      // Create market order to fill first three asks
      const result = await orderBookHelper
        .connect(acc1)
        .quoteExactInput(0, 1, 1000);

      expect(result[0]).to.equal(500);
      expect(result[1]).to.equal(15);
    });
  });

  describe("quoteExactInput, isAsk=False", function () {
    it("quoteExactInput test by selling token1", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1

      // Create market order to fill first three asks
      const result = await orderBookHelper
        .connect(acc1)
        .quoteExactInput(0, 0, 3);

      expect(result[0]).to.equal(3);
      expect(result[1]).to.equal(300);
    });

    it("swapExactInput test by selling token1, diff price", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 2, 1, 0); // amount0 = 100, amount1 = 2
      await router.connect(acc1).createLimitOrder(0, 1, 3, 1, 0); // amount0 = 100, amount1 = 3
      await router.connect(acc1).createLimitOrder(0, 1, 4, 1, 0); // amount0 = 100, amount1 = 4
      await router.connect(acc1).createLimitOrder(0, 1, 5, 1, 0); // amount0 = 100, amount1 = 5

      // Create market order to fill first three asks
      const result = await orderBookHelper
        .connect(acc1)
        .quoteExactInput(0, 0, 7);

      expect(result[0]).to.equal(6);
      expect(result[1]).to.equal(300);
    });

    it("swapExactInput test by selling token1, not enough liquidity", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 2, 1, 0); // amount0 = 100, amount1 = 2
      await router.connect(acc1).createLimitOrder(0, 1, 3, 1, 0); // amount0 = 100, amount1 = 3
      await router.connect(acc1).createLimitOrder(0, 1, 4, 1, 0); // amount0 = 100, amount1 = 4
      await router.connect(acc1).createLimitOrder(0, 1, 5, 1, 0); // amount0 = 100, amount1 = 5

      // Create market order to fill first three asks
      const result = await orderBookHelper
        .connect(acc1)
        .quoteExactInput(0, 0, 16);

      expect(result[0]).to.equal(15);
      expect(result[1]).to.equal(500);
    });
  });

  describe("swapExactInput, isAsk=True", function () {
    it("swapExactInput test by selling token0", async function () {
      const { router, orderBookHelper, acc1, token0, token1 } =
        await get_setup_values();

      const initialAcc1Token0Balance = await token0.balanceOf(
        acc1.getAddress()
      );
      const initialAcc1Token1Balance = await token1.balanceOf(
        acc1.getAddress()
      );

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

      expect(await token0.balanceOf(orderBookHelper.address)).to.equal(0);
      expect(await token1.balanceOf(orderBookHelper.address)).to.equal(0);

      expect(await token0.balanceOf(acc1.getAddress())).to.equal(
        initialAcc1Token0Balance
      );
      expect(await token1.balanceOf(acc1.getAddress())).to.equal(
        initialAcc1Token1Balance.sub(2)
      );
    });

    it("swapExactInput test by selling token0 and refunding not filled amountIn", async function () {
      const { router, orderBookHelper, acc1, token1 } =
        await get_setup_values();

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

  describe("swapExactInput, isAsk=False", function () {
    it("swapExactInput test by selling token1", async function () {
      const { router, orderBookHelper, acc1, token0, token1 } =
        await get_setup_values();

      const initialAcc1Token0Balance = await token0
        .connect(acc1)
        .balanceOf(acc1.address);
      const initialAcc1Token1Balance = await token1
        .connect(acc1)
        .balanceOf(acc1.address);

      // Create 5 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1

      // Create market order to fill first three bids
      await orderBookHelper.connect(acc1).swapExactInput(0, 0, 3, 300);

      let order_ids = await router.getLimitOrders(0);

      expect(order_ids[0].length).to.equal(2);
      expect(order_ids[0]).to.deep.equal([5, 6]);

      expect(
        await token0.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(
        await token1.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(await token0.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token0Balance.sub(200)
      );

      expect(await token1.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token1Balance
      );
    });

    it("swapExactInput test by selling token1, input amount is bigger than the book", async function () {
      const { router, orderBookHelper, acc1, token0, token1 } =
        await get_setup_values();

      const initialAcc1Token0Balance = await token0
        .connect(acc1)
        .balanceOf(acc1.address);
      const initialAcc1Token1Balance = await token1
        .connect(acc1)
        .balanceOf(acc1.address);

      // Create 5 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1

      // Create market order to fill first three bids
      await orderBookHelper.connect(acc1).swapExactInput(0, 0, 5, 300);

      expect(
        await token0.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(
        await token1.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(await token0.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token0Balance
      );

      expect(await token1.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token1Balance
      );
    });

    it("swapExactInput test by selling token1, input amount is less than the book", async function () {
      const { router, orderBookHelper, acc1, token0, token1 } =
        await get_setup_values();

      const initialAcc1Token0Balance = await token0
        .connect(acc1)
        .balanceOf(acc1.address);
      const initialAcc1Token1Balance = await token1
        .connect(acc1)
        .balanceOf(acc1.address);

      // Create 5 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 5, 1, 1, 0); // amount0 = 500, amount1 = 5
      await router.connect(acc1).createLimitOrder(0, 5, 1, 1, 0); // amount0 = 500, amount1 = 5

      // Create market order to fill first three bids
      await orderBookHelper.connect(acc1).swapExactInput(0, 0, 7, 200);

      expect(
        await token0.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(
        await token1.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(await token0.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token0Balance.sub(300)
      );

      expect(await token1.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token1Balance
      );
    });

    it("swapExactInput test by selling token1, increasing price", async function () {
      const { router, orderBookHelper, acc1, token0, token1 } =
        await get_setup_values();

      const initialAcc1Token0Balance = await token0
        .connect(acc1)
        .balanceOf(acc1.address);
      const initialAcc1Token1Balance = await token1
        .connect(acc1)
        .balanceOf(acc1.address);

      // Create 5 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 5, 1, 1, 0); // amount0 = 500, amount1 = 5
      await router.connect(acc1).createLimitOrder(0, 5, 3, 1, 0); // amount0 = 500, amount1 = 15

      await orderBookHelper.connect(acc1).swapExactInput(0, 0, 20, 1000);

      expect(
        await token0.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(
        await token1.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(await token0.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token0Balance
      );

      expect(await token1.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token1Balance
      );
    });

    it("swapExactInput test by selling token1, not enough amount out", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 5, 1, 1, 0); // amount0 = 500, amount1 = 5
      await router.connect(acc1).createLimitOrder(0, 5, 4, 1, 0); // amount0 = 500, amount1 = 20

      await expect(
        orderBookHelper.connect(acc1).swapExactInput(0, 0, 20, 1000)
      ).to.be.revertedWith("Slippage is too high or not enough liquidty");
    });
  });

  describe("swapExactOutput, isAsk=True", function () {
    it("swapExactOutput test by selling token0", async function () {
      const { router, orderBookHelper, acc1, token0, token1 } =
        await get_setup_values();

      const initialAcc1Token0Balance = await token0
        .connect(acc1)
        .balanceOf(acc1.address);
      const initialAcc1Token1Balance = await token1
        .connect(acc1)
        .balanceOf(acc1.address);

      // Create 5 bid limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1

      // Create market order to fill first three bids
      await orderBookHelper.connect(acc1).swapExactOutput(0, 1, 3, 300);

      let order_ids = await router.getLimitOrders(0);

      expect(order_ids[0].length).to.equal(2);
      expect(order_ids[0]).to.deep.equal([5, 6]);

      expect(
        await token0.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(
        await token1.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(await token0.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token0Balance
      );

      expect(await token1.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token1Balance.sub(2)
      );
    });

    it("swapExactOutput test by selling token0, max input amount is bigger than the book", async function () {
      const { router, orderBookHelper, acc1, token0, token1 } =
        await get_setup_values();

      const initialAcc1Token0Balance = await token0
        .connect(acc1)
        .balanceOf(acc1.address);
      const initialAcc1Token1Balance = await token1
        .connect(acc1)
        .balanceOf(acc1.address);

      // Create 3 bid limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1

      // Create market order to fill first three bids
      await orderBookHelper.connect(acc1).swapExactOutput(0, 1, 3, 400); // amountOut = 3, maxAmountin = 400

      let order_ids = await router.getLimitOrders(0);

      expect(order_ids[0].length).to.equal(0);

      expect(
        await token0.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(
        await token1.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(await token0.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token0Balance
      );

      expect(await token1.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token1Balance
      );
    });

    it("swapExactOutput test by selling token0, max amount in is smaller than the book", async function () {
      const { router, orderBookHelper, acc1, token0, token1 } =
        await get_setup_values();

      const initialAcc1Token0Balance = await token0
        .connect(acc1)
        .balanceOf(acc1.address);
      const initialAcc1Token1Balance = await token1
        .connect(acc1)
        .balanceOf(acc1.address);

      // Create 3 bid limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 0, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 3, 1, 0, 0); // amount0 = 300, amount1 = 3

      // Create market order to fill first three bids
      await orderBookHelper.connect(acc1).swapExactOutput(0, 1, 3, 300); // amountOut = 3, maxAmountin = 300

      let order_ids = await router.getLimitOrders(0);

      expect(order_ids[0].length).to.equal(1);
      expect(order_ids[0]).to.deep.equal([4]);

      expect(
        await token0.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(
        await token1.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(await token0.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token0Balance
      );

      expect(await token1.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token1Balance.sub(2)
      );
    });

    it("swapExactOutput test by selling token0, should get the lower amount out if tick is wrong", async function () {
      const { router, orderBookHelper, acc1, token0, token1 } =
        await get_setup_values();

      const initialAcc1Token0Balance = await token0
        .connect(acc1)
        .balanceOf(acc1.address);
      const initialAcc1Token1Balance = await token1
        .connect(acc1)
        .balanceOf(acc1.address);

      // Create 5 bid limit orders
      await router.connect(acc1).createLimitOrder(0, 5, 1, 0, 0); // amount0 = 500, amount1 = 5
      await router.connect(acc1).createLimitOrder(0, 5, 4, 0, 0); // amount0 = 500, amount1 = 20

      await orderBookHelper.connect(acc1).swapExactOutput(0, 1, 5, 700);

      let order_ids = await router.getLimitOrders(0);

      expect(
        await token0.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(
        await token1.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(await token0.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token0Balance
      );

      expect(await token1.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token1Balance.sub(21)
      );
    });

    it("swapExactOutput test by selling token0, not enough amount out", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();
      // Create 5 bid limit orders
      await router.connect(acc1).createLimitOrder(0, 5, 1, 0, 0); // amount0 = 500, amount1 = 5
      await router.connect(acc1).createLimitOrder(0, 5, 4, 0, 0); // amount0 = 500, amount1 = 20

      await expect(
        orderBookHelper.connect(acc1).swapExactOutput(0, 1, 30, 1100)
      ).to.be.revertedWith("Slippage is too high");
    });

    it("swapExactOutput test by selling token0, min amount in exceeded", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 bid limit orders
      await router.connect(acc1).createLimitOrder(0, 5, 1, 0, 0); // amount0 = 500, amount1 = 5
      await router.connect(acc1).createLimitOrder(0, 5, 4, 0, 0); // amount0 = 500, amount1 = 20

      await expect(
        orderBookHelper.connect(acc1).swapExactOutput(0, 1, 20, 400) // amountOut = 20, maxAmountin = 400
      ).to.be.revertedWith("Slippage is too high");
    });
  });

  describe("swapExactOutput, isAsk=False", function () {
    it("swapExactOutput test by selling token1", async function () {
      const { router, orderBookHelper, acc1, token0, token1 } =
        await get_setup_values();

      const initialAcc1Token0Balance = await token0
        .connect(acc1)
        .balanceOf(acc1.address);
      const initialAcc1Token1Balance = await token1
        .connect(acc1)
        .balanceOf(acc1.address);

      // Create 5 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1

      // Create market order to fill first three bids
      await orderBookHelper.connect(acc1).swapExactOutput(0, 0, 300, 3); // amount 0 = 300, maxAmount1 = 3

      let order_ids = await router.getLimitOrders(0);

      expect(order_ids[0].length).to.equal(2);
      expect(order_ids[0]).to.deep.equal([5, 6]);

      expect(
        await token0.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(
        await token1.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(await token0.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token0Balance.sub(200)
      );

      expect(await token1.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token1Balance
      );
    });

    it("swapExactOutput test by selling token1, max input amount is bigger than the book", async function () {
      const { router, orderBookHelper, acc1, token0, token1 } =
        await get_setup_values();

      const initialAcc1Token0Balance = await token0
        .connect(acc1)
        .balanceOf(acc1.address);
      const initialAcc1Token1Balance = await token1
        .connect(acc1)
        .balanceOf(acc1.address);

      // Create 3 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1

      // Create market order to fill first three bids
      await orderBookHelper.connect(acc1).swapExactOutput(0, 0, 300, 4); // amountOut = 300, maxAmountin = 4

      expect(
        await token0.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(
        await token1.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(await token0.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token0Balance
      );

      expect(await token1.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token1Balance
      );
    });

    it("swapExactOutput test by selling token1, amount out is smaller than the book", async function () {
      const { router, orderBookHelper, acc1, token0, token1 } =
        await get_setup_values();

      const initialAcc1Token0Balance = await token0
        .connect(acc1)
        .balanceOf(acc1.address);
      const initialAcc1Token1Balance = await token1
        .connect(acc1)
        .balanceOf(acc1.address);

      // Create 3 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 1, 1, 1, 0); // amount0 = 100, amount1 = 1
      await router.connect(acc1).createLimitOrder(0, 3, 1, 1, 0); // amount0 = 300, amount1 = 3

      // Create market order to fill first three bids
      await orderBookHelper.connect(acc1).swapExactOutput(0, 0, 300, 3); // amountOut = 300, maxAmountin = 3

      expect(
        await token0.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(
        await token1.connect(acc1).balanceOf(orderBookHelper.address)
      ).to.equal(0);

      expect(await token0.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token0Balance.sub(200)
      );

      expect(await token1.connect(acc1).balanceOf(acc1.address)).to.equal(
        initialAcc1Token1Balance
      );
    });

    it("swapExactOutput test by selling token1, not enough amount out", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 5, 1, 1, 0); // amount0 = 500, amount1 = 5
      await router.connect(acc1).createLimitOrder(0, 5, 4, 1, 0); // amount0 = 500, amount1 = 20

      await expect(
        orderBookHelper.connect(acc1).swapExactOutput(0, 0, 1100, 30) // amountOut = 1100, maxAmountin = 30
      ).to.be.revertedWith("Not enough liquidity");
    });

    it("swapExactOutput test by selling token1, not enough amount in", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 5, 1, 1, 0); // amount0 = 500, amount1 = 5
      await router.connect(acc1).createLimitOrder(0, 5, 4, 1, 0); // amount0 = 500, amount1 = 20

      await expect(
        orderBookHelper.connect(acc1).swapExactOutput(0, 0, 1100, 25) // amountOut = 1100, maxAmountin = 30
      ).to.be.revertedWith("Slippage is too high");
    });

    it("swapExactOutput test by selling token1, min amount in exceeded", async function () {
      const { router, orderBookHelper, acc1 } = await get_setup_values();

      // Create 5 ask limit orders
      await router.connect(acc1).createLimitOrder(0, 5, 1, 1, 0); // amount0 = 500, amount1 = 5
      await router.connect(acc1).createLimitOrder(0, 5, 4, 1, 0); // amount0 = 500, amount1 = 20

      await expect(
        orderBookHelper.connect(acc1).swapExactOutput(0, 0, 700, 5)
      ).to.be.revertedWith("Slippage is too high");
    });
  });
});
