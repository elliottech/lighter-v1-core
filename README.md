# Lighter Exchange V1

## Installing the dependencies

```
yarn install
```

## Compiling the contracts

```shell
npx hardhat compile
```

## Running the tests

```
npx hardhat test
```

## Deployment

This repository also implements a deployment script for test purposes. Deployment script implements functions to for ERC20 token deployments, library, factory, router and order book deployments. On each step of the deployment you need to call the necessary function with necessary parameters and constants.

```
npx hardhat run scripts/deploy.ts --network yourNetwork
```

## Matching Engine Test

This repository also implements a matching engine test script. Test script implements a matching engine with same functionality as contracts. It creates random limit/market orders, updates/cancels limit orders and compares if the contract has the same limit orders after the transaction with the js matching engine. It also checks if there are any mismatches between the contract token balances and existing orders (sum of active order sizes = contract balance). To run it, you first need to change the constants in the code.

```
npx hardhat run scripts/test/matchingEngineTest.ts --network yourNetwork
```

## Market Making Script

This repository also implements a simple market maker script. It uses binance APIs to create new market/limit orders on a deployed contract. Once you deploy the contract you need to change the constants in the code to configure it to your deployed contracts.

```
npx hardhat run scripts/market-making/marketMaking.ts --network yourNetwork
```
