import { ethers } from "hardhat";
import { BigNumber } from "bignumber.js";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PRIVATE_KEY = "";
const MARKET_MAKER_ACCOUNT = ethers.utils.computeAddress(PRIVATE_KEY);
const axios = require("axios");

// Contract addresses
const USDC_ADDRESS = "0xcC4a8FA63cE5C6a7f4A7A3D2EbCb738ddcD31209";
const WETH_ADDRESS = "0x4d541F0B8039643783492F9865C7f7de4F54eB5f";
const WBTC_ADDRESS = "0xF133Eb356537F0B3B4fDfB98233b45Ef8138aA56";
const LINK_ADDRESS = "0x61D602BF3B1e511C746059ba089409aC43299be4";
const UNI_ADDRESS = "0xC96649C363E93874467480D4b3Eba97064608B18";
const DEX_ROUTER_ADDRESS = "0x77af67cFD12585627cB7aA546d305a3844155E21";

const TOKENS: Record<string, any> = {
  "0xcC4a8FA63cE5C6a7f4A7A3D2EbCb738ddcD31209": {
    symbol: "USDC",
    decimals: 6,
    powDecimals: new BigNumber(10).pow(6),
  },
  "0x4d541F0B8039643783492F9865C7f7de4F54eB5f": {
    symbol: "WETH",
    decimals: 18,
    powDecimals: new BigNumber(10).pow(18),
  },
  "0xF133Eb356537F0B3B4fDfB98233b45Ef8138aA56": {
    symbol: "WBTC",
    decimals: 8,
    powDecimals: new BigNumber(10).pow(8),
  },
  "0x61D602BF3B1e511C746059ba089409aC43299be4": {
    symbol: "LINK",
    decimals: 18,
    powDecimals: new BigNumber(10).pow(18),
  },
  "0xC96649C363E93874467480D4b3Eba97064608B18": {
    symbol: "UNI",
    decimals: 18,
    powDecimals: new BigNumber(10).pow(18),
  },
};

let ORDER_BOOKS = [
  {
    token0: {
      address: WETH_ADDRESS,
      symbol: "WETH",
    },
    token1: {
      address: USDC_ADDRESS,
      symbol: "USDC",
    },
    marketId: "0",
    sizeTick: new BigNumber(100000000000000),
    priceTick: new BigNumber(10000),
    priceMultiplier: new BigNumber(1),
    size: [1, 5],
    order1: 11,
    order2: 16,
    api: "https://api.binance.com/api/v3/depth?symbol=ETHBUSD&limit=100",
  },
  {
    token0: {
      address: WBTC_ADDRESS,
      symbol: "WBTC",
    },
    token1: {
      address: USDC_ADDRESS,
      symbol: "USDC",
    },
    marketId: "1",
    sizeTick: new BigNumber(10000),
    priceTick: new BigNumber(100000),
    priceMultiplier: new BigNumber(10),
    size: [1, 2],
    order1: 11,
    order2: 16,
    api: "https://api.binance.com/api/v3/depth?symbol=BTCBUSD&limit=100",
  },
  {
    token0: {
      address: LINK_ADDRESS,
      symbol: "LINK",
    },
    token1: {
      address: USDC_ADDRESS,
      symbol: "USDC",
    },
    marketId: "2",
    sizeTick: new BigNumber(10000000000000000),
    priceTick: new BigNumber(10000),
    priceMultiplier: new BigNumber(100),
    size: [100, 2000],
    order1: 11,
    order2: 16,
    api: "https://api.binance.com/api/v3/depth?symbol=LINKBUSD&limit=100",
  },
  {
    token0: {
      address: UNI_ADDRESS,
      symbol: "UNI",
    },
    token1: {
      address: USDC_ADDRESS,
      symbol: "USDC",
    },
    marketId: "3",
    sizeTick: new BigNumber(10000000000000000),
    priceTick: new BigNumber(10000),
    priceMultiplier: new BigNumber(100),
    size: [100, 2000],
    order1: 11,
    order2: 16,
    api: "https://api.binance.com/api/v3/depth?symbol=UNIBUSD&limit=100",
  },
];

let router: any, account: any;

const setup = async () => {
  router = await ethers.getContractAt("Router", DEX_ROUTER_ADDRESS);
  account = await new ethers.Wallet(PRIVATE_KEY, ethers.provider);
};

async function add_limit_order(
  orderBookId: string,
  amount0Base: string,
  priceBase: string,
  isAsk: boolean
) {
  const { wait } = await router
    .connect(account)
    .createLimitOrder(
      orderBookId,
      amount0Base,
      priceBase,
      isAsk,
      await router.getMockIndexToInsert(
        orderBookId,
        new BigNumber(amount0Base)
          .multipliedBy(
            new BigNumber(ORDER_BOOKS[Number(orderBookId)].sizeTick)
          )
          .toFixed(),
        new BigNumber(amount0Base)
          .multipliedBy(new BigNumber(priceBase))
          .multipliedBy(ORDER_BOOKS[Number(orderBookId)].priceMultiplier)
          .toFixed(),
        isAsk
      ),
      {
        gasLimit: 2000000,
      }
    );
  await wait();
  await delay(15000);
}

async function add_market_order(
  orderBookId: string,
  amount0Base: string,
  priceBase: string,
  isAsk: boolean
) {
  const { wait } = await router
    .connect(account)
    .createMarketOrder(orderBookId, amount0Base, priceBase, isAsk, {
      gasLimit: 20000000,
    });
  await wait();
  await delay(15000);
  return;
}

async function update_limit_order(
  orderBookId: string,
  id: string,
  newAmount0Base: string,
  newPriceBase: string,
  isAsk: boolean
) {
  const { wait } = await router
    .connect(account)
    .updateLimitOrder(
      orderBookId,
      id,
      newAmount0Base,
      newPriceBase,
      await router.getMockIndexToInsert(
        orderBookId,
        new BigNumber(newAmount0Base)
          .multipliedBy(
            new BigNumber(ORDER_BOOKS[Number(orderBookId)].sizeTick)
          )
          .toFixed(),
        new BigNumber(newAmount0Base)
          .multipliedBy(new BigNumber(newPriceBase))
          .multipliedBy(ORDER_BOOKS[Number(orderBookId)].priceMultiplier)
          .toFixed(),
        isAsk
      ),
      {
        gasLimit: 20000000,
      }
    );
  await wait();
  await delay(15000);
}

async function cancel_limit_order(orderBookId: string, id: string) {
  const { wait } = await router
    .connect(account)
    .cancelLimitOrder(orderBookId, id, {
      gasLimit: 20000000,
    });
  await wait();
  await delay(15000);
}

async function findBids(orderBookId: string) {
  const ids = [];
  const orders = await router.getLimitOrders(orderBookId);
  for (let i = 0; i < orders[0].length; i++) {
    if (orders[4][i] === false && orders[1][i] === MARKET_MAKER_ACCOUNT) {
      ids.push(orders[0][i]);
    }
  }
  while (ids.length < 10) {
    ids.push(-1);
  }
  return ids;
}

async function findAsks(orderBookId: string) {
  const ids = [];
  const orders = await router.getLimitOrders(orderBookId);
  for (let i = 0; i < orders[0].length; i++) {
    if (orders[4][i] === true && orders[1][i] === MARKET_MAKER_ACCOUNT) {
      ids.push(orders[0][i]);
    }
  }
  while (ids.length < 10) {
    ids.push(-1);
  }
  return ids;
}

const getRandSize = (l: number, r: number, tick: BigNumber, dec: BigNumber) => {
  return new BigNumber(Math.random() * (r - l) + l)
    .multipliedBy(dec)
    .integerValue()
    .dividedBy(tick)
    .integerValue();
};

const getRandMarketSize = (
  l: number,
  r: number,
  tick: BigNumber,
  dec: BigNumber
) => {
  return new BigNumber(Math.random() * (r - l) + l)
    .dividedBy(5)
    .multipliedBy(dec)
    .integerValue()
    .dividedBy(tick)
    .integerValue();
};

const getPrice = (
  orders: any,
  size: BigNumber,
  dec0: BigNumber,
  dec1: BigNumber,
  priceTick: BigNumber,
  multiplier: BigNumber
) => {
  let cur_size = new BigNumber(0);
  let cur_price = new BigNumber(0);
  for (let i = 0; i < orders.length; i++) {
    cur_price = cur_price.plus(
      new BigNumber(orders[i][0]).multipliedBy(new BigNumber(orders[i][1]))
    );
    cur_size = cur_size.plus(new BigNumber(orders[i][1]));
    if (cur_size.multipliedBy(dec0).gte(size)) break;
  }
  return cur_price
    .div(cur_size)
    .multipliedBy(dec1)
    .multipliedBy(multiplier)
    .integerValue()
    .dividedBy(priceTick)
    .integerValue();
};

const getAskSlippage = () => {
  // Returns a random number string in [1.000, 1.015]
  const num = Math.floor(Math.random() * 16);
  if (num >= 10) return "1.0".concat(num.toString());
  return "1.00".concat(num.toString());
};

const getBidSlippage = () => {
  // Returns a random number string in [0.985, 1.000]
  const num = Math.floor(Math.random() * 16) + 85;
  if (num == 100) return "1.000";
  return "0.9".concat(num.toString());
};

async function marketMake() {
  await setup();
  let idx = 0;
  while (1) {
    for (const order_book of ORDER_BOOKS) {
      for (idx = 0; idx < 3; idx++) {
        await (async () => {
          if (idx == 0) {
            const token0: string = order_book.token0.address;
            const token1: string = order_book.token1.address;
            const orderBookId = order_book.marketId;
            try {
              const data = (await axios.get(order_book.api)).data;
              const asks = data.asks;
              const bids = data.bids;
              const askIds = await findAsks(orderBookId);
              const bidIds = await findBids(orderBookId);
              for (let i = 0; i < 4; i++) {
                let size = getRandSize(
                  order_book.size[0],
                  order_book.size[1],
                  order_book.sizeTick,
                  TOKENS[token0].powDecimals
                );
                let size2 = getRandSize(
                  order_book.size[0],
                  order_book.size[1],
                  order_book.sizeTick,
                  TOKENS[token0].powDecimals
                );
                const ask_price = getPrice(
                  asks,
                  size,
                  TOKENS[token0].powDecimals,
                  TOKENS[token1].powDecimals,
                  order_book.priceTick,
                  new BigNumber(getAskSlippage())
                );

                const bid_price = getPrice(
                  bids,
                  size2,
                  TOKENS[token0].powDecimals,
                  TOKENS[token1].powDecimals,
                  order_book.priceTick,
                  new BigNumber(getBidSlippage())
                );

                if (askIds[i] !== -1) {
                  await update_limit_order(
                    orderBookId,
                    askIds[i],
                    size.toFixed(),
                    ask_price.toFixed(),
                    true
                  );
                } else {
                  await add_limit_order(
                    orderBookId,
                    size.toFixed(),
                    ask_price.toFixed(),
                    true
                  );
                }

                if (bidIds[i] !== -1) {
                  await update_limit_order(
                    orderBookId,
                    bidIds[i],
                    size2.toFixed(),
                    bid_price.toFixed(),
                    false
                  );
                } else {
                  await add_limit_order(
                    orderBookId,
                    size2.toFixed(),
                    bid_price.toFixed(),
                    false
                  );
                }
              }
            } catch (e) {
              console.log(
                "error in",
                order_book.token0.symbol,
                order_book.token1.symbol,
                e
              );
            }
          } else {
            const token0: string = order_book.token0.address;
            const token1: string = order_book.token1.address;
            const marketId = order_book.marketId;
            let size = getRandMarketSize(
              order_book.size[0],
              order_book.size[1],
              order_book.sizeTick,
              TOKENS[token0].powDecimals
            );
            const bid_price = new BigNumber("10000000");
            const ask_price = new BigNumber("1");

            await add_market_order(
              marketId,
              size.toFixed(),
              ask_price.toFixed(),
              true
            );
            let size2 = getRandMarketSize(
              order_book.size[0],
              order_book.size[1],
              order_book.sizeTick,
              TOKENS[token0].powDecimals
            );

            await add_market_order(
              marketId,
              size2.toFixed(),
              bid_price.toFixed(),
              false
            );
          }
        })();
      }
    }
  }
}

async function main() {
  marketMake();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
