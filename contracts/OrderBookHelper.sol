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
    address public owner;

    using SafeERC20 for IERC20Metadata;

    constructor(address _factory, address _router) {
        require(_factory != address(0), "Factory address can not be zero");
        require(_router != address(0), "Router address can not be zero");
        owner = msg.sender;
        factory = IFactory(_factory);
        router = Router(_router);

        (
            ,
            ,
            address[] memory token0s,
            address[] memory token1s,
            ,

        ) = getAllOrderBooks();

        for (uint256 i = 0; i < token0s.length; i++) {
            IERC20Metadata(token0s[i]).approve(_router, type(uint256).max);
            IERC20Metadata(token1s[i]).approve(_router, type(uint256).max);
        }
    }

    function approveRouter(address token) external {
        require(msg.sender == owner, "Only owner can call this function");
        IERC20Metadata(token).approve(address(router), type(uint256).max);
    }

    function getAllOrderBooks()
        public
        view
        override
        returns (
            uint8[] memory orderBookIds,
            address[] memory orderBookAddresses,
            address[] memory token0s,
            address[] memory token1s,
            uint128[] memory sizeTicks,
            uint128[] memory priceTicks
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
        sizeTicks = new uint128[](maxOrderBookId);
        priceTicks = new uint128[](maxOrderBookId);

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
            sizeTicks[i] = sizeTick;
            priceTicks[i] = priceTick;
        }
    }

    struct QuoteExactInputData {
        uint256 remainingAmountIn;
        uint256 runningAmountOut;
        uint128 sizeTick;
    }

    function quoteExactInput(
        uint8 orderBookId,
        bool isAsk,
        uint256 amountIn
    ) external view override returns (uint256, uint256) {
        IOrderBook orderBook = IOrderBook(
            factory.getOrderBookFromId(orderBookId)
        );

        if (isAsk) {
            amountIn = amountIn - (amountIn % orderBook.sizeTick());
        }

        QuoteExactInputData memory data;

        data.remainingAmountIn = amountIn;
        data.runningAmountOut = 0;
        data.sizeTick = orderBook.sizeTick();

        (
            uint32[] memory orderIds,
            ,
            uint256[] memory amount0s,
            uint256[] memory amount1s,
            bool[] memory isAsks
        ) = router.getLimitOrders(orderBookId);

        uint256 partialAmountOut = 0;
        uint256 orderAmountIn = 0;
        uint256 orderAmountOut = 0;
        for (
            uint256 i = 0;
            i < orderIds.length && data.remainingAmountIn > 0;
            i++
        ) {
            if (isAsk != isAsks[i]) {
                orderAmountIn = isAsk ? amount0s[i] : amount1s[i];
                orderAmountOut = isAsk ? amount1s[i] : amount0s[i];

                if (data.remainingAmountIn >= orderAmountIn) {
                    data.runningAmountOut += orderAmountOut;
                    data.remainingAmountIn -= orderAmountIn;
                } else {
                    partialAmountOut =
                        (data.remainingAmountIn * orderAmountOut) /
                        orderAmountIn;
                    if (!isAsk) {
                        partialAmountOut =
                            partialAmountOut -
                            (partialAmountOut % data.sizeTick);
                    }
                    data.runningAmountOut += partialAmountOut;
                    data.remainingAmountIn -=
                        (partialAmountOut * orderAmountIn) /
                        orderAmountOut;
                    break;
                }
            }
        }

        return (amountIn - data.remainingAmountIn, data.runningAmountOut);
    }

    struct SwapExactInputData {
        uint256 token0BalanceBefore;
        uint256 token1BalanceBefore;
        uint256 token0BalanceAfter;
        uint256 token1BalanceAfter;
        uint256 remainingAmountIn;
        uint256 amountOut;
        uint256 amount0Base;
        uint256 priceBase;
        uint128 sizeTick;
        uint128 priceMultiplier;
    }

    function swapExactInput(
        uint8 orderBookId,
        bool isAsk,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256) {
        address orderBookAddress = factory.getOrderBookFromId(orderBookId);
        IOrderBook orderBook = IOrderBook(orderBookAddress);

        SwapExactInputData memory data;
        data.sizeTick = orderBook.sizeTick();
        data.priceMultiplier = orderBook.priceMultiplier();

        if (isAsk) {
            data.token0BalanceBefore = orderBook.token0().balanceOf(
                address(this)
            );
            data.token1BalanceBefore = orderBook.token1().balanceOf(
                address(this)
            );

            amountIn = amountIn - (amountIn % data.sizeTick);
            orderBook.token0().safeTransferFrom(
                msg.sender,
                address(this),
                amountIn
            );

            data.amount0Base = amountIn / data.sizeTick;

            router.createMarketOrder(
                orderBookId,
                uint64(data.amount0Base),
                uint64(1),
                true
            );

            data.token0BalanceAfter = (orderBook.token0()).balanceOf(
                address(this)
            );
            data.token1BalanceAfter = (orderBook.token1()).balanceOf(
                address(this)
            );

            data.amountOut = data.token1BalanceAfter - data.token1BalanceBefore;

            if (data.token0BalanceAfter > data.token0BalanceBefore) {
                orderBook.token0().safeTransfer(
                    msg.sender,
                    data.token0BalanceAfter - data.token0BalanceBefore
                );
            }
            require(data.amountOut >= minAmountOut, "Slippage is too high");

            orderBook.token1().safeTransfer(msg.sender, data.amountOut);
        } else {
            orderBook.token1().safeTransferFrom(
                msg.sender,
                address(this),
                amountIn
            );
            data.remainingAmountIn = amountIn;

            data.token0BalanceBefore = orderBook.token0().balanceOf(
                address(this)
            );
            data.token1BalanceBefore = orderBook.token1().balanceOf(
                address(this)
            );

            LimitOrder memory bestAsk;

            while (data.remainingAmountIn > 0) {
                try router.getBestAsk(orderBookId) returns (
                    LimitOrder memory order
                ) {
                    bestAsk = order;
                } catch {
                    break;
                }

                data.priceBase =
                    bestAsk.amount1 /
                    (bestAsk.amount0 / data.sizeTick) /
                    data.priceMultiplier;

                data.amount0Base =
                    data.remainingAmountIn /
                    data.priceBase /
                    data.priceMultiplier;

                if (data.amount0Base == 0) {
                    break;
                }

                router.createMarketOrder(
                    orderBookId,
                    uint64(data.amount0Base),
                    uint64(data.priceBase),
                    false
                );

                data.token0BalanceAfter = orderBook.token0().balanceOf(
                    address(this)
                );
                uint256 token0Delta = data.token0BalanceAfter -
                    data.token0BalanceBefore;

                data.token1BalanceAfter =
                    data.token1BalanceBefore -
                    (token0Delta / data.sizeTick) *
                    (data.priceBase * data.priceMultiplier);

                data.amountOut += token0Delta;
                data.remainingAmountIn -=
                    data.token1BalanceBefore -
                    data.token1BalanceAfter;

                data.token0BalanceBefore = data.token0BalanceAfter;
                data.token1BalanceBefore = data.token1BalanceAfter;
            }

            require(data.amountOut >= minAmountOut, "Slippage is too high");

            orderBook.token0().safeTransfer(msg.sender, data.amountOut);

            if (data.remainingAmountIn > 0) {
                orderBook.token1().safeTransfer(
                    msg.sender,
                    data.remainingAmountIn
                );
            }
        }

        return data.amountOut;
    }
}
