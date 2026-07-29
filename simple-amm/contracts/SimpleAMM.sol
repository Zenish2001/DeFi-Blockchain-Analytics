// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SimpleAMM
/// @notice A simplified constant-product ("x * y = k") automated market maker
///         inspired by Uniswap V2, for a single token pair. It exposes three
///         actions: `deposit` (add liquidity), `redeem` (remove liquidity), and
///         `swap` (trade one token for the other).
/// @dev    Like the Uniswap V2 Pair, this contract IS the liquidity ("LP")
///         token: it inherits ERC20, so LP units are real minted/burned,
///         transferable tokens. The pool holds three token types in total:
///           - atomic tokenA,
///           - atomic tokenB,
///           - the minted LP token (this contract).
///         A 0.30% fee (997/1000) is charged on every swap, exactly like V2.
///
///         Deliberate simplifications versus production Uniswap V2:
///         - No MINIMUM_LIQUIDITY lock on the first deposit (the classic
///           first-depositor inflation guard is omitted for clarity).
///         - Reserves are tracked explicitly rather than synced from
///           `balanceOf`, so tokens sent directly to the contract are ignored
///           by the pricing math.
contract SimpleAMM is ERC20 {
    using SafeERC20 for IERC20;

    // --- Immutable pair configuration ---
    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;

    // --- Pool reserves ---
    uint256 public reserveA;
    uint256 public reserveB;

    // --- Fee: 0.30% taken on the input amount (997 kept per 1000) ---
    uint256 private constant FEE_NUM = 997;
    uint256 private constant FEE_DEN = 1000;

    event Deposit(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidity);
    event Redeem(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidity);

    /// @dev reserveA/reserveB were added so the UI can read the pool's exact
    ///      state at the moment of each swap straight from the event log,
    ///      without needing an extra RPC call for historical reserves.
    event Swap(
        address indexed trader,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        uint256 reserveA,
        uint256 reserveB
    );

    constructor(address _tokenA, address _tokenB) ERC20("SimpleAMM LP", "SAMM-LP") {
        require(_tokenA != _tokenB, "IDENTICAL_TOKENS");
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    /// @notice Uniswap V2-style accessors so external tooling (Factory, UI)
    ///         can read the pair's tokens without knowing this contract's
    ///         internal tokenA/tokenB naming.
    function token0() external view returns (address) {
        return address(tokenA);
    }

    function token1() external view returns (address) {
        return address(tokenB);
    }

    /// @notice Add liquidity by depositing both tokens; mints LP tokens to caller.
    /// @param amountA Amount of tokenA to deposit.
    /// @param amountB Amount of tokenB to deposit.
    /// @return liquidity The number of LP tokens minted to the caller.
    function deposit(uint256 amountA, uint256 amountB) external returns (uint256 liquidity) {
        require(amountA > 0, "AMOUNT_A_ZERO");
        require(amountB > 0, "AMOUNT_B_ZERO");

        uint256 supply = totalSupply();
        if (supply == 0) {
            // First provider defines the initial price. LP minted is the
            // geometric mean of the two deposits: sqrt(amountA * amountB).
            liquidity = _sqrt(amountA * amountB);
        } else {
            // Later providers receive LP proportional to their smaller-valued
            // contribution, which keeps the pool ratio well-defined.
            uint256 liqA = (amountA * supply) / reserveA;
            uint256 liqB = (amountB * supply) / reserveB;
            liquidity = liqA < liqB ? liqA : liqB;
        }

        require(liquidity > 0, "INSUFFICIENT_LIQUIDITY_MINTED");

        // Effects before interactions (checks-effects-interactions).
        reserveA += amountA;
        reserveB += amountB;
        _mint(msg.sender, liquidity);

        tokenA.safeTransferFrom(msg.sender, address(this), amountA);
        tokenB.safeTransferFrom(msg.sender, address(this), amountB);

        emit Deposit(msg.sender, amountA, amountB, liquidity);
    }

    /// @notice Burn LP tokens and withdraw the proportional share of both reserves.
    /// @param liquidity The number of LP tokens to burn.
    /// @return amountA Amount of tokenA returned.
    /// @return amountB Amount of tokenB returned.
    function redeem(uint256 liquidity) external returns (uint256 amountA, uint256 amountB) {
        require(liquidity > 0, "LIQUIDITY_ZERO");
        require(liquidity <= balanceOf(msg.sender), "INSUFFICIENT_BALANCE");

        uint256 supply = totalSupply();
        amountA = (liquidity * reserveA) / supply;
        amountB = (liquidity * reserveB) / supply;

        // Effects before interactions.
        reserveA -= amountA;
        reserveB -= amountB;
        _burn(msg.sender, liquidity);

        tokenA.safeTransfer(msg.sender, amountA);
        tokenB.safeTransfer(msg.sender, amountB);

        emit Redeem(msg.sender, amountA, amountB, liquidity);
    }

    /// @notice Swap an exact amount of one token for as much of the other as the
    ///         curve allows, after the 0.30% fee.
    /// @param tokenIn      Address of the token being sold (must be tokenA or tokenB).
    /// @param amountIn     Exact amount of `tokenIn` to sell.
    /// @param minAmountOut Minimum acceptable output (slippage protection).
    /// @return amountOut   Amount of the output token sent to the caller.
    function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut)
        external
        returns (uint256 amountOut)
    {
        require(tokenIn == address(tokenA) || tokenIn == address(tokenB), "INVALID_TOKEN");
        require(amountIn > 0, "AMOUNT_IN_ZERO");

        bool inputIsA = tokenIn == address(tokenA);
        uint256 reserveIn = inputIsA ? reserveA : reserveB;
        uint256 reserveOut = inputIsA ? reserveB : reserveA;

        // Constant-product pricing with the fee applied to the input:
        //   amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
        uint256 amountInWithFee = amountIn * FEE_NUM;
        amountOut = (amountInWithFee * reserveOut) / (reserveIn * FEE_DEN + amountInWithFee);

        require(amountOut >= minAmountOut, "SLIPPAGE");

        if (inputIsA) {
            reserveA += amountIn;
            reserveB -= amountOut;
            tokenA.safeTransferFrom(msg.sender, address(this), amountIn);
            tokenB.safeTransfer(msg.sender, amountOut);
        } else {
            reserveB += amountIn;
            reserveA -= amountOut;
            tokenB.safeTransferFrom(msg.sender, address(this), amountIn);
            tokenA.safeTransfer(msg.sender, amountOut);
        }

        emit Swap(msg.sender, tokenIn, amountIn, amountOut, reserveA, reserveB);
    }

    /// @dev Integer square root (Babylonian method). Written so its only branch
    ///      is the loop condition, which is reached both true and false by any
    ///      normal call, keeping branch coverage clean. sqrt(0) = 0, sqrt(1) = 1.
    function _sqrt(uint256 x) private pure returns (uint256) {
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }
}
