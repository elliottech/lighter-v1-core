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
    const priceTick: number = 10; // decimal=3 so multiples of 0.001
    await factory.createOrderBook(token0.address, token1.address, 2, 1);

    const priceMultiplier = (priceTick * sizeTick) / (10 ** 3);

    return {
      router,
      token0,
      token1,
      owner,
      acc1,
      acc2,
      sizeTick,
      priceTick,
      priceMultiplier,
    };
  }

  it("Bid-Market-Order match with Ask-Limit-Orders", async function () {
    const { router, token0, token1, acc1, acc2, sizeTick, priceMultiplier } = await get_setup_values();
    const marketMaker = acc2;
    const marketTaker = acc1;
    const td = BigInt(1000000); // token decimals

    const token1_balance_bef_limit_order_market_maker = await token1.balanceOf(marketMaker.address);
    const token0_balance_bef_limit_order_market_maker = await token0.balanceOf(marketMaker.address);

    const orderBookId: number = 0;
    const amount0base_limit: number = 1;
    const price0Base_limit: number = 1;
    const isAsk_limit: number = 1;
    const hintId: number = 0;

    // Create 5 ask-limit orders
    await router.connect(marketMaker).createLimitOrder(orderBookId, amount0base_limit, price0Base_limit, isAsk_limit, hintId); // 2
    await router.connect(marketMaker).createLimitOrder(orderBookId, amount0base_limit, price0Base_limit, isAsk_limit, hintId); // 3
    await router.connect(marketMaker).createLimitOrder(orderBookId, amount0base_limit, price0Base_limit, isAsk_limit, hintId); // 4
    await router.connect(marketMaker).createLimitOrder(orderBookId, amount0base_limit, price0Base_limit, isAsk_limit, hintId); // 5
    await router.connect(marketMaker).createLimitOrder(orderBookId, amount0base_limit, price0Base_limit, isAsk_limit, hintId); // 6

    const token1_balance_aft_limit_order_market_maker = await token1.balanceOf(marketMaker.address);
    const token0_balance_aft_limit_order_market_maker = await token0.balanceOf(marketMaker.address);
    
    //assert the balance of token0 for market-maker
    //after submitting 5 limit orders (ask - token0) -> with token-amount:1 for each limit-order, 
    //the balance of token0 for market-maker should decrease by 5 * sizeTick
    expect(
      (token0_balance_aft_limit_order_market_maker).eq(
        BigInt(token0_balance_bef_limit_order_market_maker) - BigInt(5 * sizeTick)
      )
    ).to.be.true;

    const token1_balance_bef_mkt_order_market_taker = await token1.balanceOf(marketTaker.address);
    const token0_balance_bef_mkt_order_market_taker = await token0.balanceOf(marketTaker.address);
  
    const amount0base_bid_market: number = 3;
    const price0Base_bid_market: number = 1;
    const isAsk_bid_market: number = 0;

    // Create bid-market order to fill first 3 limit-ask orders
    // market-order to buy token0 of amount: 3 after including size-tick it will be: 3 * 100 = 300
    await router.connect(marketTaker).createMarketOrder(orderBookId, amount0base_bid_market, price0Base_bid_market, isAsk_bid_market);

    let order_ids = await router.getLimitOrders(0);

    const token0_balance_aft_mkt_order_market_taker = await token0.balanceOf(marketTaker.address);
    const token1_balance_aft_mkt_order_market_maker = await token1.balanceOf(marketMaker.address);
    
    expect(order_ids[0].length).to.equal(2);
    expect(order_ids[0]).to.deep.equal([5, 6]);
    //assert the balance of token0 for market-taker
    //after matching with 3 limit orders, 
    //the balance of token0 for market-taker should increase by 300 amount
    expect(
      (token0_balance_aft_mkt_order_market_taker).eq(
        BigInt(token0_balance_bef_mkt_order_market_taker) + BigInt(3 * sizeTick)
      )
    ).to.be.true;

    //assert the balance of token1 for market-maker
    //after matching bid-market-order with 3 ask-limit-orders, 
    //the balance of token1 for market-maker should increase by 3 amount
    expect(
      (token1_balance_aft_mkt_order_market_maker).eq(
        BigInt(token1_balance_aft_limit_order_market_maker) + BigInt(3 * amount0base_limit * price0Base_limit * priceMultiplier)
      )
    ).to.be.true;

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

  it("Market-Bid order tests with fallback function", async function () {
    const { router, token0, token1, acc1, acc2 } = await get_setup_values();

    const tokenAmount = "10000000000000";

    const td = BigInt(1000000); // token decimals
    const startBalance = BigInt(tokenAmount);

    //send market-ask order with hintId: 0, amount(token0): 15 tokens at limit-price 1
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

    //send market-ask order with hintId: 1, amount(token0): 25 tokens at limit-price 1
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

    //send market-ask order with hintId: 3, amount(token0): 5 tokens at limit-price 1
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

    //send market-Bid order for 45 token0 tokens (current market price: 1)
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

    //assert the balance of token0 for market-taker
    //after matching with 3 limit orders, the balance of token0 should increase by 45*100 amount
    expect(
      (await token0.balanceOf(acc2.address)).eq(
        startBalance + BigInt(4500) * td
      )
    ).to.be.true;

    //assert the balance of token1 for market-taker
    //after matching with 3 limit orders, the balance of token1 should decrease by 15*1+25*1+5*1
    expect(
      (await token1.balanceOf(acc2.address)).eq(startBalance - BigInt(135) * td)
    ).to.be.true;
  });
});
