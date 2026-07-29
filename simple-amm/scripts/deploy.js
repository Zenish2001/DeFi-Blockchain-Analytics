const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // ---------------------------------------------------------------------
  // 1. Deploy two mock tokens (so we have something to trade)
  // ---------------------------------------------------------------------
  const Mock = await ethers.getContractFactory("MockERC20");

  const tokenA = await Mock.deploy("Alpha Token", "ALPHA");
  await tokenA.waitForDeployment();
  console.log("Alpha Token deployed to:", await tokenA.getAddress());

  const tokenB = await Mock.deploy("Beta Token", "BETA");
  await tokenB.waitForDeployment();
  console.log("Beta Token deployed to:", await tokenB.getAddress());

  // ---------------------------------------------------------------------
  // 2. Deploy the Factory
  // ---------------------------------------------------------------------
  const Factory = await ethers.getContractFactory("SimpleAMMFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  console.log("SimpleAMMFactory deployed to:", await factory.getAddress());

  // ---------------------------------------------------------------------
  // 3. Create a pair through the Factory
  // ---------------------------------------------------------------------
  const tokenAAddr = await tokenA.getAddress();
  const tokenBAddr = await tokenB.getAddress();

  const createTx = await factory.createPair(tokenAAddr, tokenBAddr);
  const createReceipt = await createTx.wait();
  console.log("Pair created. Tx hash:", createReceipt.hash);

  const pairAddr = await factory.getPair(tokenAAddr, tokenBAddr);
  console.log("SimpleAMM pair deployed to:", pairAddr);

  const amm = await ethers.getContractAt("SimpleAMM", pairAddr);

  // ---------------------------------------------------------------------
  // 4. Mint tokens to the deployer and seed initial liquidity
  // ---------------------------------------------------------------------
  const mintAmount = ethers.parseEther("100000");
  await (await tokenA.mint(deployer.address, mintAmount)).wait();
  await (await tokenB.mint(deployer.address, mintAmount)).wait();
  console.log("Minted 100,000 ALPHA and 100,000 BETA to deployer.");

  const depositA = ethers.parseEther("1000");
  const depositB = ethers.parseEther("1000");

  await (await tokenA.approve(pairAddr, depositA)).wait();
  await (await tokenB.approve(pairAddr, depositB)).wait();
  await (await amm.deposit(depositA, depositB)).wait();
  console.log(`Seeded initial liquidity: ${ethers.formatEther(depositA)} ALPHA / ${ethers.formatEther(depositB)} BETA`);

  // ---------------------------------------------------------------------
  // 5. Execute a few small swaps, so there's real Swap event history
  //    for the price-distribution chart to display right away.
  // ---------------------------------------------------------------------
  const swapAmounts = [
    ethers.parseEther("10"),
    ethers.parseEther("25"),
    ethers.parseEther("5"),
  ];

  for (const amountIn of swapAmounts) {
    await (await tokenA.approve(pairAddr, amountIn)).wait();
    const tx = await amm.swap(tokenAAddr, amountIn, 0n);
    await tx.wait();
    console.log(`Swapped ${ethers.formatEther(amountIn)} ALPHA -> BETA`);
  }

  // ---------------------------------------------------------------------
  // Summary — save these addresses, the frontend needs them
  // ---------------------------------------------------------------------
  console.log("\n===== DEPLOYMENT SUMMARY =====");
  console.log("Network:        ", hre.network.name);
  console.log("Factory:        ", await factory.getAddress());
  console.log("Alpha Token:    ", tokenAAddr);
  console.log("Beta Token:     ", tokenBAddr);
  console.log("SimpleAMM pair: ", pairAddr);
  console.log("===============================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});