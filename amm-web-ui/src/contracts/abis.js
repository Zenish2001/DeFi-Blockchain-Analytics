export const FACTORY_ABI = [
  "function allPairs(uint256) view returns (address)",
  "function allPairsLength() view returns (uint256)",
  "function getPair(address, address) view returns (address)",
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint256 index)",
];

export const AMM_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function reserveA() view returns (uint256)",
  "function reserveB() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function deposit(uint256 amountA, uint256 amountB) returns (uint256 liquidity)",
  "function redeem(uint256 liquidity) returns (uint256 amountA, uint256 amountB)",
  "function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut) returns (uint256 amountOut)",
  "event Swap(address indexed trader, address indexed tokenIn, uint256 amountIn, uint256 amountOut, uint256 reserveA, uint256 reserveB)",
  "event Deposit(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidity)",
  "event Redeem(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidity)",
];

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// The two demo tokens are MockERC20s with an open mint, so anyone can get some.
export const MOCK_TOKEN_ABI = [...ERC20_ABI, "function mint(address to, uint256 amount)"];
