// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

/// @title Order Book Helper Interface
/// @notice Helper contracts provides view functions for Lighter users
/// to fetch and compute swap and book information
interface IOrderBookHelper {
    /// @notice Get the maximum order book id
    /// Order book id's are incremented by 1 for each order book created
    /// @return maxOrderBookId The maximum order book id
    function getMaxOrderBookId() external view returns (uint8);

    /// @notice Returns the details for all existing order books
    /// @return orderBookIds The id of the order book
    /// @return orderBookAddresses The address of the order book
    /// @return token0s The base token of the order book
    /// @return token1s The quote token of the order book
    /// @return sizeTicks The size tick of the order book
    /// @return priceTicks The price tick of the order book
    function getAllOrderBooks()
        external
        view
        returns (
            uint8[] memory orderBookIds,
            address[] memory orderBookAddresses,
            address[] memory token0s,
            address[] memory token1s,
            uint8[] memory sizeTicks,
            uint8[] memory priceTicks
        );

    /// @notice Returns market order inputs for given order book and amount to receive
    /// Returned data is the biggest order bounded by receiving at most amountOut tokens
    /// @param orderBookId Id of the order book to get the swap data on
    /// @param amountOut Upper bound for the amount to receive after the swap.
    /// @param isOutToken0 True if the amountOut is token0, false otherwise
    /// @return amount0Base The amount0 in base units
    /// @return priceBase The price in base units
    /// @return isAsk True if the market order is an ask, false otherwise
    /// @return amount0 Exact amount0 to send or receive
    /// @return amount1 Exact amount1 to send or receive
    function getSwapDataFromOut(
        uint8 orderBookId,
        uint256 amountOut,
        bool isOutToken0
    )
        external
        view
        returns (
            uint64 amount0Base,
            uint64 priceBase,
            bool isAsk,
            uint256 amount0,
            uint256 amount1
        );

    /// @notice Returns market order inputs for given order book and amount to receive
    /// Returned data is the biggest order bounded by sending at most amountIn tokens
    /// @param orderBookId Id of the order book to get the swap data on
    /// @param amountIn Upper bound for the amount to send for the swap.
    /// @param isInToken0 True if the amountIn is token0, false otherwise
    /// @return amount0Base The amount0 in base units
    /// @return priceBase The price in base units
    /// @return isAsk True if the market order is an ask, false otherwise
    /// @return amount0 Exact amount0 to send or receive
    /// @return amount1 Exact amount1 to send or receive
    function getSwapDataFromIn(
        uint8 orderBookId,
        uint256 amountIn,
        bool isInToken0
    )
        external
        view
        returns (
            uint64 amount0Base,
            uint64 priceBase,
            bool isAsk,
            uint256 amount0,
            uint256 amount1
        );
}
