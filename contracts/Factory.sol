// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./interfaces/IFactory.sol";

import "./OrderBook.sol";

/// @title Canonical factory
/// @notice Deploys order book and manages ownership
contract Factory is IFactory {
    using Counters for Counters.Counter;

    address public override owner;
    address public router;
    Counters.Counter private _orderBookIdCounter;

    mapping(address => mapping(address => address))
        private orderBooksByTokenPair;
    mapping(uint8 => address) private orderBooksById;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can call this function");
        _;
    }

    constructor(address _owner) {
        require(_owner != address(0), "Owner address can not be zero");
        owner = _owner;
    }

    /// @inheritdoc IFactory
    function setRouter(address routerAddress) external override onlyOwner {
        require(router == address(0), "Router address is already set");
        require(routerAddress != address(0), "Router address can not be zero");
        router = routerAddress;
    }

    /// inheritdoc IFactory
    function setOwner(address _owner) external override onlyOwner {
        require(_owner != address(0), "New owner address can not be zero");
        owner = _owner;
        emit OwnerChanged(_owner);
    }

    /// @inheritdoc IFactory
    function getOrderBookFromTokenPair(
        address token0,
        address token1
    ) external view override returns (address) {
        return orderBooksByTokenPair[token0][token1];
    }

    /// @notice Returns the address of the order book for the given order book id
    /// @param orderBookId The id of the order book to lookup
    /// @return orderBookAddress The address of the order book
    function getOrderBookFromId(
        uint8 orderBookId
    ) external view override returns (address) {
        return orderBooksById[orderBookId];
    }

    /// @inheritdoc IFactory
    function getOrderBookDetailsFromTokenPair(
        address _token0,
        address _token1
    )
        external
        view
        override
        returns (
            uint8 orderBookId,
            address orderBookAddress,
            address token0,
            address token1,
            uint128 sizeTick,
            uint128 priceTick
        )
    {
        orderBookAddress = orderBooksByTokenPair[_token0][_token1];
        if (orderBookAddress != address(0)) {
            IOrderBook orderBook = IOrderBook(orderBookAddress);
            orderBookId = orderBook.orderBookId();
            token0 = _token0;
            token1 = _token1;
            sizeTick = orderBook.sizeTick();
            priceTick = orderBook.priceTick();
        }
    }

    /// @inheritdoc IFactory
    function getOrderBookDetailsFromId(
        uint8 _orderBookId
    )
        external
        view
        override
        returns (
            uint8 orderBookId,
            address orderBookAddress,
            address token0,
            address token1,
            uint128 sizeTick,
            uint128 priceTick
        )
    {
        orderBookAddress = orderBooksById[_orderBookId];
        if (orderBookAddress != address(0)) {
            IOrderBook orderBook = IOrderBook(orderBookAddress);
            orderBookId = _orderBookId;
            token0 = address(orderBook.token0());
            token1 = address(orderBook.token1());
            sizeTick = orderBook.sizeTick();
            priceTick = orderBook.priceTick();
        }
    }

    // @inheritdoc IFactory
    function createOrderBook(
        address token0,
        address token1,
        uint8 logSizeTick,
        uint8 logPriceTick
    ) external override onlyOwner returns (address orderBookAddress) {
        require(token0 != token1);
        require(token0 != address(0));
        require(token1 != address(0));

        require(router != address(0), "Router address is not set");

        require(
            orderBooksByTokenPair[token0][token1] == address(0),
            "Order book already exists"
        );
        require(
            orderBooksByTokenPair[token1][token0] == address(0),
            "Order book already exists with different token order"
        );
        uint8 orderBookId = uint8(_orderBookIdCounter.current());

        orderBookAddress = address(
            new OrderBook(
                orderBookId,
                token0,
                token1,
                router,
                logSizeTick,
                logPriceTick
            )
        );

        orderBooksByTokenPair[token0][token1] = orderBookAddress;
        orderBooksById[orderBookId] = orderBookAddress;
        _orderBookIdCounter.increment();
        require(
            _orderBookIdCounter.current() < 1 << 8,
            "Can not create order book"
        );

        emit OrderBookCreated(
            orderBookId,
            orderBookAddress,
            token0,
            token1,
            logSizeTick,
            logPriceTick
        );
    }
}
