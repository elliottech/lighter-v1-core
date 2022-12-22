// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "./FullMath.sol";

/// @notice Struct containing limit order data
struct LimitOrder {
    uint32 id;
    address owner;
    uint256 amount0;
    uint256 amount1;
}

/// @notice Struct for linked list node
/// @dev Each order id is mapped to a Node in the linked list
struct Node {
    uint32 prev;
    uint32 next;
    bool active;
}

/// @notice Struct for linked list sorted by price in non-decreasing order.
/// Used to store ask limit orders in the order book.
/// @dev Each order id is mapped to a Node and a LimitOrder
struct MinLinkedList {
    mapping(uint32 => Node) list;
    mapping(uint32 => LimitOrder) idToLimitOrder;
}

/// @notice Struct for linked list sorted in non-increasing order
/// Used to store bid limit orders in the order book.
/// @dev Each order id is mapped to a Node and a Limit Order
struct MaxLinkedList {
    mapping(uint32 => Node) list;
    mapping(uint32 => LimitOrder) idToLimitOrder;
}

/// @title MinLinkedListLib
/// @notice Library for linked list sorted in non-decreasing order
/// @dev Order ids 0 and 1 are special values. The first node of the
/// linked list has order id 0 and the last node has order id 1.
/// Order 0 should be initalized (in OrderBook.sol) with the lowest
/// possible price, and order 1 should be initialized with the highest
library MinLinkedListLib {
    /// @notice Comparison function for linked list. Returns true
    /// if the price of order id0 is strictly less than the price of order id1
    function compare(
        MinLinkedList storage listData,
        uint32 id0,
        uint32 id1
    ) internal view returns (bool) {
        return
            FullMath.mulCompare(
                listData.idToLimitOrder[id0].amount1,
                listData.idToLimitOrder[id1].amount0,
                listData.idToLimitOrder[id1].amount1,
                listData.idToLimitOrder[id0].amount0
            );
    }

    /// @notice Find the order id to the left of where the new order
    /// should be inserted
    /// @param orderId The order id to insert
    /// @param hintId The order id to start searching from
    function findIndexToInsert(
        MinLinkedList storage listData,
        uint32 orderId,
        uint32 hintId
    ) internal view returns (uint32) {
        // No element in the linked list can have next = 0, it means hintId is not in the linked list
        require(listData.list[hintId].next != 0, "Invalid hint id");

        while (!listData.list[hintId].active) {
            hintId = listData.list[hintId].next;
        }

        // After the two while loops, hintId will be the order id to the
        // left of where the new order should be inserted.
        while (hintId != 1) {
            uint32 nextId = listData.list[hintId].next;
            if (compare(listData, orderId, nextId)) break;
            hintId = nextId;
        }

        while (hintId != 0) {
            uint32 prevId = listData.list[hintId].prev;
            if (!compare(listData, orderId, hintId)) break;
            hintId = prevId;
        }

        return hintId;
    }

    /// @notice Inserts an order id into the linked list in sorted order
    /// @param orderId The order id to insert
    /// @param hintId The order id to begin searching for the position to
    /// insert the new order. Can be 0, 1, or the id of an actual order
    function insert(
        MinLinkedList storage listData,
        uint32 orderId,
        uint32 hintId
    ) public {
        uint32 indexToInsert = findIndexToInsert(listData, orderId, hintId);

        uint32 next = listData.list[indexToInsert].next;
        listData.list[orderId] = Node({
            prev: indexToInsert,
            next: next,
            active: true
        });
        listData.list[indexToInsert].next = orderId;
        listData.list[next].prev = orderId;
    }

    /// @notice Remove an order id from the linked list
    /// @dev Updates the linked list but does not delete the order id from
    /// the idToLimitOrder mapping
    /// @param orderId The order id to remove
    function erase(MinLinkedList storage listData, uint32 orderId) public {
        require(orderId > 1, "Cannot erase dummy orders");
        require(
            listData.list[orderId].active,
            "Cannot cancel an already inactive order"
        );

        uint32 prev = listData.list[orderId].prev;
        uint32 next = listData.list[orderId].next;

        listData.list[prev].next = next;
        listData.list[next].prev = prev;
        listData.list[orderId].active = false;
    }

    /// @notice Get the first order id in the linked list. Since the linked
    /// list is sorted, this gets the order id with the lowest price, if all
    /// the orders are dummy orders, returns 1
    /// @dev Order id 0 is a dummy value and should not be returned
    function getFirstNode(MinLinkedList storage listData)
        internal
        view
        returns (uint32)
    {
        return listData.list[0].next;
    }

    /// @notice Get the LimitOrder data struct for the first order
    function getTopLimitOrder(MinLinkedList storage listData)
        public
        view
        returns (LimitOrder storage)
    {
        require(!isEmpty(listData), "Book side is empty");
        return listData.idToLimitOrder[getFirstNode(listData)];
    }

    /// @notice Returns true if the linked list has no orders
    /// @dev Order id 0 and 1 are dummy values, so the linked list
    /// is empty if those are the only two orders
    function isEmpty(MinLinkedList storage listData)
        public
        view
        returns (bool)
    {
        return getFirstNode(listData) == 1;
    }

    /// @notice Returns the number of orders in the linked list
    /// @dev Order id 0 and 1 are dummy values, so the number of
    /// orders does not include them
    function size(MinLinkedList storage listData) public view returns (uint32) {
        uint32 listSize = 0;
        for (
            uint32 pointer = getFirstNode(listData);
            pointer != 1;
            pointer = listData.list[pointer].next
        ) ++listSize;
        return listSize;
    }

    /// @notice Returns a list of LimitOrder data structs for each
    /// order in the linked list
    /// @dev Order id 0 and 1 are dummy values, so the returned list
    /// does not include them
    function getOrders(MinLinkedList storage listData)
        public
        view
        returns (LimitOrder[] memory orders)
    {
        orders = new LimitOrder[](size(listData));
        uint32 i = 0;
        for (
            uint32 pointer = getFirstNode(listData);
            pointer != 1;
            pointer = listData.list[pointer].next
        ) {
            orders[i] = listData.idToLimitOrder[pointer];
            ++i;
        }
    }

    /// @notice Comparison function for linked list. Returns true if the
    /// price of amount0 to amount1 is less than the price of order id1
    function mockCompare(
        MinLinkedList storage listData,
        uint256 amount0,
        uint256 amount1,
        uint32 id1
    ) internal view returns (bool) {
        return
            FullMath.mulCompare(
                amount1,
                listData.idToLimitOrder[id1].amount0,
                listData.idToLimitOrder[id1].amount1,
                amount0
            );
    }

    /// @notice Find the order id to the left of where the new order
    /// should be inserted. Meant to be used off-chain to find the
    /// hintId for the insert function
    /// @param amount0 The amount of token0 in the new order
    /// @param amount1 The amount of token1 in the new order
    function getMockIndexToInsert(
        MinLinkedList storage listData,
        uint256 amount0,
        uint256 amount1
    ) public view returns (uint32) {
        uint32 hintId = 0;

        // After the two while loops, hintId will be the order id to the
        // left of where the new order should be inserted.
        while (hintId != 1) {
            uint32 nextId = listData.list[hintId].next;
            if (mockCompare(listData, amount0, amount1, nextId)) break;
            hintId = nextId;
        }

        while (hintId != 0) {
            uint32 prevId = listData.list[hintId].prev;
            if (!mockCompare(listData, amount0, amount1, hintId)) break;
            hintId = prevId;
        }

        return hintId;
    }
}

/// @title MaxLinkedListLib
/// @notice Library for linked list sorted in non-increasing order
/// @dev Order ids 0 and 1 are special values. The first node of the
/// linked list has order id 0 and the last node has order id 1.
/// Order 0 should be initalized (in OrderBook.sol) with the highest
/// possible price, and order 1 should be initialized with the lowest
library MaxLinkedListLib {
    /// @notice Comparison function for linked list. Returns true
    /// if the price of order id0 is strictly greater than the price of order id1
    function compare(
        MaxLinkedList storage listData,
        uint32 id0,
        uint32 id1
    ) internal view returns (bool) {
        return
            FullMath.mulCompare(
                listData.idToLimitOrder[id1].amount1,
                listData.idToLimitOrder[id0].amount0,
                listData.idToLimitOrder[id1].amount0,
                listData.idToLimitOrder[id0].amount1
            );
    }

    /// @notice Find the order id to the left of where the new order
    /// should be inserted
    /// @param orderId The order id to insert
    /// @param hintId The order id to start searching from
    function findIndexToInsert(
        MaxLinkedList storage listData,
        uint32 orderId,
        uint32 hintId
    ) internal view returns (uint32) {
        // No element in the linked list can have next = 0, it means hintId is not in the linked list
        require(listData.list[hintId].next != 0, "Invalid hint id");

        while (!listData.list[hintId].active) {
            hintId = listData.list[hintId].next;
        }

        // After the two while loops, hintId will be the order id to the
        // left of where the new order should be inserted.
        while (hintId != 1) {
            uint32 nextId = listData.list[hintId].next;
            if (compare(listData, orderId, nextId)) break;
            hintId = nextId;
        }

        while (hintId != 0) {
            uint32 prevId = listData.list[hintId].prev;
            if (!compare(listData, orderId, hintId)) break;
            hintId = prevId;
        }

        return hintId;
    }

    /// @notice Inserts an order id into the linked list in sorted order
    /// @param orderId The order id to insert
    /// @param hintId The order id to begin searching for the position to
    /// insert the new order. Can be 0, 1, or the id of an actual order
    function insert(
        MaxLinkedList storage listData,
        uint32 orderId,
        uint32 hintId
    ) public {
        uint32 indexToInsert = findIndexToInsert(listData, orderId, hintId);

        uint32 next = listData.list[indexToInsert].next;
        listData.list[orderId] = Node({
            prev: indexToInsert,
            next: next,
            active: true
        });
        listData.list[indexToInsert].next = orderId;
        listData.list[next].prev = orderId;
    }

    /// @notice Remove an order id from the linked list
    /// @dev Updates the linked list but does not delete the order id from
    /// the idToLimitOrder mapping
    /// @param orderId The order id to remove
    function erase(MaxLinkedList storage listData, uint32 orderId) public {
        require(orderId > 1, "Cannot erase dummy orders");
        require(
            listData.list[orderId].active,
            "Cannot cancel an already inactive order"
        );

        uint32 prev = listData.list[orderId].prev;
        uint32 next = listData.list[orderId].next;

        listData.list[prev].next = next;
        listData.list[next].prev = prev;
        listData.list[orderId].active = false;
    }

    /// @notice Get the first order id in the linked list. Since the linked
    /// list is sorted, this gets the order id with the highest price, if all
    /// the orders are dummy orders, returns 1
    /// @dev Order id 0 is a dummy value and should not be returned
    function getFirstNode(MaxLinkedList storage listData)
        internal
        view
        returns (uint32)
    {
        return listData.list[0].next;
    }

    /// @notice Get the LimitOrder data struct for the first order
    function getTopLimitOrder(MaxLinkedList storage listData)
        public
        view
        returns (LimitOrder storage)
    {
        require(!isEmpty(listData), "Book side is empty");
        return listData.idToLimitOrder[getFirstNode(listData)];
    }

    /// @notice Returns true if the linked list has no orders
    /// @dev Order id 0 and 1 are dummy values, so the linked list
    /// is empty if those are the only two orders
    function isEmpty(MaxLinkedList storage listData)
        public
        view
        returns (bool)
    {
        return getFirstNode(listData) == 1;
    }

    /// @notice Returns the number of orders in the linked list
    /// @dev Order id 0 and 1 are dummy values, so the number of
    /// orders does not include them
    function size(MaxLinkedList storage listData) public view returns (uint32) {
        uint32 listSize = 0;
        for (
            uint32 pointer = getFirstNode(listData);
            pointer != 1;
            pointer = listData.list[pointer].next
        ) ++listSize;
        return listSize;
    }

    /// @notice Returns a list of LimitOrder data structs for each
    /// order in the linked list
    /// @dev Order id 0 and 1 are dummy values, so the returned list
    /// does not include them
    function getOrders(MaxLinkedList storage listData)
        public
        view
        returns (LimitOrder[] memory orders)
    {
        orders = new LimitOrder[](size(listData));
        uint32 i = 0;
        for (
            uint32 pointer = getFirstNode(listData);
            pointer != 1;
            pointer = listData.list[pointer].next
        ) {
            orders[i] = listData.idToLimitOrder[pointer];
            ++i;
        }
    }

    /// @notice Comparison function for linked list. Returns true if the
    /// price of amount0 to amount1 is greater than the price of order id1
    function mockCompare(
        MaxLinkedList storage listData,
        uint256 amount0,
        uint256 amount1,
        uint32 id1
    ) internal view returns (bool) {
        return
            FullMath.mulCompare(
                listData.idToLimitOrder[id1].amount1,
                amount0,
                listData.idToLimitOrder[id1].amount0,
                amount1
            );
    }

    /// @notice Find the order id to the left of where the new order
    /// should be inserted. Meant to be used off-chain to find the
    /// hintId for the insert function
    /// @param amount0 The amount of token0 in the new order
    /// @param amount1 The amount of token1 in the new order
    function getMockIndexToInsert(
        MaxLinkedList storage listData,
        uint256 amount0,
        uint256 amount1
    ) public view returns (uint32) {
        uint32 hintId = 0;

        // After the two while loops, hintId will be the order id to the
        // left of where the new order should be inserted.

        while (hintId != 1) {
            uint32 nextId = listData.list[hintId].next;
            if (mockCompare(listData, amount0, amount1, nextId)) break;
            hintId = nextId;
        }

        while (hintId != 0) {
            uint32 prevId = listData.list[hintId].prev;
            if (!mockCompare(listData, amount0, amount1, hintId)) break;
            hintId = prevId;
        }

        return hintId;
    }
}
