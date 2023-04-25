// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IOrderBook.sol";
import "./interfaces/IOrderBookHelper.sol";
import "./interfaces/IFactory.sol";

import "./Router.sol";

import "./library/FullMath.sol";

contract OrderBookHelper is IOrderBookHelper {
    IFactory public factory;
    Router public router;

    using SafeERC20 for IERC20Metadata;

    constructor(address _factory, address _router) {
        require(_factory != address(0), "Factory address can not be zero");
        require(_router != address(0), "Router address can not be zero");
        factory = IFactory(_factory);
        router = Router(_router);
    }

    function getAllOrderBooks()
        external
        view
        override
        returns (
            uint8[] memory orderBookIds,
            address[] memory orderBookAddresses,
            address[] memory token0s,
            address[] memory token1s,
            uint8[] memory sizeTicks,
            uint8[] memory priceTicks
        )
    {
        uint8 maxOrderBookId = 0;
        while (true) {
            (, address orderBookAddress, , , , ) = factory
                .getOrderBookDetailsFromId(maxOrderBookId);

            if (orderBookAddress == address(0)) {
                break;
            }

            maxOrderBookId++;
        }
        orderBookIds = new uint8[](maxOrderBookId);
        orderBookAddresses = new address[](maxOrderBookId);
        token0s = new address[](maxOrderBookId);
        token1s = new address[](maxOrderBookId);
        sizeTicks = new uint8[](maxOrderBookId);
        priceTicks = new uint8[](maxOrderBookId);

        for (uint8 i = 0; i < maxOrderBookId; i++) {
            (
                uint8 orderBookId,
                address orderBookAddress,
                address token0,
                address token1,
                uint128 sizeTick,
                uint128 priceTick
            ) = factory.getOrderBookDetailsFromId(i);

            if (orderBookAddress == address(0)) {
                break;
            }
            orderBookIds[i] = orderBookId;
            orderBookAddresses[i] = orderBookAddress;
            token0s[i] = token0;
            token1s[i] = token1;
            sizeTicks[i] = uint8(sizeTick);
            priceTicks[i] = uint8(priceTick);
        }
    }

    function quoteExactInput(
        uint8 orderBookId,
        bool isAsk,
        uint256 amountIn
    ) external view override returns (uint256 resAmountIn, uint256 amountOut) {
        address orderBookAddress = factory.getOrderBookFromId(orderBookId);
        IOrderBook orderBook = IOrderBook(orderBookAddress);

        if (isAsk) {
            amountIn = amountIn - (amountIn % orderBook.sizeTick());
        }

        uint256 remainingAmountIn = amountIn;
        uint256 runningAmountOut = 0;

        (
            uint32[] memory orderIds,
            ,
            uint256[] memory amount0s,
            uint256[] memory amount1s,
            bool[] memory isAsks
        ) = router.getLimitOrders(orderBookId);

        for (uint256 i = 0; i < orderIds.length && remainingAmountIn > 0; i++) {
            if (isAsk != isAsks[i]) {
                uint256 orderAmountIn = isAsk ? amount0s[i] : amount1s[i];
                uint256 orderAmountOut = isAsk ? amount1s[i] : amount0s[i];

                if (remainingAmountIn >= orderAmountIn) {
                    runningAmountOut += orderAmountOut;
                    remainingAmountIn -= orderAmountIn;
                } else {
                    uint256 partialAmountOut = (remainingAmountIn *
                        orderAmountOut) / orderAmountIn;

                    if (!isAsk) {
                        partialAmountOut =
                            partialAmountOut -
                            (partialAmountOut % orderBook.sizeTick());
                    }

                    if (partialAmountOut == 0) {
                        break;
                    }
                    runningAmountOut += partialAmountOut;
                    remainingAmountIn -=
                        (partialAmountOut * orderAmountIn) /
                        orderAmountOut;
                }
            }
        }

        amountOut = runningAmountOut;
        resAmountIn = amountIn - remainingAmountIn;
    }

    function quoteExactOutput(
        uint8 orderBookId,
        bool isAsk,
        uint256 amountOut
    ) external view override returns (uint256, uint256) {
        address orderBookAddress = factory.getOrderBookFromId(orderBookId);
        IOrderBook orderBook = IOrderBook(orderBookAddress);

        if (!isAsk) {
            amountOut = amountOut - (amountOut % orderBook.sizeTick());
        }

        uint256 remainingAmountOut = amountOut;
        uint256 runningAmountIn = 0;

        (
            uint32[] memory orderIds,
            ,
            uint256[] memory amount0s,
            uint256[] memory amount1s,
            bool[] memory isAsks
        ) = router.getLimitOrders(orderBookId);

        for (
            uint256 i = 0;
            i < orderIds.length && remainingAmountOut > 0;
            i++
        ) {
            // isAsk true means we are buying from asks or selling to bids
            if (isAsk != isAsks[i]) {
                uint256 orderAmountIn = isAsk ? amount0s[i] : amount1s[i];
                uint256 orderAmountOut = isAsk ? amount1s[i] : amount0s[i];

                if (remainingAmountOut >= orderAmountOut) {
                    runningAmountIn += orderAmountIn;
                    remainingAmountOut -= orderAmountOut;
                } else {
                    uint256 partialAmountIn = (remainingAmountOut *
                        orderAmountIn) / orderAmountOut;

                    if (isAsk) {
                        partialAmountIn =
                            partialAmountIn -
                            (partialAmountIn % orderBook.sizeTick());
                    }

                    if (partialAmountIn == 0) {
                        break;
                    }

                    runningAmountIn += partialAmountIn;
                    remainingAmountOut -=
                        (partialAmountIn * orderAmountOut) /
                        orderAmountIn;
                }
            }
        }

        return (runningAmountIn, amountOut - remainingAmountOut);
    }

    struct SwapExectInputData {
        uint256 token0BalanceBefore;
        uint256 token1BalanceBefore;
        uint256 token0BalanceAfter;
        uint256 token1BalanceAfter;
        uint256 remainingAmountIn;
        uint256 amountOut;
        uint256 amount0Base;
        uint256 priceBase;
    }

    function swapExactInput(
        uint8 orderBookId,
        bool isAsk,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256) {
        address orderBookAddress = factory.getOrderBookFromId(orderBookId);
        IOrderBook orderBook = IOrderBook(orderBookAddress);
        orderBook.token0().approve(address(router), type(uint256).max);
        orderBook.token1().approve(address(router), type(uint256).max);

        SwapExectInputData memory data;

        if (isAsk) {
            amountIn = amountIn - (amountIn % orderBook.sizeTick());

            orderBook.token0().safeTransferFrom(
                msg.sender,
                address(this),
                amountIn
            );

            data.token0BalanceBefore = orderBook.token0().balanceOf(
                address(this)
            );

            data.token1BalanceBefore = orderBook.token1().balanceOf(
                address(this)
            );

            data.amount0Base = amountIn / orderBook.sizeTick();

            router.createMarketOrder(
                orderBookId,
                uint64(data.amount0Base),
                uint64(1),
                isAsk
            );

            data.token0BalanceAfter = (orderBook.token0()).balanceOf(
                address(this)
            );
            data.token1BalanceAfter = (orderBook.token1()).balanceOf(
                address(this)
            );

            data.amountOut = data.token1BalanceAfter - data.token1BalanceBefore;

            require(
                data.amountOut >= minAmountOut,
                "Slippage is too high or not enough liquidty"
            );

            orderBook.token1().safeTransfer(msg.sender, data.amountOut);

            if (data.token0BalanceAfter > data.token0BalanceBefore) {
                (orderBook.token0()).safeTransfer(
                    msg.sender,
                    data.token0BalanceAfter - data.token0BalanceBefore
                );
            }
        } else {
            orderBook.token1().safeTransferFrom(
                msg.sender,
                address(this),
                amountIn
            );

            data.remainingAmountIn = amountIn;
            LimitOrder memory bestAsk;
            data.token0BalanceBefore = orderBook.token0().balanceOf(
                address(this)
            );

            data.token1BalanceBefore = orderBook.token1().balanceOf(
                address(this)
            );
            while (data.remainingAmountIn > 0) {
                // out -> token 0
                // in -> token 1
                try router.getBestAsk(orderBookId) returns (
                    LimitOrder memory order
                ) {
                    bestAsk = order;
                } catch {
                    break;
                }

                data.priceBase =
                    (bestAsk.amount1 * orderBook.sizeTick()) /
                    bestAsk.amount0 /
                    orderBook.priceMultiplier();

                data.amount0Base =
                    data.remainingAmountIn /
                    data.priceBase /
                    orderBook.priceMultiplier();

                if (data.amount0Base == 0) {
                    break;
                }

                require(
                    data.priceBase *
                        data.amount0Base *
                        orderBook.priceMultiplier() <=
                        data.token1BalanceBefore,
                    "Slippage is too high"
                );

                router.createMarketOrder(
                    orderBookId,
                    uint64(data.amount0Base),
                    uint64(data.priceBase),
                    isAsk
                );

                data.token0BalanceAfter = (orderBook.token0()).balanceOf(
                    address(this)
                );
                data.token1BalanceAfter = (orderBook.token1()).balanceOf(
                    address(this)
                );

                data.remainingAmountIn -=
                    data.token1BalanceBefore -
                    data.token1BalanceAfter;
                data.amountOut +=
                    data.token0BalanceAfter -
                    data.token0BalanceBefore;

                data.token0BalanceBefore = data.token0BalanceAfter;
                data.token1BalanceBefore = data.token1BalanceAfter;
            }

            require(
                data.amountOut >= minAmountOut,
                "Slippage is too high or not enough liquidty"
            );
            (orderBook.token0()).safeTransfer(msg.sender, data.amountOut);

            if (data.remainingAmountIn > 0) {
                (orderBook.token1()).safeTransfer(
                    msg.sender,
                    data.remainingAmountIn
                );
            }
        }

        return data.amountOut;
    }

    struct SwapExectOutputData {
        uint256 token0BalanceBefore;
        uint256 token1BalanceBefore;
        uint256 token0BalanceAfter;
        uint256 token1BalanceAfter;
        uint256 remainingAmountOut;
        uint256 amountIn;
        uint256 amount0Base;
        uint256 priceBase;
    }

    function swapExactOutput(
        uint8 orderBookId,
        bool isAsk,
        uint256 amountOut,
        uint256 maxAmountIn
    ) external returns (uint256) {
        address orderBookAddress = factory.getOrderBookFromId(orderBookId);
        IOrderBook orderBook = IOrderBook(orderBookAddress);
        orderBook.token0().approve(address(router), type(uint256).max);
        orderBook.token1().approve(address(router), type(uint256).max);

        SwapExectOutputData memory data;

        if (isAsk) {
            orderBook.token0().safeTransferFrom(
                msg.sender,
                address(this),
                maxAmountIn
            );

            // out -> token 1
            // in -> token 0
            data.remainingAmountOut = amountOut;
            LimitOrder memory bestBid;
            bool tickDone = false;
            data.token0BalanceBefore = orderBook.token0().balanceOf(
                address(this)
            );
            data.token1BalanceBefore = orderBook.token1().balanceOf(
                address(this)
            );
            while (data.remainingAmountOut > 0) {
                try router.getBestBid(orderBookId) returns (
                    LimitOrder memory order
                ) {
                    bestBid = order;
                } catch {
                    break;
                }

                data.priceBase =
                    (bestBid.amount1 * orderBook.sizeTick()) /
                    bestBid.amount0 /
                    orderBook.priceMultiplier();

                data.amount0Base =
                    data.remainingAmountOut /
                    data.priceBase /
                    orderBook.priceMultiplier();

                if (data.amount0Base == 0) {
                    tickDone = true;
                    break;
                }

                // this means you don't have enough token 0 to buy the amount of token 1 you want
                require(
                    data.amount0Base * orderBook.sizeTick() <=
                        data.token0BalanceBefore,
                    "Slippage is too high"
                );

                router.createMarketOrder(
                    orderBookId,
                    uint64(data.amount0Base),
                    uint64(data.priceBase),
                    isAsk
                );

                data.token0BalanceAfter = orderBook.token0().balanceOf(
                    address(this)
                );
                data.token1BalanceAfter = orderBook.token1().balanceOf(
                    address(this)
                );

                data.amountIn +=
                    data.token0BalanceBefore -
                    data.token0BalanceAfter;

                data.remainingAmountOut -=
                    data.token1BalanceAfter -
                    data.token1BalanceBefore;

                data.token0BalanceBefore = data.token0BalanceAfter;
                data.token1BalanceBefore = data.token1BalanceAfter;
            }

            require(
                data.remainingAmountOut == 0 || tickDone,
                "Not enough liquidity"
            );

            require(
                data.amountIn <= maxAmountIn,
                "Slippage is too high or not enough liquidty"
            );

            (orderBook.token1()).safeTransfer(
                msg.sender,
                amountOut - data.remainingAmountOut
            );

            if (maxAmountIn - data.amountIn > 0) {
                (orderBook.token0()).safeTransfer(
                    msg.sender,
                    maxAmountIn - data.amountIn
                );
            }
        } else {
            // out -> token 0
            // in -> token 1
            amountOut = amountOut - (amountOut % orderBook.sizeTick());
            data.remainingAmountOut = amountOut;

            orderBook.token1().safeTransferFrom(
                msg.sender,
                address(this),
                maxAmountIn
            );

            LimitOrder memory bestAsk;
            // in -> token 1
            // out -> token 0
            data.token0BalanceBefore = orderBook.token0().balanceOf(
                address(this)
            );
            data.token1BalanceBefore = orderBook.token1().balanceOf(
                address(this)
            );
            while (data.remainingAmountOut > 0) {
                try router.getBestAsk(orderBookId) returns (
                    LimitOrder memory order
                ) {
                    bestAsk = order;
                } catch {
                    break;
                }

                data.priceBase =
                    (bestAsk.amount1 * orderBook.sizeTick()) /
                    bestAsk.amount0 /
                    orderBook.priceMultiplier();

                data.amount0Base =
                    data.remainingAmountOut /
                    orderBook.sizeTick();

                require(
                    data.priceBase *
                        data.amount0Base *
                        orderBook.priceMultiplier() <=
                        data.token1BalanceBefore,
                    "Slippage is too high"
                );

                router.createMarketOrder(
                    orderBookId,
                    uint64(data.amount0Base),
                    uint64(data.priceBase),
                    isAsk
                );

                data.token0BalanceAfter = orderBook.token0().balanceOf(
                    address(this)
                );
                data.token1BalanceAfter = orderBook.token1().balanceOf(
                    address(this)
                );

                data.remainingAmountOut -=
                    data.token0BalanceAfter -
                    data.token0BalanceBefore;
                data.amountIn +=
                    data.token1BalanceBefore -
                    data.token1BalanceAfter;

                data.token0BalanceBefore = data.token0BalanceAfter;
                data.token1BalanceBefore = data.token1BalanceAfter;
            }

            require(data.remainingAmountOut == 0, "Not enough liquidity");

            require(
                data.amountIn <= maxAmountIn,
                "Slippage is too high or not enough liquidty"
            );

            orderBook.token0().safeTransfer(msg.sender, amountOut);

            if (maxAmountIn - data.amountIn > 0) {
                (orderBook.token1()).safeTransfer(
                    msg.sender,
                    maxAmountIn - data.amountIn
                );
            }
        }

        return data.amountIn;
    }
}
