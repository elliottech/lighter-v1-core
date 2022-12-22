// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    uint8 _decimals;

    constructor(string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
    {
        _decimals = 3;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function setDecimals(uint8 decimals_) public {
        _decimals = decimals_;
    }
}
