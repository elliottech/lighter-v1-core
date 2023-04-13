// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

import "./interfaces/IOrderBookHelper.sol";
import "./interfaces/IFactory.sol";

contract OrderBookHelper is IOrderBookHelper {
    IFactory public factory;

    constructor(address _factory, address _router) {
        require(_factory != address(0), "Factory address can not be zero");
        require(_router != address(0), "Router address can not be zero");
        factory = IFactory(_factory);
        router = IRouter(_router);
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
        uint8 i = 0;
        while (true) {
            try factory.getOrderBookDetailsFromId(i) returns (
                uint8 orderBookId,
                address orderBookAddress,
                address token0,
                address token1,
                uint128 sizeTick,
                uint128 priceTick
            ) {
                if (orderBookAddress == address(0)) {
                    break;
                }
                orderBookIds.push(orderBookId);
                orderBookAddresses.push(orderBookAddress);
                token0s.push(token0);
                token1s.push(token1);
                sizeTicks.push(uint8(sizeTick));
                priceTicks.push(uint8(priceTick));
                i++;
            } catch {
                break;
            }
        }
    }

    /// @inheritdoc IOrderBookHelper
    function getSwapDataFromOut(
        uint8 orderBookId,
        uint256 amountOut,
        bool isOutToken0
    )
        external
        view
        override
        returns (
            uint64 amount0Base,
            uint64 priceBase,
            bool isAsk,
            uint256 amount0,
            uint256 amount1
        )
    {
        address orderBookAddress = factory.getOrderBookFromId(orderBookId);
        IOrderBook orderBook = IOrderBook(orderBookAddress);

        uint256 remainingAmountOut = amountOut;
        uint256 runningAmount0 = 0;
        uint256 runningAmount1 = 0;

        (
            uint32[] memory orderIds,
            address[] memory owners,
            uint256[] memory amount0s,
            uint256[] memory amount1s,
            bool[] memory isAsks
        ) = router.getLimitOrders(orderBookId);

        for (
            uint256 i = 0;
            i < orderIds.length && remainingAmountOut > 0;
            i++
        ) {
            // isOutToken0 true means we are buying from asks or selling to bids
            if (isOutToken0 != isAsks[i]) {
                uint256 orderAmountOut = isOutToken0
                    ? amount0s[i]
                    : amount1s[i];
                uint256 orderAmountIn = isOutToken0 ? amount1s[i] : amount0s[i];

                if (remainingAmountOut >= orderAmountOut) {
                    runningAmount0 += amounts0[i];
                    runningAmount1 += amount1s[i];
                    remainingAmountOut -= orderAmountOut;
                } else {
                    uint256 partialAmount0 = isOutToken0
                        ? remainingAmountOut
                        : (remainingAmountOut * orderAmountIn) / orderAmountOut;
                    uint256 partialAmount1 = isOutToken0
                        ? (remainingAmountOut * orderAmountIn) / orderAmountOut
                        : remainingAmountOut;

                    runningAmount0 += partialAmount0;
                    runningAmount1 += partialAmount1;
                    remainingAmountOut = 0;
                }
            }
        }

        // Should we add this check? or return what we have?
        require(remainingAmountOut == 0, "Not enough liquidity");

        amount0Base = uint64(runningAmount0 / orderBook.sizeTick());
        priceBase = uint64(
            runningAmount1 / (amount0Base * orderBook.priceMultiplier())
        );
        isAsk = isOutToken0;
        amount0 = runningAmount0;
        amount1 = runningAmount1;
    }
}
