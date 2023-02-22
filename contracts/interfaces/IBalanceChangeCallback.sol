// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title OrderFillCallback interface
/// @notice Callback for updating token balances
interface IBalanceChangeCallback {
    /// @notice Transfer tokens from the contract to the user
    /// @param tokenToTransfer The token to transfer
    /// @param to The user to transfer to
    /// @param amount The amount to transfer
    /// @param orderBookId Id of caller the order book
    /// @return success Whether the transfer was successful
    function addBalanceCallback(
        IERC20Metadata tokenToTransfer,
        address to,
        uint256 amount,
        uint8 orderBookId
    ) external returns (bool);

    /// @notice Transfer tokens from the contract to the user
    /// @param tokenToTransfer The token to transfer
    /// @param to The user to transfer to
    /// @param amount The amount to transfer
    /// @param orderBookId Id of caller the order book
    function addSafeBalanceCallback(
        IERC20Metadata tokenToTransfer,
        address to,
        uint256 amount,
        uint8 orderBookId
    ) external;

    /// @notice Transfer tokens from the user to the contract
    /// @param tokenToTransferFrom The token to transfer from
    /// @param from The user to transfer from
    /// @param amount The amount to transfer
    /// @param orderBookId Id of caller the order book
    function subtractSafeBalanceCallback(
        IERC20Metadata tokenToTransferFrom,
        address from,
        uint256 amount,
        uint8 orderBookId
    ) external;
}
