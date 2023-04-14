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
    ) external view override returns (uint256 amountOut) {
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
                    runningAmountOut += partialAmountOut;
                    remainingAmountIn = 0;
                }
            }
        }

        // Should we add this check? or return what we have?
        require(remainingAmountIn == 0, "Not enough liquidity");

        amountOut = runningAmountOut;
    }

    function quoteExactOutput(
        uint8 orderBookId,
        bool isAsk,
        uint256 amountOut
    ) external view override returns (uint256) {
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
            if (isAsk == isAsks[i]) {
                uint256 orderAmountOut = isAsk ? amount0s[i] : amount1s[i];
                uint256 orderAmountIn = isAsk ? amount1s[i] : amount0s[i];

                if (remainingAmountOut >= orderAmountOut) {
                    runningAmountIn += orderAmountIn;
                    remainingAmountOut -= orderAmountOut;
                } else {
                    uint256 partialAmountIn = (remainingAmountOut *
                        orderAmountIn) / orderAmountOut;

                    runningAmountIn += partialAmountIn;
                    remainingAmountOut = 0;
                }
            }
        }

        // Should we add this check? or return what we have?
        require(remainingAmountOut == 0, "Not enough liquidity");

        return runningAmountIn;
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
        uint256 partialAmount0;
        uint256 partialAmount1;
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
            while (data.remainingAmountIn > 0) {
                LimitOrder memory bestAsk = router.getBestAsk(orderBookId);

                // Check if there's a best ask order
                if (bestAsk.owner == address(0)) {
                    break;
                }

                if (data.remainingAmountIn >= bestAsk.amount1) {
                    data.amount0Base = bestAsk.amount0 / orderBook.sizeTick();
                    data.priceBase =
                        bestAsk.amount1 /
                        (data.amount0Base * orderBook.priceMultiplier());

                    router.createMarketOrder(
                        orderBookId,
                        uint64(data.amount0Base),
                        uint64(data.priceBase),
                        isAsk
                    );

                    // do we need to check the result of createMarketOrder? I believe no since order book state doesn't change in this transaction
                    // and if something goes wrong, it will revert
                    data.remainingAmountIn -= bestAsk.amount1;
                    data.amountOut += bestAsk.amount0;
                } else {
                    // uint256 partialAmount0 = (remainingAmountIn * bestAsk.amount0) / bestAsk.amount1;
                    data.partialAmount0 = FullMath.mulDiv(
                        data.remainingAmountIn,
                        bestAsk.amount0,
                        bestAsk.amount1
                    );
                    data.partialAmount1 = data.remainingAmountIn;

                    // uint256 amount0Base = partialAmount0 / orderBook.sizeTick();
                    data.amount0Base = FullMath.mulDiv(
                        data.partialAmount0,
                        1,
                        orderBook.sizeTick()
                    );
                    // uint256.priceBase = remainingAmountIn / (amount0Base * orderBook.priceMultiplier());
                    data.priceBase = FullMath.mulDiv(
                        data.partialAmount1,
                        1,
                        (data.amount0Base * orderBook.priceMultiplier())
                    );

                    router.createMarketOrder(
                        orderBookId,
                        uint64(data.amount0Base),
                        uint64(data.priceBase),
                        isAsk
                    );

                    data.remainingAmountIn = 0;
                    data.amountOut += data.partialAmount0;
                }
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
        uint256 partialAmount0;
        uint256 partialAmount1;
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

        if (!isAsk) {
            // Buy token0
            amountOut = amountOut - (amountOut % orderBook.sizeTick());

            orderBook.token1().safeTransferFrom(
                msg.sender,
                address(this),
                maxAmountIn
            );

            data.token0BalanceBefore = orderBook.token0().balanceOf(
                address(this)
            );

            data.token1BalanceBefore = orderBook.token1().balanceOf(
                address(this)
            );

            data.amount0Base = amountOut / orderBook.sizeTick();

            router.createMarketOrder(
                orderBookId,
                uint64(data.amount0Base),
                type(uint64).max,
                isAsk
            );

            data.token0BalanceAfter = (orderBook.token0()).balanceOf(
                address(this)
            );
            data.token1BalanceAfter = (orderBook.token1()).balanceOf(
                address(this)
            );

            data.amountIn =
                maxAmountIn -
                (data.token1BalanceAfter - data.token1BalanceBefore);

            require(
                data.amountIn <= maxAmountIn,
                "Slippage is too high or not enough liquidty"
            );

            orderBook.token0().safeTransfer(msg.sender, amountOut);

            if (data.token1BalanceAfter - data.token1BalanceBefore > 0) {
                (orderBook.token1()).safeTransfer(
                    msg.sender,
                    data.token1BalanceAfter - data.token1BalanceBefore
                );
            }
        } else {
            orderBook.token0().safeTransferFrom(
                msg.sender,
                address(this),
                maxAmountIn
            );

            data.remainingAmountOut = amountOut;
            while (data.remainingAmountOut > 0) {
                LimitOrder memory bestBid = router.getBestBid(orderBookId);

                // Check if there's a best ask order
                if (bestBid.owner == address(0)) {
                    break;
                }

                if (data.remainingAmountOut >= bestBid.amount1) {
                    data.amount0Base = bestBid.amount0 / orderBook.sizeTick();
                    data.priceBase =
                        bestBid.amount1 /
                        (data.amount0Base * orderBook.priceMultiplier());

                    router.createMarketOrder(
                        orderBookId,
                        uint64(data.amount0Base),
                        uint64(data.priceBase),
                        isAsk
                    );

                    // do we need to check the result of createMarketOrder? I believe no since order book state doesn't change in this transaction
                    // and if something goes wrong, it will revert
                    data.remainingAmountOut -= bestBid.amount1;
                    data.amountIn += bestBid.amount0;
                } else {
                    // uint256 partialAmount0 = (remainingAmountOut * bestAsk.amount0) / bestAsk.amount1;
                    data.partialAmount0 = FullMath.mulDiv(
                        data.remainingAmountOut,
                        bestBid.amount0,
                        bestBid.amount1
                    );
                    data.partialAmount1 = data.remainingAmountOut;

                    data.amount0Base =
                        data.partialAmount0 /
                        orderBook.sizeTick();

                    data.priceBase =
                        data.partialAmount1 /
                        (data.amount0Base * orderBook.priceMultiplier());

                    router.createMarketOrder(
                        orderBookId,
                        uint64(data.amount0Base),
                        uint64(data.priceBase),
                        isAsk
                    );

                    data.remainingAmountOut = 0;
                    data.amountIn += data.partialAmount0;
                }
            }

            if (data.remainingAmountOut < 0) {
                revert("Not enough liquidity");
            }

            require(
                data.amountIn <= maxAmountIn,
                "Slippage is too high or not enough liquidty"
            );

            (orderBook.token1()).safeTransfer(msg.sender, amountOut);

            if (data.token0BalanceBefore - data.token0BalanceAfter > 0) {
                (orderBook.token1()).safeTransfer(
                    msg.sender,
                    data.token0BalanceBefore - data.token0BalanceAfter
                );
            }
        }

        return data.amountIn;
    }
}
