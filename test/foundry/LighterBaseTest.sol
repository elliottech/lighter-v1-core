// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.16;

import "forge-std/console.sol";
import "../../contracts/Factory.sol";

contract LighterBaseTest {
    address constant NATIVE_TOKEN_ADDRESS =
        address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);
    address internal constant ZERO_ADDRESS = address(0);
    address constant owner = 0xD07E50196a05e6f9E6656EFaE10fc9963BEd6E57;
    bytes constant EMPTY_DATA = "0x";

    function createFactory() internal returns (Factory) {
        return new Factory(owner);
    }
}
