const { expect } = require("chai");
const { ethers } = require("hardhat");

// Reproduce the contract's swap math in JS (BigInt) so we can assert exact outputs.
function getAmountOut(amountIn, reserveIn, reserveOut) {
  const amountInWithFee = amountIn * 997n;
  return (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
}

// Integer square root, matching SimpleAMM._sqrt, for first-deposit assertions.
function isqrt(value) {
  if (value < 2n) return value;
  let z = (value + 1n) / 2n;
  let y = value;
  while (z < y) {
    y = z;
    z = (value / z + z) / 2n;
  }
  return y;
}

describe("SimpleAMM", function () {
  const INITIAL_MINT = ethers.parseEther("1000000");
  const MAX = ethers.MaxUint256;

  let owner, alice, bob, carol;
  let tokenA, tokenB, amm;
  let addrA, addrB, addrAmm;

  async function deployPair() {
    const Mock = await ethers.getContractFactory("MockERC20");
    const tA = await Mock.deploy("Token A", "TKA");
    const tB = await Mock.deploy("Token B", "TKB");
    const AMM = await ethers.getContractFactory("SimpleAMM");
    const pair = await AMM.deploy(await tA.getAddress(), await tB.getAddress());
    return { tA, tB, pair };
  }

  beforeEach(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();

    const deployed = await deployPair();
    tokenA = deployed.tA;
    tokenB = deployed.tB;
    amm = deployed.pair;

    addrA = await tokenA.getAddress();
    addrB = await tokenB.getAddress();
    addrAmm = await amm.getAddress();

    // Fund and fully approve alice and bob.
    for (const user of [alice, bob]) {
      await tokenA.mint(user.address, INITIAL_MINT);
      await tokenB.mint(user.address, INITIAL_MINT);
      await tokenA.connect(user).approve(addrAmm, MAX);
      await tokenB.connect(user).approve(addrAmm, MAX);
    }
  });

  // ---------------------------------------------------------------------------
  // Constructor / LP token metadata
  // ---------------------------------------------------------------------------
  describe("constructor", function () {
    it("stores the token addresses", async function () {
      expect(await amm.tokenA()).to.equal(addrA);
      expect(await amm.tokenB()).to.equal(addrB);
    });

    it("exposes the LP token as an ERC20 with a name and symbol", async function () {
      expect(await amm.name()).to.equal("SimpleAMM LP");
      expect(await amm.symbol()).to.equal("SAMM-LP");
    });

    it("starts with empty reserves and no liquidity", async function () {
      expect(await amm.reserveA()).to.equal(0n);
      expect(await amm.reserveB()).to.equal(0n);
      expect(await amm.totalSupply()).to.equal(0n);
    });

    it("reverts when both tokens are identical", async function () {
      const AMM = await ethers.getContractFactory("SimpleAMM");
      await expect(AMM.deploy(addrA, addrA)).to.be.revertedWith("IDENTICAL_TOKENS");
    });
  });

  // ---------------------------------------------------------------------------
  // deposit
  // ---------------------------------------------------------------------------
  describe("deposit", function () {
    it("mints geometric-mean LP tokens on the first deposit", async function () {
      const a = ethers.parseEther("1000");
      const b = ethers.parseEther("4000");
      const expectedLiq = isqrt(a * b); // sqrt(1000 * 4000)e18 = 2000e18

      await expect(amm.connect(alice).deposit(a, b))
        .to.emit(amm, "Deposit")
        .withArgs(alice.address, a, b, expectedLiq);

      expect(await amm.balanceOf(alice.address)).to.equal(expectedLiq);
      expect(await amm.totalSupply()).to.equal(expectedLiq);
      expect(await amm.reserveA()).to.equal(a);
      expect(await amm.reserveB()).to.equal(b);
      expect(await tokenA.balanceOf(addrAmm)).to.equal(a);
      expect(await tokenB.balanceOf(addrAmm)).to.equal(b);
    });

    it("returns the minted liquidity value", async function () {
      const a = ethers.parseEther("1000");
      const b = ethers.parseEther("1000");
      const returned = await amm.connect(alice).deposit.staticCall(a, b);
      expect(returned).to.equal(isqrt(a * b));
    });

    it("mints proportional LP on a balanced follow-up deposit", async function () {
      // First deposit sets supply = 1000e18, reserves = 1000e18 / 1000e18.
      const base = ethers.parseEther("1000");
      await amm.connect(alice).deposit(base, base);

      // Balanced follow-up: liqA == liqB, so the ternary takes its FALSE path.
      const add = ethers.parseEther("500");
      await amm.connect(bob).deposit(add, add);

      expect(await amm.balanceOf(bob.address)).to.equal(ethers.parseEther("500"));
      expect(await amm.totalSupply()).to.equal(ethers.parseEther("1500"));
      expect(await amm.reserveA()).to.equal(ethers.parseEther("1500"));
      expect(await amm.reserveB()).to.equal(ethers.parseEther("1500"));
    });

    it("uses the smaller side on an imbalanced follow-up deposit", async function () {
      const base = ethers.parseEther("1000");
      await amm.connect(alice).deposit(base, base);

      // Imbalanced: liqA = 100e18 < liqB = 200e18, so the ternary takes TRUE.
      const addA = ethers.parseEther("100");
      const addB = ethers.parseEther("200");
      await amm.connect(bob).deposit(addA, addB);

      expect(await amm.balanceOf(bob.address)).to.equal(ethers.parseEther("100"));
      expect(await amm.totalSupply()).to.equal(ethers.parseEther("1100"));
      // Full amounts are pulled in; the extra tokenB is effectively donated.
      expect(await amm.reserveA()).to.equal(ethers.parseEther("1100"));
      expect(await amm.reserveB()).to.equal(ethers.parseEther("1200"));
    });

    it("reverts when amountA is zero", async function () {
      await expect(
        amm.connect(alice).deposit(0, ethers.parseEther("100"))
      ).to.be.revertedWith("AMOUNT_A_ZERO");
    });

    it("reverts when amountB is zero", async function () {
      await expect(
        amm.connect(alice).deposit(ethers.parseEther("100"), 0)
      ).to.be.revertedWith("AMOUNT_B_ZERO");
    });

    it("reverts when a follow-up deposit mints zero liquidity", async function () {
      // Skewed initial pool: reserveA = 100 (wei), reserveB = 1, supply = sqrt(100) = 10.
      await amm.connect(alice).deposit(100n, 1n);
      // deposit(1,1): liqA = 1*10/100 = 0, liqB = 1*10/1 = 10, min = 0 -> revert.
      await expect(
        amm.connect(bob).deposit(1n, 1n)
      ).to.be.revertedWith("INSUFFICIENT_LIQUIDITY_MINTED");
    });
  });

  // ---------------------------------------------------------------------------
  // redeem
  // ---------------------------------------------------------------------------
  describe("redeem", function () {
    beforeEach(async function () {
      // Alice provides 1000/1000, receiving 1000e18 LP tokens.
      const base = ethers.parseEther("1000");
      await amm.connect(alice).deposit(base, base);
    });

    it("returns proportional reserves and burns LP tokens", async function () {
      const burn = ethers.parseEther("400");
      const expectedA = ethers.parseEther("400");
      const expectedB = ethers.parseEther("400");

      const balABefore = await tokenA.balanceOf(alice.address);
      const balBBefore = await tokenB.balanceOf(alice.address);

      await expect(amm.connect(alice).redeem(burn))
        .to.emit(amm, "Redeem")
        .withArgs(alice.address, expectedA, expectedB, burn);

      expect(await amm.balanceOf(alice.address)).to.equal(ethers.parseEther("600"));
      expect(await amm.totalSupply()).to.equal(ethers.parseEther("600"));
      expect(await amm.reserveA()).to.equal(ethers.parseEther("600"));
      expect(await amm.reserveB()).to.equal(ethers.parseEther("600"));
      expect(await tokenA.balanceOf(alice.address)).to.equal(balABefore + expectedA);
      expect(await tokenB.balanceOf(alice.address)).to.equal(balBBefore + expectedB);
    });

    it("returns the withdrawn amounts", async function () {
      const [outA, outB] = await amm.connect(alice).redeem.staticCall(ethers.parseEther("250"));
      expect(outA).to.equal(ethers.parseEther("250"));
      expect(outB).to.equal(ethers.parseEther("250"));
    });

    it("lets a user who received LP tokens by transfer redeem them", async function () {
      // Demonstrates the LP token is a genuine, transferable ERC20.
      await amm.connect(alice).transfer(bob.address, ethers.parseEther("200"));
      expect(await amm.balanceOf(bob.address)).to.equal(ethers.parseEther("200"));

      await amm.connect(bob).redeem(ethers.parseEther("200"));
      expect(await amm.balanceOf(bob.address)).to.equal(0n);
    });

    it("reverts when liquidity is zero", async function () {
      await expect(amm.connect(alice).redeem(0)).to.be.revertedWith("LIQUIDITY_ZERO");
    });

    it("reverts when redeeming more than the caller's balance", async function () {
      // Bob holds no LP tokens.
      await expect(
        amm.connect(bob).redeem(ethers.parseEther("1"))
      ).to.be.revertedWith("INSUFFICIENT_BALANCE");
    });
  });

  // ---------------------------------------------------------------------------
  // swap
  // ---------------------------------------------------------------------------
  describe("swap", function () {
    const RES = ethers.parseEther("1000");

    beforeEach(async function () {
      // Seed a balanced 1000/1000 pool.
      await amm.connect(alice).deposit(RES, RES);
    });

    it("swaps tokenA for tokenB with the 0.30% fee applied", async function () {
      const amountIn = ethers.parseEther("100");
      const expectedOut = getAmountOut(amountIn, RES, RES);
      expect(expectedOut).to.be.gt(0n);

      const returned = await amm.connect(bob).swap.staticCall(addrA, amountIn, 0n);
      expect(returned).to.equal(expectedOut);

      const balBBefore = await tokenB.balanceOf(bob.address);

      await expect(amm.connect(bob).swap(addrA, amountIn, expectedOut))
        .to.emit(amm, "Swap")
        .withArgs(bob.address, addrA, amountIn, expectedOut, RES + amountIn, RES - expectedOut);

      expect(await amm.reserveA()).to.equal(RES + amountIn);
      expect(await amm.reserveB()).to.equal(RES - expectedOut);
      expect(await tokenB.balanceOf(bob.address)).to.equal(balBBefore + expectedOut);
    });

    it("swaps tokenB for tokenA with the 0.30% fee applied", async function () {
      const amountIn = ethers.parseEther("250");
      const expectedOut = getAmountOut(amountIn, RES, RES);

      const balABefore = await tokenA.balanceOf(bob.address);

      await expect(amm.connect(bob).swap(addrB, amountIn, expectedOut))
        .to.emit(amm, "Swap")
        .withArgs(bob.address, addrB, amountIn, expectedOut, RES - expectedOut, RES + amountIn);

      expect(await amm.reserveB()).to.equal(RES + amountIn);
      expect(await amm.reserveA()).to.equal(RES - expectedOut);
      expect(await tokenA.balanceOf(bob.address)).to.equal(balABefore + expectedOut);
    });

    it("never lets the constant-product k decrease (fee accrues to LPs)", async function () {
      const kBefore = (await amm.reserveA()) * (await amm.reserveB());
      await amm.connect(bob).swap(addrA, ethers.parseEther("100"), 0n);
      const kAfter = (await amm.reserveA()) * (await amm.reserveB());
      expect(kAfter).to.be.gte(kBefore);
    });

    it("reverts on an unsupported input token", async function () {
      // carol.address is neither tokenA nor tokenB.
      await expect(
        amm.connect(bob).swap(carol.address, ethers.parseEther("1"), 0n)
      ).to.be.revertedWith("INVALID_TOKEN");
    });

    it("reverts when amountIn is zero", async function () {
      await expect(amm.connect(bob).swap(addrA, 0n, 0n)).to.be.revertedWith("AMOUNT_IN_ZERO");
    });

    it("reverts when the output is below minAmountOut", async function () {
      const amountIn = ethers.parseEther("100");
      const expectedOut = getAmountOut(amountIn, RES, RES);
      await expect(
        amm.connect(bob).swap(addrA, amountIn, expectedOut + 1n)
      ).to.be.revertedWith("SLIPPAGE");
    });
  });
});