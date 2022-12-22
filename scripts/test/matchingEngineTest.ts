import { BigNumber } from "bignumber.js";
import { ethers } from "hardhat";

const USDC = "";
const WETH = "";
const ROUTER_ADDR = "";
const PRIVATE_KEY = "";

let router: any, account: any;

const commonAskPrice = new BigNumber(1249.5);
const commonBidPrice = new BigNumber(1250.5);

const setup = async () => {
  router = await ethers.getContractAt("Router", ROUTER_ADDR);
  account = new ethers.Wallet(PRIVATE_KEY, ethers.provider);
};

class Order {
  constructor(
    public id: number,
    public amount0: BigNumber,
    public amount1: BigNumber,
    public price: BigNumber,
    public isAsk: boolean
  ) {}
}

class OrderBook {
  private asks: Order[];
  private bids: Order[];
  private orderIdCounter = 2;
  constructor() {
    this.asks = [];
    this.bids = [];
  }

  private reOrder(isAsk: boolean) {
    if (isAsk) {
      this.asks.sort((a, b) => a.price.minus(b.price).toNumber());
    } else {
      this.bids.sort((a, b) => b.price.minus(a.price).toNumber());
    }
  }

  private matchOrders(order: Order) {
    let remainingOrder = order;
    let isRemaining = false;
    if (order.isAsk) {
      for (let i = 0; true; i++) {
        if (i >= this.bids.length) break;
        const bid = this.bids[i];
        if (bid.price.lt(order.price)) break;
        const amountToTake = bid.amount0.lte(order.amount0)
          ? bid.amount0
          : order.amount0;
        bid.amount0 = bid.amount0.minus(amountToTake);
        order.amount0 = order.amount0.minus(amountToTake);
        bid.amount1 = bid.amount0
          .multipliedBy(bid.price)
          .dividedBy(new BigNumber(10).pow(12));
        order.amount1 = order.amount0
          .multipliedBy(order.price)
          .dividedBy(new BigNumber(10).pow(12));
        if (bid.amount0.isZero()) {
          this.bids.splice(i, 1);
          i--;
        } else {
          this.bids[i] = bid;
        }
        if (order.amount0.isZero()) {
          break;
        }
      }
    } else {
      for (let i = 0; true; i++) {
        if (i >= this.asks.length) break;
        const ask = this.asks[i];
        if (ask.price.gt(order.price)) break;
        const amountToTake = ask.amount0.lte(order.amount0)
          ? ask.amount0
          : order.amount0;
        ask.amount0 = ask.amount0.minus(amountToTake);
        order.amount0 = order.amount0.minus(amountToTake);
        ask.amount1 = ask.amount0
          .multipliedBy(ask.price)
          .dividedBy(new BigNumber(10).pow(12));
        order.amount1 = order.amount0
          .multipliedBy(order.price)
          .dividedBy(new BigNumber(10).pow(12));
        if (ask.amount0.isZero()) {
          this.asks.splice(i, 1);
          i--;
        } else {
          this.asks[i] = ask;
        }
        if (order.amount0.isZero()) {
          break;
        }
      }
    }
    if (!order.amount0.isZero()) {
      isRemaining = true;
      remainingOrder = order;
    }
    return { remainingOrder, isRemaining };
  }

  public addOrder(order: Order) {
    const { remainingOrder, isRemaining } = this.matchOrders(order);
    if (isRemaining) {
      if (order.isAsk) {
        this.asks.push(remainingOrder);
      } else {
        this.bids.push(remainingOrder);
      }
      this.reOrder(order.isAsk);
    }
  }

  public updateOrder(
    orderId: number,
    isAsk: boolean,
    amount0: BigNumber,
    price: BigNumber
  ) {
    this.cancelLimitOrder(orderId, isAsk);
    const newOrderId = this.getNextOrderID();
    this.addOrder(
      new Order(
        newOrderId,
        amount0,
        amount0.multipliedBy(price).dividedBy(new BigNumber(10).pow(12)),
        price,
        isAsk
      )
    );
  }

  public getOrders() {
    const allOrders = [...this.asks, ...this.bids];
    return {
      amount0: allOrders.map((o) => o.amount0),
      amount1: allOrders.map((o) => o.amount1),
      isAsk: allOrders.map((o) => o.isAsk),
      id: allOrders.map((o) => o.id),
    };
  }

  public getNextOrderID() {
    return this.orderIdCounter++;
  }

  public createMarketOrder(order: Order) {
    this.matchOrders(order);
  }

  public cancelLimitOrder(orderId: number, isAsk: boolean) {
    if (isAsk) {
      const index = this.asks.findIndex((o) => o.id === orderId);
      if (index !== -1) {
        this.asks.splice(index, 1);
      }
    } else {
      const index = this.bids.findIndex((o) => o.id === orderId);
      if (index !== -1) {
        this.bids.splice(index, 1);
      }
    }
  }
}

async function createMarketOrder(orderBook: OrderBook) {
  const size = new BigNumber(10)
    .pow(18)
    .multipliedBy(Math.round(Math.random() * 100));
  const sizeBase = size.dividedBy(new BigNumber(10).pow(14));
  const isAsk = Math.random() < 0.5;
  const price = new BigNumber(isAsk ? 1200 : 1300);
  const priceBase = price.multipliedBy(100);
  const amount1 = size.multipliedBy(price).dividedBy(new BigNumber(10).pow(12));
  if (amount1.isEqualTo(new BigNumber(0)) || size.isEqualTo(new BigNumber(0))) {
    return;
  }

  console.log(
    "CREATE MARKET ORDER: ",
    sizeBase.toFixed(),
    priceBase.toFixed(),
    isAsk
  );
  const orderId = orderBook.getNextOrderID();
  orderBook.createMarketOrder(new Order(orderId, size, amount1, price, isAsk));
  const txn = await router
    .connect(account)
    .createMarketOrder("0", sizeBase.toFixed(), priceBase.toFixed(), isAsk);
  await txn.wait();
  LastMessage =
    "Created Market Order: " +
    orderId +
    " price: " +
    price.toString() +
    " isAsk: " +
    isAsk +
    " amount1: " +
    amount1.toString() +
    " amount0: " +
    size.toString() +
    " sizeBase: " +
    sizeBase.toString() +
    " priceBase: " +
    priceBase.toString();
}

async function updateLimitOrder(orderBook: OrderBook) {
  const orders = orderBook.getOrders();
  if (orders.id.length === 0) return;
  var price = new BigNumber(1240 + Math.round(Math.random() * 200) / 10);
  const size = new BigNumber(10)
    .pow(18)
    .multipliedBy(Math.round(Math.random() * 100) / 10);
  const sizeBase = size.dividedBy(new BigNumber(10).pow(14));
  const index = Math.floor(Math.random() * orders.id.length);
  const orderId = orders.id[index];
  const isAsk = orders.isAsk[index];
  if (Math.random() < 0.3) {
    price = isAsk ? commonAskPrice : commonBidPrice;
  }
  const priceBase = price.multipliedBy(100);
  const amount1 = size.multipliedBy(price).dividedBy(new BigNumber(10).pow(12));
  if (amount1.isEqualTo(new BigNumber(0)) || size.isEqualTo(new BigNumber(0))) {
    return;
  }
  console.log(
    "CREATE LIMIT ORDER: ",
    orderId,
    sizeBase.toFixed(),
    priceBase.toFixed(),
    isAsk
  );
  const txn = await router
    .connect(account)
    .updateLimitOrder(
      "0",
      orderId.toString(),
      sizeBase.toFixed(),
      priceBase.toFixed(),
      await router.getMockIndexToInsert(
        "0",
        size.toFixed(),
        amount1.toFixed(),
        isAsk
      )
    );
  await txn.wait();
  orderBook.updateOrder(orderId, isAsk, size, price);
  LastMessage =
    "Updated Limit Order: " +
    orderId +
    " price: " +
    price.toString() +
    " isAsk: " +
    isAsk +
    " amount1: " +
    amount1.toString() +
    " amount0: " +
    size.toString() +
    " sizeBase: " +
    sizeBase.toString() +
    " priceBase: " +
    priceBase.toString();
}

async function createLimitOrder(orderBook: OrderBook) {
  var price = new BigNumber(1240 + Math.round(Math.random() * 200) / 10);
  const isAsk = Math.random() < 0.5;
  if (Math.random() < 0.3) {
    price = isAsk ? commonAskPrice : commonBidPrice;
  }
  const size = new BigNumber(10)
    .pow(18)
    .multipliedBy(Math.round(Math.random() * 100) / 1000);
  const sizeBase = size.dividedBy(new BigNumber(10).pow(14));
  const priceBase = price.multipliedBy(100);
  const amount1 = size.multipliedBy(price).dividedBy(new BigNumber(10).pow(12));
  if (amount1.isEqualTo(new BigNumber(0)) || size.isEqualTo(new BigNumber(0))) {
    return;
  }

  console.log(
    "CREATE LIMIT ORDER: ",
    sizeBase.toFixed(),
    priceBase.toFixed(),
    isAsk
  );
  const orderId = orderBook.getNextOrderID();
  const order = new Order(orderId, size, amount1, price, isAsk);
  orderBook.addOrder(order);
  const txn = await router
    .connect(account)
    .createLimitOrder(
      "0",
      sizeBase.toFixed(),
      priceBase.toFixed(),
      isAsk,
      await router.getMockIndexToInsert(
        "0",
        size.toFixed(),
        amount1.toFixed(),
        isAsk
      )
    );
  await txn.wait();
  LastMessage =
    "Created Limit Order: " +
    orderId +
    " price: " +
    price.toString() +
    " isAsk: " +
    isAsk +
    " amount1: " +
    amount1.toString() +
    " amount0: " +
    size.toString() +
    " sizeBase: " +
    sizeBase.toString() +
    " priceBase: " +
    priceBase.toString();
}

async function cancelLimitOrder(orderBook: OrderBook) {
  const orders = orderBook.getOrders();
  if (orders.id.length === 0) {
    return;
  }
  const index = Math.floor(Math.random() * orders.id.length);
  orderBook.cancelLimitOrder(orders.id[index], orders.isAsk[index]);
  const txn = await router
    .connect(account)
    .cancelLimitOrder("0", orders.id[index].toString());
  await txn.wait();
  LastMessage = "Cancelled Limit Order: " + orders.id[index].toString();
}

let LastMatchingServerOrders: any;
let LastMessage: string;

function printMismatch(
  localOrders: {
    amount0: BigNumber[];
    amount1: BigNumber[];
    isAsk: boolean[];
    id: number[];
  },
  serverOrders: any
) {
  console.log("MISMATCH");

  console.log("LastMatchingServerOrders: ", LastMatchingServerOrders);

  console.log("------------------");

  console.log("localOrders:");
  console.log("ID", localOrders.id);
  console.log(
    "AMOUNT0",
    localOrders.amount0.map((a) => a.toFixed())
  );
  console.log(
    "AMOUNT1",
    localOrders.amount1.map((a) => a.toFixed())
  );
  console.log("ISASK", localOrders.isAsk);
  console.log("------------------");
  console.log("serverOrders:\n", serverOrders);
  console.log("------------------");
  console.log("LastMessage", LastMessage);
}

async function compare(orderBook: OrderBook) {
  const serverOrders = await router.connect(account).getLimitOrders("0");
  const localOrders = orderBook.getOrders();
  const serverAmount0 = serverOrders[2].map((a: BigNumber) => a.toString());
  const serverAmount1 = serverOrders[3].map((a: BigNumber) => a.toString());
  const localAmount0 = localOrders.amount0.map((a) => a.toString());
  const localAmount1 = localOrders.amount1.map((a) => a.toString());
  let mismatch = false;
  if (serverAmount0.length != localAmount0.length) {
    console.log("amount0 length mismatch");
  }

  let amount0Sum = new BigNumber(0);
  let amount1Sum = new BigNumber(0);
  for (let i = 0; i < serverAmount0.length; i++) {
    if (serverAmount0[i] != localAmount0[i]) {
      console.log("amount0 mismatch");
      mismatch = true;
      break;
    }
    if (serverAmount1[i] != localAmount1[i]) {
      console.log("amount1 mismatch");
      mismatch = true;
      break;
    }
    if (serverOrders[4][i] != localOrders.isAsk[i]) {
      console.log("isAsk mismatch");
      mismatch = true;
      break;
    }
    if (serverOrders[4][i]) {
      amount0Sum = amount0Sum.plus(new BigNumber(serverAmount0[i]));
    } else {
      amount1Sum = amount1Sum.plus(new BigNumber(serverAmount1[i]));
    }
  }
  if (mismatch) {
    printMismatch(localOrders, serverOrders);
  } else {
    LastMatchingServerOrders = serverOrders;
  }
  const USDC_ADDR = await ethers.getContractAt("IERC20Metadata", USDC);
  const WETH_ADDR = await ethers.getContractAt("IERC20Metadata", WETH);
  if (!(await WETH_ADDR.balanceOf(ROUTER_ADDR)).eq(amount0Sum.toString())) {
    console.log("WETH balance mismatch");
    console.log(
      amount0Sum.toString(),
      (await WETH_ADDR.balanceOf(ROUTER_ADDR)).toString()
    );
    console.log(serverAmount0, serverAmount1);
    console.log("------------------");
    console.log(localAmount0, localAmount1);
    mismatch = true;
  }

  if (!(await USDC_ADDR.balanceOf(ROUTER_ADDR)).eq(amount1Sum.toString())) {
    console.log("USDC balance mismatch");
    console.log(
      amount1Sum.toString(),
      (await USDC_ADDR.balanceOf(ROUTER_ADDR)).toString()
    );
    console.log(serverAmount0, serverAmount1);
    console.log("------------------");
    console.log(localAmount0, localAmount1);
    mismatch = true;
  }

  return !mismatch;
}

async function run(orderBook: OrderBook) {
  let runNumber = 0;
  while (true) {
    const randomVal = Math.random();
    if (randomVal < 0.05) {
      await createMarketOrder(orderBook);
    } else if (randomVal >= 0.05 && randomVal < 0.1) {
      await cancelLimitOrder(orderBook);
    } else if (randomVal >= 0.1 && randomVal < 0.15) {
      await updateLimitOrder(orderBook);
    } else {
      await createLimitOrder(orderBook);
    }
    if (!(await compare(orderBook))) {
      break;
    }
    runNumber++;
    console.log(runNumber);
  }
}

async function main() {
  await setup();
  const orderBook = new OrderBook();
  run(orderBook);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
