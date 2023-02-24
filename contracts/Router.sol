// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IOrderBook.sol";
import "./interfaces/IBalanceChangeCallback.sol";
import "./interfaces/IFactory.sol";

import "./library/FullMath.sol";

/// @title Router
/// @notice Router for interacting with order books. The user can specify the
/// token pair or the orderBookId of the order book to interact with, and the
/// router will interact with the contract address for that order book
contract Router is IBalanceChangeCallback {
    using SafeERC20 for IERC20Metadata;
    IFactory public immutable factory;

    constructor(address factoryAddress) {
        factory = IFactory(factoryAddress);
    }

    /// @notice Returns the order book given the orderBookId of that order book.
    /// @param orderBookId The id of the order book to lookup
    /// @return orderBook The order book contract for orderBookId
    function getOrderBookFromId(
        uint8 orderBookId
    ) private view returns (IOrderBook) {
        address orderBookAddress = factory.getOrderBookFromId(orderBookId);
        require(orderBookAddress != address(0), "Invalid orderBookId");
        return IOrderBook(orderBookAddress);
    }

    /// @notice Create multiple limit orders in the order book
    /// @param orderBookId The unique identifier of the order book
    /// @param size The number of limit orders to create. The size of each
    /// argument array must be equal to this size
    /// @param amount0Base The amount of token0 for each limit order in terms
    /// of number of sizeTicks. The actual amount of token0 in order i will
    /// be amount0Base[i] * sizeTick
    /// @param priceBase The price of the token0 for each limit order
    /// in terms of token1 and size and price ticks. The actual amount of token1
    /// in the order will be priceBase * amount0Base * priceTick * sizeTick / dec0
    /// @param isAsk Whether each order is an ask order. isAsk = true means
    /// the order sells token0 for token1
    /// @param hintId Where to insert each order in the order book. Meant to
    /// be calculated off-chain using the getMockIndexToInsert function
    /// @return orderId The ids of each created order
    function createLimitOrderBatch(
        uint8 orderBookId,
        uint8 size,
        uint64[] memory amount0Base,
        uint64[] memory priceBase,
        bool[] memory isAsk,
        uint32[] memory hintId
    ) public returns (uint32[] memory orderId) {
        IOrderBook orderBook = getOrderBookFromId(orderBookId);
        orderId = new uint32[](size);
        for (uint8 i = 0; i < size; i++) {
            orderId[i] = orderBook.createLimitOrder(
                amount0Base[i],
                priceBase[i],
                isAsk[i],
                msg.sender,
                hintId[i]
            );
        }
    }

    /// @notice Create limit order in the order book
    /// @param orderBookId The unique identifier of the order book
    /// @param amount0Base The amount of token0 in terms of number of sizeTicks.
    /// The actual amount of token0 in the order will be newAmount0Base * sizeTick
    /// @param priceBase The price of the token0 in terms of token1 and size
    /// and price ticks. The actual amount of token1 in the order will be
    /// priceBase * amount0Base * priceTick * sizeTick / dec0
    /// @param isAsk isAsk = true means the order sells token0 for token1
    /// @param hintId Where to insert order in the order book. Meant to
    /// be calculated off-chain using the getMockIndexToInsert function
    /// @return orderId The id of the created order
    function createLimitOrder(
        uint8 orderBookId,
        uint64 amount0Base,
        uint64 priceBase,
        bool isAsk,
        uint32 hintId
    ) public returns (uint32 orderId) {
        IOrderBook orderBook = getOrderBookFromId(orderBookId);
        orderId = orderBook.createLimitOrder(
            amount0Base,
            priceBase,
            isAsk,
            msg.sender,
            hintId
        );
    }

    /// @notice Cancels and creates multiple limit orders in the order book
    /// @param orderBookId The unique identifier of the order book
    /// @param size The number of limit orders to cancel and create. The size of each
    /// argument array must be equal to this size
    /// @param orderId The ids of the orders to update
    /// @param newAmount0Base The amount of token0 for each updated limit order
    /// in terms of number of sizeTicks. The actual amount of token0 in the
    /// order will be newAmount0Base * sizeTick
    /// @param newPriceBase The price of the token0 for each limit order
    /// in terms of token1 and size and price ticks. The actual amount of token1
    /// in the order will be priceBase * amount0Base * priceTick * sizeTick / dec0
    /// @param hintId Where to insert each new order in the order book. Meant to
    /// be calculated off-chain using the getMockIndexToInsert function
    /// @return newOrderId The new ids of the each updated order
    function updateLimitOrderBatch(
        uint8 orderBookId,
        uint8 size,
        uint32[] memory orderId,
        uint64[] memory newAmount0Base,
        uint64[] memory newPriceBase,
        uint32[] memory hintId
    ) public returns (uint32[] memory newOrderId) {
        newOrderId = new uint32[](size);
        IOrderBook orderBook = getOrderBookFromId(orderBookId);
        bool isCanceled;
        bool isAsk;
        for (uint256 i = 0; i < size; i++) {
            if (!orderBook.isOrderActive(orderId[i])) {
                newOrderId[i] = 0;
                continue;
            }
            isAsk = orderBook.isAskOrder(orderId[i]);
            isCanceled = orderBook.cancelLimitOrder(orderId[i], msg.sender);

            // Shouldn't happen since function checks if the order is active above
            require(isCanceled, "Could not cancel the order");

            newOrderId[i] = orderBook.createLimitOrder(
                newAmount0Base[i],
                newPriceBase[i],
                isAsk,
                msg.sender,
                hintId[i]
            );
        }
    }

    /// @notice Cancel limit order in the order book and create a new one
    /// @param orderBookId The unique identifier of the order book
    /// @param orderId The id of the order to cancel
    /// @param newAmount0Base The amount of token0 in terms of number of sizeTicks.
    /// The actual amount of token0 in the order will be newAmount0Base * sizeTick
    /// @param newPriceBase The price of the token0 in terms of token1 and size
    /// and price ticks. The actual amount of token1 in the order will be
    /// priceBase * amount0Base * priceTick * sizeTick / dec0
    /// @param hintId Where to insert new order in the order book. Meant to
    /// be calculated off-chain using the getMockIndexToInsert function
    /// @return newOrderId The new id of the updated order
    function updateLimitOrder(
        uint8 orderBookId,
        uint32 orderId,
        uint64 newAmount0Base,
        uint64 newPriceBase,
        uint32 hintId
    ) public returns (uint32 newOrderId) {
        IOrderBook orderBook = getOrderBookFromId(orderBookId);

        if (!orderBook.isOrderActive(orderId)) {
            newOrderId = 0;
        } else {
            bool isAsk = orderBook.isAskOrder(orderId);
            bool isCanceled = orderBook.cancelLimitOrder(orderId, msg.sender);

            // Shouldn't happen since function checks if the order is active above
            require(isCanceled, "Could not cancel the order");
            newOrderId = orderBook.createLimitOrder(
                newAmount0Base,
                newPriceBase,
                isAsk,
                msg.sender,
                hintId
            );
        }
    }

    /// @notice Cancel multiple limit orders in the order book
    /// @dev Including an inactive order in the batch cancelation does not
    /// revert. This is to make it easier for market markers to cancel
    /// @param orderBookId The unique identifier of the order book
    /// @param size The number of limit orders to update. The size of each
    /// argument array must be equal to this size
    /// @param orderId The ids of the orders to cancel
    /// @return isCanceled List of booleans indicating whether each order was successfully
    /// canceled
    function cancelLimitOrderBatch(
        uint8 orderBookId,
        uint8 size,
        uint32[] memory orderId
    ) public returns (bool[] memory isCanceled) {
        IOrderBook orderBook = getOrderBookFromId(orderBookId);
        isCanceled = new bool[](size);
        for (uint256 i = 0; i < size; i++) {
            isCanceled[i] = orderBook.cancelLimitOrder(orderId[i], msg.sender);
        }
    }

    /// @notice Cancel single limit order in the order book
    /// @param orderBookId The unique identifier of the order book
    /// @param orderId The id of the orders to cancel
    /// @return isCanceled A boolean indicating whether the order was successfully canceled
    function cancelLimitOrder(
        uint8 orderBookId,
        uint32 orderId
    ) public returns (bool) {
        IOrderBook orderBook = getOrderBookFromId(orderBookId);
        return orderBook.cancelLimitOrder(orderId, msg.sender);
    }

    /// @notice Create a market order in the order book
    /// @param orderBookId The unique identifier of the order book
    /// @param amount0Base The amount of token0 in the limit order in terms
    /// of number of sizeTicks. The actual amount of token0 in the order will
    /// be amount0Base * sizeTick
    /// @param priceBase The price of the token0 in terms of token1 and size
    /// and price ticks. The actual amount of token1 in the order will be
    /// priceBase * amount0Base * priceTick * sizeTick / dec0
    /// @param isAsk Whether the order is an ask order. isAsk = true means
    /// the order sells token0 for token1
    function createMarketOrder(
        uint8 orderBookId,
        uint64 amount0Base,
        uint64 priceBase,
        bool isAsk
    ) public {
        IOrderBook orderBook = getOrderBookFromId(orderBookId);
        orderBook.createMarketOrder(amount0Base, priceBase, isAsk, msg.sender);
    }

    /// @inheritdoc IBalanceChangeCallback
    function addBalanceCallback(
        IERC20Metadata tokenToTransfer,
        address to,
        uint256 amount,
        uint8 orderBookId
    ) external override returns (bool) {
        require(
            msg.sender == address(getOrderBookFromId(orderBookId)),
            "Caller does not match order book"
        );
        uint256 contractBalanceBefore = tokenToTransfer.balanceOf(address(this));
        bool success = false;
        try tokenToTransfer.transfer(to, amount) returns (bool ret) {
            success = ret;
        } catch {
            success = false;
        }
        uint256 contractBalanceAfter = tokenToTransfer.balanceOf(address(this));

        uint256 sentAmount = 0;
        if (success) {
            sentAmount = amount;
        }
        require(
            contractBalanceAfter + sentAmount >= contractBalanceBefore,
            "Contract balance change does not match the sent amount"
        );
        return success;
    }

    /// @inheritdoc IBalanceChangeCallback
    function addSafeBalanceCallback(
        IERC20Metadata tokenToTransfer,
        address to,
        uint256 amount,
        uint8 orderBookId
    ) external override {
        require(
            msg.sender == address(getOrderBookFromId(orderBookId)),
            "Caller does not match order book"
        );
        uint256 contractBalanceBefore = tokenToTransfer.balanceOf(
            address(this)
        );
        tokenToTransfer.safeTransfer(to, amount);
        uint256 contractBalanceAfter = tokenToTransfer.balanceOf(address(this));
        require(
            contractBalanceAfter + amount >= contractBalanceBefore,
            "Contract balance change does not match the sent amount"
        );
    }

    /// @inheritdoc IBalanceChangeCallback
    function subtractSafeBalanceCallback(
        IERC20Metadata tokenToTransferFrom,
        address from,
        uint256 amount,
        uint8 orderBookId
    ) external override {
        require(
            msg.sender == address(getOrderBookFromId(orderBookId)),
            "Caller does not match order book"
        );
        uint256 balance = tokenToTransferFrom.balanceOf(from);
        require(
            amount <= balance,
            "Insufficient funds associated with sender's address"
        );
        uint256 contractBalanceBefore = tokenToTransferFrom.balanceOf(address(this));
        tokenToTransferFrom.safeTransferFrom(from, address(this), amount);
        uint256 contractBalanceAfter = tokenToTransferFrom.balanceOf(address(this));
        require(
            contractBalanceAfter >= contractBalanceBefore + amount,
            "Contract balance change does not match the received amount"
        );
    }

    /// @notice Get the order details of all limit orders in the order book.
    /// Each returned list contains the details of ask orders first, followed
    /// by bid orders
    /// @param orderBookId The id of the order book to lookup
    /// @return id The ids of the orders
    /// @return owner The addresses of the orders' owners
    /// @return amount0 The amount of token0 remaining in the orders
    /// @return amount1 The amount of token1 remaining in the orders
    /// @return isAsk Whether each order is an ask order
    function getLimitOrders(uint8 orderBookId)
        external
        view
        returns (
            uint32[] memory,
            address[] memory,
            uint256[] memory,
            uint256[] memory,
            bool[] memory
        )
    {
        IOrderBook orderBook = getOrderBookFromId(orderBookId);
        return orderBook.getLimitOrders();
    }

    /// @notice Get the order details of the ask order with the lowest price
    /// in the order book
    /// @param orderBookId The id of the order book to lookup
    /// @return bestAsk LimitOrder data struct of the best ask order
    function getBestAsk(
        uint8 orderBookId
    ) external view returns (LimitOrder memory) {
        IOrderBook orderBook = getOrderBookFromId(orderBookId);
        return orderBook.getBestAsk();
    }

    /// @notice Get the order details of the bid order with the highest price
    /// in the order book
    /// @param orderBookId The id of the order book to lookup
    /// @return bestBid LimitOrder data struct of the best bid order
    function getBestBid(
        uint8 orderBookId
    ) external view returns (LimitOrder memory) {
        IOrderBook orderBook = getOrderBookFromId(orderBookId);
        return orderBook.getBestBid();
    }

    /// @notice Find the order id to the left of where the new order
    /// should be inserted. Meant to be used off-chain to find the
    /// hintId for the createLimitOrder and updateLimitOrder functions
    /// @param orderBookId The id of the order book to lookup
    /// @param amount0 The amount of token0 in the new order
    /// @param amount1 The amount of token1 in the new order
    /// @param isAsk Whether the new order is an ask order
    /// @return hintId The id of the order to the left of where the new order
    /// should be inserted
    function getMockIndexToInsert(
        uint8 orderBookId,
        uint256 amount0,
        uint256 amount1,
        bool isAsk
    ) external view returns (uint32) {
        IOrderBook orderBook = getOrderBookFromId(orderBookId);
        return orderBook.getMockIndexToInsert(amount0, amount1, isAsk);
    }

    /// @dev Get the uint value from msg.data starting from a specific byte
    /// @param startByte The starting byte
    /// @param length The number of bytes to read
    /// @return val Parsed uint256 value from calldata
    function parseCallData(
        uint256 startByte,
        uint256 length
    ) private pure returns (uint256) {
        uint256 val;

        require(length <= 32, "Length limit is 32 bytes");

        require(
            length + startByte <= msg.data.length,
            "trying to read past end of calldata"
        );

        assembly {
            val := calldataload(startByte)
        }

        val = val >> (256 - length * 8);

        return val;
    }

    /// @notice This function is called when no other router function is
    /// called. The data should be passed in msg.data.
    /// The first byte of msg.data should be the function selector
    /// 1 = createLimitOrder
    /// 2 = updateLimitOrder
    /// 3 = cancelLimitOrder
    /// 4 = createMarketOrder
    /// The next byte should be the orderBookId of the order book
    /// The next byte should be the number of orders to batch. This is ignored
    /// for the createMarketOrder function
    /// Then, for data for each order is read in a loop
    fallback() external {
        uint256 _func;

        _func = parseCallData(0, 1);
        uint8 orderBookId = uint8(parseCallData(1, 1));
        uint8 batchSize = uint8(parseCallData(2, 1));
        uint256 currentByte = 3;
        uint64[] memory amount0Base = new uint64[](batchSize);
        uint64[] memory priceBase = new uint64[](batchSize);
        uint32[] memory hintId = new uint32[](batchSize);
        uint32[] memory orderId = new uint32[](batchSize);

        // createLimitOrder
        if (_func == 1) {
            bool[] memory isAsk = new bool[](batchSize);
            uint8 isAskByte;
            for (uint256 i = 0; i < batchSize; i++) {
                amount0Base[i] = uint64(parseCallData(currentByte, 8));
                priceBase[i] = uint64(parseCallData(currentByte + 8, 8));
                isAskByte = uint8(parseCallData(currentByte + 16, 1));
                require(isAskByte <= 1, "Invalid isAsk");
                isAsk[i] = isAskByte == 1;
                hintId[i] = uint32(parseCallData(currentByte + 17, 4));
                currentByte += 21;
            }
            createLimitOrderBatch(
                orderBookId,
                batchSize,
                amount0Base,
                priceBase,
                isAsk,
                hintId
            );
        }

        // updateLimitOrder
        if (_func == 2) {
            for (uint256 i = 0; i < batchSize; i++) {
                orderId[i] = uint32(parseCallData(currentByte, 4));
                amount0Base[i] = uint64(parseCallData(currentByte + 4, 8));
                priceBase[i] = uint64(parseCallData(currentByte + 12, 8));
                hintId[i] = uint32(parseCallData(currentByte + 20, 4));
                currentByte += 24;
            }
            updateLimitOrderBatch(
                orderBookId,
                batchSize,
                orderId,
                amount0Base,
                priceBase,
                hintId
            );
        }

        // cancelLimitOrder
        if (_func == 3) {
            for (uint256 i = 0; i < batchSize; i++) {
                orderId[i] = uint32(parseCallData(currentByte, 4));
                currentByte += 4;
            }
            cancelLimitOrderBatch(orderBookId, batchSize, orderId);
        }

        // createMarketOrder
        if (_func == 4) {
            uint8 isAskByte = uint8(parseCallData(18, 1));
            require(isAskByte <= 1, "Invalid isAsk");
            createMarketOrder(
                orderBookId,
                uint64(parseCallData(2, 8)),
                uint64(parseCallData(10, 8)),
                isAskByte == 1
            );
        }
    }
}
