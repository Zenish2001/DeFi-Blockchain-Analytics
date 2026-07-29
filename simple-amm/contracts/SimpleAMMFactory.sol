// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SimpleAMM.sol";

/// @title SimpleAMMFactory
/// @notice Deploys and tracks SimpleAMM pairs, so a frontend can list every
///         available pool by reading `allPairs` instead of hardcoding one
///         pair's address.
contract SimpleAMMFactory {
    address[] public allPairs;

    /// @dev getPair[token0][token1] and getPair[token1][token0] both resolve
    ///      to the same pair address, regardless of argument order.
    mapping(address => mapping(address => address)) public getPair;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 index);

    /// @notice Deploys a new SimpleAMM pool for the given token pair.
    /// @dev    Tokens are sorted into canonical (token0 < token1) order so
    ///         (A, B) and (B, A) always map to the same pool.
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "IDENTICAL_ADDRESSES");
        require(tokenA != address(0) && tokenB != address(0), "ZERO_ADDRESS");

        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(getPair[token0][token1] == address(0), "PAIR_EXISTS");

        SimpleAMM newPair = new SimpleAMM(token0, token1);
        pair = address(newPair);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }
}
