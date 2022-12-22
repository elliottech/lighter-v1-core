// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts/utils/math/Math.sol";

library FullMath {
    /// @notice Returns a*b/denominator, throws if remainder is not 0
    function mulDiv(
        uint256 a,
        uint256 b,
        uint256 denominator
    ) internal pure returns (uint256 result) {
        require(denominator != 0, "Can not divide with 0");
        uint256 remainder = 0;
        assembly {
            remainder := mulmod(a, b, denominator)
        }
        require(remainder == 0, "Divison has a positive remainder");
        return Math.mulDiv(a, b, denominator);
    }

    /// @notice Returns true if a*b < c*d
    function mulCompare(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d
    ) internal pure returns (bool result) {
        uint256 prod0; // Least significant 256 bits of the product a*b
        uint256 prod1; // Most significant 256 bits of the product a*b
        assembly {
            let mm := mulmod(a, b, not(0))
            prod0 := mul(a, b)
            prod1 := sub(sub(mm, prod0), lt(mm, prod0))
        }

        uint256 prod2; // Least significant 256 bits of the product c*d
        uint256 prod3; // Most significant 256 bits of the product c*d
        assembly {
            let mm := mulmod(c, d, not(0))
            prod2 := mul(c, d)
            prod3 := sub(sub(mm, prod2), lt(mm, prod2))
        }

        if (prod1 < prod3) return true;
        if (prod3 < prod1) return false;
        if (prod0 < prod2) return true;
        return false;
    }
}
