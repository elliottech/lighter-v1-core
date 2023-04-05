// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.16;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {Vm} from "../../lib/forge-std/src/Vm.sol";
import "../../lib/forge-std/src/console.sol";
import "../../lib/forge-std/src/Script.sol";
import {LighterBaseTest} from "./LighterBaseTest.sol";
import {Factory} from "../../contracts/Factory.sol";

contract OrderBookFactoryTest is Test, LighterBaseTest {
    Factory internal orderBookFactory;
   
    function setUp() public {
       orderBookFactory = createFactory();
    }

    function testFactory() public {
        assertEq(orderBookFactory.owner(), owner);
    }
}
