// Blockchain boundary for NFT passports and trade settlement.
//
// Only a mock exists today: it returns a random transaction hash immediately. To go on-chain,
// implement ChainService against a real network (e.g. viem + an ERC-721 contract on a testnet),
// keep the signing key in a Worker secret (`wrangler secret put CHAIN_PRIVATE_KEY`), and return
// it from getChainService() when that secret is configured.

export interface ChainService {
  /** Mints the NFT passport for a listing; returns the transaction hash. */
  mintListing(listing: { id: string; nftTokenId: string; nftType: string }): Promise<string>;
  /** Transfers the NFT to the buyer when a trade completes; returns the transaction hash. */
  transferForTrade(trade: { id: string; nftTokenId: string; buyer: string }): Promise<string>;
}

const randomTxHash = () => `0x${[...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;

export const mockChain: ChainService = {
  mintListing: async () => randomTxHash(),
  transferForTrade: async () => randomTxHash(),
};

export function getChainService(_env: Env): ChainService {
  return mockChain;
}
