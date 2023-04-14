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
        uint8 count = 0;
        while (true) {
            try factory.getOrderBookDetailsFromId(count) returns (
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
                count++;
            } catch {
                break;
            }
        }

        orderBookIds = new uint8[](count);
        orderBookAddresses = new address[](count);
        token0s = new address[](count);
        token1s = new address[](count);
        sizeTicks = new uint8[](count);
        priceTicks = new uint8[](count);

        uint8 index = 0;
        while (true) {
            try factory.getOrderBookDetailsFromId(index) returns (
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
                orderBookIds[index] = orderBookId;
                orderBookAddresses[index] = orderBookAddress;
                token0s[index] = token0;
                token1s[index] = token1;
                sizeTicks[index] = uint8(sizeTick);
                priceTicks[index] = uint8(priceTick);
                index++;
            } catch {
                break;
            }
        }
    }

    // /// @inheritdoc IOrderBookHelper
    // function getSwapDataFromOut(
    //     uint8 orderBookId,
    //     uint256 amountOut,
    //     bool isOutToken0
    // )
    //     external
    //     view
    //     override
    //     returns (
    //         uint64 amount0Base,
    //         uint64 priceBase,
    //         bool isAsk,
    //         uint256 amount0,
    //         uint256 amount1
    //     )
    // {
    //     address orderBookAddress = factory.getOrderBookFromId(orderBookId);
    //     IOrderBook orderBook = IOrderBook(orderBookAddress);

    //     uint256 remainingAmountOut = amountOut;
    //     uint256 runningAmount0 = 0;
    //     uint256 runningAmount1 = 0;

    //     (
    //         uint32[] memory orderIds,
    //         address[] memory owners,
    //         uint256[] memory amount0s,
    //         uint256[] memory amount1s,
    //         bool[] memory isAsks
    //     ) = router.getLimitOrders(orderBookId);

    //     for (
    //         uint256 i = 0;
    //         i < orderIds.length && remainingAmountOut > 0;
    //         i++
    //     ) {
    //         // isOutToken0 true means we are buying from asks or selling to bids
    //         if (isOutToken0 != isAsks[i]) {
    //             uint256 orderAmountOut = isOutToken0
    //                 ? amount0s[i]
    //                 : amount1s[i];
    //             uint256 orderAmountIn = isOutToken0 ? amount1s[i] : amount0s[i];

    //             if (remainingAmountOut >= orderAmountOut) {
    //                 runningAmount0 += amounts0[i];
    //                 runningAmount1 += amount1s[i];
    //                 remainingAmountOut -= orderAmountOut;
    //             } else {
    //                 uint256 partialAmount0 = isOutToken0
    //                     ? remainingAmountOut
    //                     : (remainingAmountOut * orderAmountIn) / orderAmountOut;
    //                 uint256 partialAmount1 = isOutToken0
    //                     ? (remainingAmountOut * orderAmountIn) / orderAmountOut
    //                     : remainingAmountOut;

    //                 runningAmount0 += partialAmount0;
    //                 runningAmount1 += partialAmount1;
    //                 remainingAmountOut = 0;
    //             }
    //         }
    //     }

    //     // Should we add this check? or return what we have?
    //     require(remainingAmountOut == 0, "Not enough liquidity");

    //     amount0Base = uint64(runningAmount0 / orderBook.sizeTick());
    //     priceBase = uint64(
    //         runningAmount1 / (amount0Base * orderBook.priceMultiplier())
    //     );
    //     isAsk = isOutToken0;
    //     amount0 = runningAmount0;
    //     amount1 = runningAmount1;
    // }

    function swapExactInput(
        uint8 orderBookId,
        bool isAsk,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut) {
        address orderBookAddress = factory.getOrderBookFromId(orderBookId);
        IOrderBook orderBook = IOrderBook(orderBookAddress);

        if (isAsk) {
            orderBook.token0().safeTransferFrom(
                msg.sender,
                address(this),
                amountIn
            );

            uint256 token0BalanceBefore = orderBook.token0().balanceOf(
                address(this)
            );
            uint256 token1BalanceBefore = orderBook.token1().balanceOf(
                address(this)
            );

            // uint256 amount0Base = amountIn / orderBook.sizeTick();
            uint256 amount0Base = FullMath.mulDiv(
                amountIn,
                1,
                orderBook.sizeTick()
            );
            uint256 priceBase = 1; // allow max slippage by setting the price 1
            router.createMarketOrder(
                orderBookId,
                uint64(amount0Base),
                uint64(priceBase),
                isAsk
            );

            uint256 token0BalanceAfter = (orderBook.token0()).balanceOf(
                address(this)
            );
            uint256 token1BalanceAfter = (orderBook.token1()).balanceOf(
                address(this)
            );

            amountOut = token1BalanceAfter - token1BalanceBefore;

            require(
                amountOut >= minAmountOut,
                "Slippage is too high or not enough liquidty"
            );

            orderBook.token1().safeTransferFrom(
                address(this),
                msg.sender,
                amountOut
            );

            if (token0BalanceAfter > token0BalanceBefore) {
                (orderBook.token0()).safeTransferFrom(
                    address(this),
                    msg.sender,
                    token0BalanceAfter - token0BalanceBefore
                );
            }
        } else {
            orderBook.token1().safeTransferFrom(
                msg.sender,
                address(this),
                amountIn
            );
            uint256 token0BalanceBefore = (orderBook.token0()).balanceOf(
                address(this)
            );
            uint256 token1BalanceBefore = (orderBook.token1()).balanceOf(
                address(this)
            );

            uint256 remainingAmountIn = amountIn;

            // loop through best asks in the order book and create market order
            (
                uint32[] memory orderIds,
                address[] memory owners,
                uint256[] memory amount0s,
                uint256[] memory amount1s,
                bool[] memory isAsks
            ) = router.getLimitOrders(orderBookId);

            for (
                uint256 i = 0;
                i < orderIds.length && remainingAmountIn > 0;
                i++
            ) {
                if (isAsks[i]) {
                    uint256 orderAmount0 = amount0s[i];
                    uint256 orderAmount1 = amount1s[i];

                    if (remainingAmountIn >= orderAmount1) {
                        // amount0Base = orderAmount0 / orderBook.sizeTick();
                        uint256 amount0Base = FullMath.mulDiv(
                            orderAmount0,
                            1,
                            orderBook.sizeTick()
                        );
                        // priceBase = orderAmount1 / (amount0Base * orderBook.priceMultiplier());
                        uint256 priceBase = FullMath.mulDiv(
                            orderAmount1,
                            1,
                            (amount0Base * orderBook.priceMultiplier())
                        );

                        router.createMarketOrder(
                            orderBookId,
                            uint64(amount0Base),
                            uint64(priceBase),
                            isAsk
                        );

                        // do we need to check the result of createMarketOrder? I believe no since order book state doesn't change in this transaction
                        // and if something goes wrong, it will revert
                        remainingAmountIn -= orderAmount1;
                        amountOut += orderAmount0;
                    } else {
                        // uint256 partialAmount0 = (remainingAmountIn * orderAmount0) / orderAmount1;
                        uint256 partialAmount0 = FullMath.mulDiv(
                            remainingAmountIn,
                            orderAmount0,
                            orderAmount1
                        );
                        uint256 partialAmount1 = remainingAmountIn;

                        // uint256 amount0Base = partialAmount0 / orderBook.sizeTick();
                        uint256 amount0Base = FullMath.mulDiv(
                            partialAmount0,
                            1,
                            orderBook.sizeTick()
                        );
                        // uint256.priceBase = remainingAmountIn / (amount0Base * orderBook.priceMultiplier());
                        uint256 priceBase = FullMath.mulDiv(
                            partialAmount1,
                            1,
                            (amount0Base * orderBook.priceMultiplier())
                        );

                        router.createMarketOrder(
                            orderBookId,
                            uint64(amount0Base),
                            uint64(priceBase),
                            isAsk
                        );

                        remainingAmountIn = 0;
                        amountOut += partialAmount0;
                    }
                }
            }

            require(
                amountOut >= minAmountOut,
                "Slippage is too high or not enough liquidty"
            );
            (orderBook.token0()).safeTransferFrom(
                address(this),
                msg.sender,
                amountOut
            );

            if (remainingAmountIn > 0) {
                (orderBook.token1()).safeTransferFrom(
                    address(this),
                    msg.sender,
                    remainingAmountIn
                );
            }
        }

        return amountOut;
    }
}
