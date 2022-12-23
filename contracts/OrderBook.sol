// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./interfaces/IOrderBook.sol";
import "./interfaces/IBalanceChangeCallback.sol";

import "./library/FullMath.sol";

/// @title Order Book
contract OrderBook is IOrderBook {
    using Counters for Counters.Counter;
    using MinLinkedListLib for MinLinkedList;
    using MaxLinkedListLib for MaxLinkedList;
    using SafeMath for uint256;
    /// Linked list of ask orders sorted by orders with the lowest prices
    /// coming first
    MinLinkedList ask;
    /// Linked list of bid orders sorted by orders with the highest prices
    /// coming first
    MaxLinkedList bid;
    /// The order id of the last order created
    Counters.Counter private _orderIdCounter;

    /// @notice The address of the router for this order book
    address public immutable routerAddress;
    IBalanceChangeCallback public immutable balanceChangeCallback;

    uint8 public immutable orderBookId;
    IERC20Metadata public immutable token0;
    IERC20Metadata public immutable token1;
    uint128 public immutable sizeTick;
    uint128 public immutable priceTick;
    uint128 public immutable priceMultiplier;

    /// @notice Emitted whenever a limit order is created
    event LimitOrderCreated(
        uint32 indexed id,
        address indexed owner,
        uint256 amount0,
        uint256 amount1,
        bool isAsk
    );

    /// @notice Emitted whenever a limit order is canceled
    event LimitOrderCanceled(
        uint32 indexed id,
        address indexed owner,
        uint256 amount0,
        uint256 amount1,
        bool isAsk
    );

    /// @notice Emitted whenever a market order is created
    event MarketOrderCreated(
        uint32 indexed id,
        address indexed owner,
        uint256 amount0,
        uint256 amount1,
        bool isAsk
    );

    /// @notice Emitted whenever a swap between two orders occurs. This
    /// happens when orders are being filled
    event Swap(
        uint256 amount0,
        uint256 amount1,
        uint32 indexed askId,
        address askOwner,
        uint32 indexed bidId,
        address bidOwner
    );

    function checkIsRouter() private view {
        require(
            msg.sender == routerAddress,
            "Only the router contract can call this function"
        );
    }

    modifier onlyRouter() {
        checkIsRouter();
        _;
    }

    constructor(
        uint8 _orderBookId,
        address token0Address,
        address token1Address,
        address _routerAddress,
        uint8 logSizeTick,
        uint8 logPriceTick
    ) {
        token0 = IERC20Metadata(token0Address);
        token1 = IERC20Metadata(token1Address);
        orderBookId = _orderBookId;
        routerAddress = _routerAddress;
        balanceChangeCallback = IBalanceChangeCallback(_routerAddress);

        require(10 ** logSizeTick < 1 << 128, "logSizeTick is too big");
        require(10 ** logPriceTick < 1 << 128, "logPriceTick is too big");
        sizeTick = uint128(10 ** logSizeTick);
        priceTick = uint128(10 ** logPriceTick);

        require(
            logSizeTick + logPriceTick >= token0.decimals(),
            "Invalid size and price tick combination"
        );
        uint256 priceMultiplierCheck = FullMath.mulDiv(
            priceTick,
            sizeTick,
            10 ** (token0.decimals())
        );
        require(priceMultiplierCheck < 1 << 128, "priceMultiplier is too big");
        priceMultiplier = uint128(priceMultiplierCheck);

        setupOrderBook();
    }

    function setupOrderBook() internal {
        ask.list[0] = Node({prev: 0, next: 1, active: true});
        ask.list[1] = Node({prev: 0, next: 1, active: true});
        // Order id 0 is a dummy value and has the lowest possible price
        // in the ask linked list
        ask.idToLimitOrder[0] = LimitOrder({
            id: 0,
            owner: address(0),
            amount0: 1,
            amount1: 0
        });
        // Order id 1 is a dummy value and has the highest possible price
        // in the ask linked list
        ask.idToLimitOrder[1] = LimitOrder({
            id: 1,
            owner: address(0),
            amount0: 0,
            amount1: 1
        });

        bid.list[0] = Node({prev: 0, next: 1, active: true});
        bid.list[1] = Node({prev: 0, next: 1, active: true});
        // Order id 0 is a dummy value and has the highest possible price
        // in the bid linked list
        bid.idToLimitOrder[0] = LimitOrder({
            id: 0,
            owner: address(0),
            amount0: 0,
            amount1: 1
        });
        // Order id 1 is a dummy value and has the lowest possible price
        // in the bid linked list
        bid.idToLimitOrder[1] = LimitOrder({
            id: 1,
            owner: address(0),
            amount0: 1,
            amount1: 0
        });

        // Id's 0 and 1 are used for dummy orders, thus first actual order should have id 2
        _orderIdCounter.increment();
        _orderIdCounter.increment();
    }

    /// @notice Transfers tokens to sell (base or quote token) to the router contract depending on the size
    /// Matches the new order with existing orders in the order book if there are price overlaps
    /// Does not insert the remaining order into the order book post matching
    /// If limit order caller should insert the remaining order to order book
    /// If market order caller should refund remaining tokens in the remaining order
    /// @param order The limit order to fill
    /// @param isAsk Whether the order is an ask order
    /// @param from The address of the order sender
    function matchOrder(
        LimitOrder memory order,
        bool isAsk,
        address from
    ) private {
        uint256 filledAmount0 = 0;
        uint256 filledAmount1 = 0;

        uint32 index;

        if (isAsk) {
            balanceChangeCallback.subtractBalanceCallback(
                token0,
                from,
                order.amount0,
                orderBookId
            );

            bool atLeastOneFullSwap = false;

            index = bid.getFirstNode();
            while (index != 1 && order.amount0 > 0) {
                LimitOrder storage bestBid = bid.idToLimitOrder[index];
                (
                    uint256 swapAmount0,
                    uint256 swapAmount1
                ) = getLimitOrderSwapAmounts(order, bestBid, isAsk);
                // Since the linked list is sorted, if there is no price
                // overlap on the current order, there will be no price
                // overlap on the later orders
                if (swapAmount0 == 0 || swapAmount1 == 0) break;

                emit Swap(
                    swapAmount0,
                    swapAmount1,
                    order.id,
                    from,
                    bestBid.id,
                    bestBid.owner
                );

                balanceChangeCallback.addBalanceCallback(
                    token0,
                    bestBid.owner,
                    swapAmount0,
                    orderBookId
                );
                filledAmount0 = filledAmount0.add(swapAmount0);
                filledAmount1 = filledAmount1.add(swapAmount1);

                order.amount1 = order.amount1.sub(
                    FullMath.mulDiv(order.amount1, swapAmount0, order.amount0)
                );
                order.amount0 = order.amount0.sub(swapAmount0);

                if (bestBid.amount0 == swapAmount0) {
                    // Remove the best bid from the order book if it is fully
                    // filled
                    atLeastOneFullSwap = true;
                    bid.list[index].active = false;
                    delete bid.idToLimitOrder[bestBid.id];
                } else {
                    // Update the best bid if it is partially filled
                    bestBid.amount0 = bestBid.amount0.sub(swapAmount0);
                    bestBid.amount1 = bestBid.amount1.sub(swapAmount1);
                    break;
                }

                index = bid.list[index].next;
            }
            if (atLeastOneFullSwap) {
                bid.list[index].prev = 0;
                bid.list[0].next = index;
            }

            if (filledAmount1 > 0) {
                balanceChangeCallback.addBalanceCallback(
                    token1,
                    from,
                    filledAmount1,
                    orderBookId
                );
            }
        } else {
            uint256 firstAmount1 = order.amount1;
            balanceChangeCallback.subtractBalanceCallback(
                token1,
                from,
                order.amount1,
                orderBookId
            );

            bool atLeastOneFullSwap = false;

            index = ask.getFirstNode();
            while (index != 1 && order.amount1 > 0) {
                LimitOrder storage bestAsk = ask.idToLimitOrder[index];
                (
                    uint256 swapAmount0,
                    uint256 swapAmount1
                ) = getLimitOrderSwapAmounts(order, bestAsk, isAsk);
                // Since the linked list is sorted, if there is no price
                // overlap on the current order, there will be no price
                // overlap on the later orders
                if (swapAmount0 == 0 || swapAmount1 == 0) break;

                emit Swap(
                    swapAmount0,
                    swapAmount1,
                    bestAsk.id,
                    bestAsk.owner,
                    order.id,
                    from
                );

                balanceChangeCallback.addBalanceCallback(
                    token1,
                    bestAsk.owner,
                    swapAmount1,
                    orderBookId
                );
                filledAmount0 = filledAmount0.add(swapAmount0);
                filledAmount1 = filledAmount1.add(swapAmount1);

                order.amount1 = order.amount1.sub(
                    FullMath.mulDiv(order.amount1, swapAmount0, order.amount0)
                );
                order.amount0 = order.amount0.sub(swapAmount0);

                if (bestAsk.amount0 == swapAmount0) {
                    // Remove the best ask from the order book if it is fully
                    // filled
                    atLeastOneFullSwap = true;
                    ask.list[index].active = false;
                    delete ask.idToLimitOrder[bestAsk.id];
                } else {
                    // Update the best ask if it is partially filled
                    bestAsk.amount0 = bestAsk.amount0.sub(swapAmount0);
                    bestAsk.amount1 = bestAsk.amount1.sub(swapAmount1);
                    break;
                }

                index = ask.list[index].next;
            }
            if (atLeastOneFullSwap) {
                ask.list[index].prev = 0;
                ask.list[0].next = index;
            }

            // The buy/sell sizes are determined by baseToken amount, and for bid orders users deposit quoteToken
            // After running the initial matching, filledAmount0 will be the amount of bought baseToken
            // and filledAmount1 will be the amount of sold quoteToken
            // Initially user pays filledAmount0 * price amount of quoteToken
            // Since the matching happens on maker price, we need to refund the quoteToken amount that is not used in matching
            uint256 refundAmount1 = firstAmount1.sub(order.amount1).sub(
                filledAmount1
            );

            if (refundAmount1 > 0) {
                balanceChangeCallback.addBalanceCallback(
                    token1,
                    from,
                    refundAmount1,
                    orderBookId
                );
            }

            if (filledAmount0 > 0) {
                balanceChangeCallback.addBalanceCallback(
                    token0,
                    from,
                    filledAmount0,
                    orderBookId
                );
            }
        }
    }

    /// @inheritdoc IOrderBook
    function createLimitOrder(
        uint64 amount0Base,
        uint64 priceBase,
        bool isAsk,
        address from,
        uint32 hintId
    ) external override onlyRouter returns (uint32 newOrderId) {
        require(hintId < _orderIdCounter.current(), "Invalid hint id");
        require(amount0Base > 0, "Invalid size");
        require(priceBase > 0, "Invalid price");
        uint256 amount0 = uint256(amount0Base).mul(sizeTick);
        uint256 amount1 = uint256(priceBase).mul(amount0Base).mul(
            priceMultiplier
        );
        require(
            _orderIdCounter.current() < 1 << 32,
            "New order id exceeds limit"
        );
        newOrderId = uint32(_orderIdCounter.current());
        _orderIdCounter.increment();

        LimitOrder memory newOrder = LimitOrder(
            newOrderId,
            from,
            amount0,
            amount1
        );

        emit LimitOrderCreated(
            newOrderId,
            from,
            newOrder.amount0,
            newOrder.amount1,
            isAsk
        );

        matchOrder(newOrder, isAsk, from);

        // If the order is not fully filled, insert it into the order book
        if (isAsk) {
            if (newOrder.amount0 > 0) {
                ask.idToLimitOrder[newOrderId] = newOrder;
                ask.insert(newOrderId, hintId);
            }
        } else {
            if (newOrder.amount0 > 0) {
                bid.idToLimitOrder[newOrderId] = newOrder;
                bid.insert(newOrderId, hintId);
            }
        }
    }

    /// @inheritdoc IOrderBook
    function cancelLimitOrder(
        uint32 id,
        address from
    ) external override onlyRouter returns (bool) {
        if (!isOrderActive(id)) {
            return false;
        }

        LimitOrder memory order;
        bool isAsk = isAskOrder(id);
        if (isAsk) {
            order = ask.idToLimitOrder[id];
            require(
                order.owner == from,
                "The caller should be the owner of the order"
            );
            balanceChangeCallback.addBalanceCallback(
                token0,
                from,
                ask.idToLimitOrder[id].amount0,
                orderBookId
            );
            ask.erase(id);
            delete ask.idToLimitOrder[id];
        } else {
            order = bid.idToLimitOrder[id];
            require(
                order.owner == from,
                "The caller should be the owner of the order"
            );
            balanceChangeCallback.addBalanceCallback(
                token1,
                from,
                bid.idToLimitOrder[id].amount1,
                orderBookId
            );
            bid.erase(id);
            delete bid.idToLimitOrder[id];
        }

        emit LimitOrderCanceled(id, from, order.amount0, order.amount1, isAsk);
        return true;
    }

    /// @inheritdoc IOrderBook
    function createMarketOrder(
        uint64 amount0Base,
        uint64 priceBase,
        bool isAsk,
        address from
    ) external override onlyRouter {
        require(amount0Base > 0, "Invalid size");
        require(priceBase > 0, "Invalid price");
        uint256 amount0 = uint256(amount0Base).mul(sizeTick);
        uint256 amount1 = uint256(priceBase).mul(amount0Base).mul(
            priceMultiplier
        );

        require(
            _orderIdCounter.current() < 1 << 32,
            "New order id exceeds limit"
        );
        uint32 newOrderId = uint32(_orderIdCounter.current());
        _orderIdCounter.increment();

        LimitOrder memory newOrder = LimitOrder(
            newOrderId,
            from,
            amount0,
            amount1
        );

        emit MarketOrderCreated(
            newOrderId,
            from,
            newOrder.amount0,
            newOrder.amount1,
            isAsk
        );

        matchOrder(newOrder, isAsk, from);

        // If the order is not fully filled, refund the remaining deposited amount
        if (isAsk) {
            balanceChangeCallback.addBalanceCallback(
                token0,
                from,
                newOrder.amount0,
                orderBookId
            );
        } else {
            balanceChangeCallback.addBalanceCallback(
                token1,
                from,
                newOrder.amount1,
                orderBookId
            );
        }
    }

    /// @notice Return the minimum between two uints
    /// @return min The minimum of the two uints
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a <= b ? a : b;
    }

    /// @notice Get the amount of token0 and token1 to traded between
    /// two orders
    /// @param takerOrder The order taking liquidity from the order book
    /// @param makerOrder The order which already exists in the order book
    /// providing liquidity
    /// @param isTakerAsk Whether the takerOrder is an ask order. If the takerOrder
    /// is an ask order, then the makerOrder must be a bid order and vice versa
    /// @return amount0 The amount of token0 to be traded
    /// @return amount1 The amount of token1 to be traded
    function getLimitOrderSwapAmounts(
        LimitOrder memory takerOrder,
        LimitOrder memory makerOrder,
        bool isTakerAsk
    ) internal pure returns (uint256, uint256) {
        // Default is 0 if there is no price overlap
        uint256 amount0Return = 0;
        uint256 amount1Return = 0;

        // If the takerOrder is an ask, and the makerOrder price is at least
        // the takerOrder's price, then the takerOrder can be filled
        // If the takerOrder is a bid, and the makerOrder price is at most
        // the takerOrder's price, then the takerOrder can be filled
        if (
            (isTakerAsk &&
                !FullMath.mulCompare(
                    takerOrder.amount0,
                    makerOrder.amount1,
                    makerOrder.amount0,
                    takerOrder.amount1
                )) ||
            (!isTakerAsk &&
                !FullMath.mulCompare(
                    makerOrder.amount0,
                    takerOrder.amount1,
                    takerOrder.amount0,
                    makerOrder.amount1
                ))
        ) {
            amount0Return = min(takerOrder.amount0, makerOrder.amount0);
            // The price traded at is the makerOrder's price
            amount1Return = FullMath.mulDiv(
                amount0Return,
                makerOrder.amount1,
                makerOrder.amount0
            );
        }

        return (amount0Return, amount1Return);
    }

    /// @inheritdoc IOrderBook
    function getLimitOrders()
        external
        view
        override
        onlyRouter
        returns (
            uint32[] memory,
            address[] memory,
            uint256[] memory,
            uint256[] memory,
            bool[] memory
        )
    {
        LimitOrder[] memory asks = ask.getOrders();
        LimitOrder[] memory bids = bid.getOrders();

        uint32[] memory ids = new uint32[](asks.length + bids.length);
        address[] memory owners = new address[](asks.length + bids.length);
        uint256[] memory amount0s = new uint256[](asks.length + bids.length);
        uint256[] memory amount1s = new uint256[](asks.length + bids.length);
        bool[] memory isAsks = new bool[](asks.length + bids.length);

        for (uint32 i; i < asks.length; i++) {
            ids[i] = asks[i].id;
            owners[i] = asks[i].owner;
            amount0s[i] = asks[i].amount0;
            amount1s[i] = asks[i].amount1;
            isAsks[i] = true;
        }

        for (uint32 i; i < bids.length; i++) {
            ids[asks.length + i] = bids[i].id;
            owners[asks.length + i] = bids[i].owner;
            amount0s[asks.length + i] = bids[i].amount0;
            amount1s[asks.length + i] = bids[i].amount1;
            isAsks[asks.length + i] = false;
        }

        return (ids, owners, amount0s, amount1s, isAsks);
    }

    /// @inheritdoc IOrderBook
    function getBestAsk()
        external
        view
        override
        onlyRouter
        returns (LimitOrder memory)
    {
        return ask.getTopLimitOrder();
    }

    /// @inheritdoc IOrderBook
    function getBestBid()
        external
        view
        override
        onlyRouter
        returns (LimitOrder memory)
    {
        return bid.getTopLimitOrder();
    }

    /// @inheritdoc IOrderBook
    function isOrderActive(
        uint32 id
    ) public view override onlyRouter returns (bool) {
        return ask.list[id].active || bid.list[id].active;
    }

    /// @inheritdoc IOrderBook
    function isAskOrder(uint32 id) public view returns (bool) {
        require(
            ask.idToLimitOrder[id].owner != address(0) ||
                bid.idToLimitOrder[id].owner != address(0),
            "Given order does not exist"
        );
        return ask.idToLimitOrder[id].owner != address(0);
    }

    /// @inheritdoc IOrderBook
    function getMockIndexToInsert(
        uint256 amount0,
        uint256 amount1,
        bool isAsk
    ) external view override returns (uint32) {
        require(amount0 > 0, "Amount0 must be greater than 0");
        if (isAsk) {
            return ask.getMockIndexToInsert(amount0, amount1);
        } else {
            return bid.getMockIndexToInsert(amount0, amount1);
        }
    }
}
