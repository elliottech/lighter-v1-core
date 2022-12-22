// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

/// @title Factory Interface
/// @notice The Factory facilitates creation of order books
interface IFactory {
    /// @notice Event emitted when an order book is created
    /// @param orderBookId The id of the order book
    /// @param orderBookAddress The address of the created orderBook
    /// @param token0 The base token of the orderBook
    /// @param token1 The quote token of the orderBook
    /// @param logSizeTick Log10 of base token tick
    /// amount0 % 10**logSizeTick = 0 should be satisfied
    /// @param logPriceTick Log10 of price tick amount1 * dec0 % amount = 0
    /// and amount1 * dec0 / amount0 % 10**logPriceTick = 0 should be satisfied
    event OrderBookCreated(
        uint8 orderBookId,
        address orderBookAddress,
        address token0,
        address token1,
        uint8 logSizeTick,
        uint8 logPriceTick
    );

    /// @notice Event emitted when the owner is changed
    /// @param owner Address of the new owner
    event OwnerChanged(address owner);

    /// @notice Returns the current owner of the factory
    /// @return owner The address of the factory owner
    function owner() external view returns (address);

    /// @notice Set the router address for the factory. The router address
    /// can only be set once
    /// @param routerAddress The address of the router
    function setRouter(address routerAddress) external;

    /// @notice Set the owner of the factory
    /// @param _owner The address of the new owner
    function setOwner(address _owner) external;

    /// @notice Returns the address of the order book for a given token pair,
    /// or address 0 if it does not exist
    /// @dev token0 and token1 may be passed in either order
    /// @param token0 The contract address the first token
    /// @param token1 The contract address the second token
    /// @return orderBookAddress The address of the order book
    function getOrderBookFromTokenPair(address token0, address token1)
        external
        view
        returns (address);

    /// @notice Returns the address of the order book for the given order book id
    /// @param orderBookId The id of the order book to lookup
    /// @return orderBookAddress The address of the order book
    function getOrderBookFromId(uint8 orderBookId)
        external
        view
        returns (address);

    /// @notice Returns the details of the order book for a given token pair
    /// @param token0 The first token of the order book
    /// @param token1 The second token of the order book
    /// @return orderBookId The id of the order book
    /// @return orderBookAddress The address of the order book
    /// @return token0 The base token of the order book
    /// @return token1 The quote token of the order book
    /// @return sizeTick The size tick of the order book
    /// @return priceTick The price tick of the order book
    function getOrderBookDetailsFromTokenPair(address token0, address token1)
        external
        view
        returns (
            uint8,
            address,
            address,
            address,
            uint128,
            uint128
        );

    /// @notice Returns the details of the order book for a given order book id
    /// @param orderBookId The id of the order book to lookup
    /// @return orderBookId The id of the order book
    /// @return orderBookAddress The address of the order book
    /// @return token0 The base token of the order book
    /// @return token1 The quote token of the order book
    /// @return sizeTick The size tick of the order book
    /// @return priceTick The price tick of the order book
    function getOrderBookDetailsFromId(uint8 orderBookId)
        external
        view
        returns (
            uint8,
            address,
            address,
            address,
            uint128,
            uint128
        );

    /// @notice Creates a orderBook for the given two tokens
    /// @dev token0 and token1 may be passed in either order
    /// @param token0 The contract address the first token
    /// @param token1 The contract address the second token
    /// @param logSizeTick Log10 of base token tick
    /// amount0 % 10**logSizeTick = 0 should be satisfied
    /// @param logPriceTick Log10 of price tick amount1 * dec0 % amount = 0
    /// and amount1 * dec0 / amount0 % 10**logPriceTick = 0 should be satisfied
    /// @return orderBookAddress The address of the newly created orderBook
    function createOrderBook(
        address token0,
        address token1,
        uint8 logSizeTick,
        uint8 logPriceTick
    ) external returns (address);
}
