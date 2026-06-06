# Marketplace Contract Ideas — Design Document

**Date**: 2026-02-28
**Goal**: Add 15 creative smart contract templates to diversify the ChainCraft marketplace across 5 distinct domains.

## Current State

The marketplace has 3 templates:
- SimpleToken (ERC20) — token, defi
- StakingPool — staking, defi
- SimpleDAO — governance, voting

## Design: 5 Domains x 3 Contracts

### Domain 1: DeFi

#### 1. TokenSwap
Fixed-rate swap between two ERC20 tokens. Simple AMM experience without LP tokens — users deposit liquidity, others swap at the set rate with a configurable fee.

| Arg | Type | Description |
|-----|------|-------------|
| `tokenA` | address | First token address |
| `tokenB` | address | Second token address |
| `feePercent` | uint256 | Swap fee in basis points (e.g. 30 = 0.3%) |

**Tags**: `defi`, `swap`, `exchange`, `amm`

#### 2. FlashLoanPool
Borrow-and-repay-in-one-block flash loan pool. Lenders deposit tokens to earn fees, borrowers take uncollateralized loans that must be repaid within the same transaction.

| Arg | Type | Description |
|-----|------|-------------|
| `loanToken` | address | ERC20 token for the loan pool |
| `feePercent` | uint256 | Flash loan fee in basis points |

**Tags**: `defi`, `flash-loan`, `lending`, `advanced`

#### 3. YieldVault
Users deposit tokens, vault owner executes strategies, profits are shared proportionally. Simplified ERC4626-style vault with deposit/withdraw and share tracking.

| Arg | Type | Description |
|-----|------|-------------|
| `asset` | address | Underlying ERC20 token |
| `vaultName` | string | Vault share token name |
| `vaultSymbol` | string | Vault share token symbol |

**Tags**: `defi`, `vault`, `yield`, `erc4626`

---

### Domain 2: NFT & Digital Assets

#### 4. NFTCollection
ERC721 collection with configurable max supply, mint price, and base URI. Owner can update metadata URI and withdraw mint proceeds.

| Arg | Type | Description |
|-----|------|-------------|
| `name` | string | Collection name |
| `symbol` | string | Collection symbol |
| `maxSupply` | uint256 | Maximum number of NFTs |
| `mintPrice` | uint256 | Price per mint in wei |

**Tags**: `nft`, `erc721`, `collection`, `mint`

#### 5. RoyaltyMarketplace
NFT marketplace where sellers list and buyers purchase. Each sale pays a royalty to the original creator (ERC2981) and a platform fee to the contract owner.

| Arg | Type | Description |
|-----|------|-------------|
| `platformFee` | uint256 | Platform fee in basis points |
| `royaltyPercent` | uint256 | Creator royalty in basis points |

**Tags**: `nft`, `marketplace`, `royalty`, `erc2981`

#### 6. SoulboundToken
Non-transferable token (SBT) for certificates, achievement badges, and identity verification. Only the designated issuer can mint; tokens cannot be transferred after minting.

| Arg | Type | Description |
|-----|------|-------------|
| `name` | string | Token name |
| `symbol` | string | Token symbol |
| `issuer` | address | Address authorized to mint SBTs |

**Tags**: `nft`, `soulbound`, `identity`, `certificate`

---

### Domain 3: Social & Gaming

#### 7. TipJar
Donation contract for content creators. Supporters send ETH or ERC20 tips; the owner can withdraw accumulated funds. Tracks total tips per sender.

| Arg | Type | Description |
|-----|------|-------------|
| `owner` | address | Tip recipient / jar owner |
| `minTip` | uint256 | Minimum tip amount in wei |

**Tags**: `social`, `tips`, `donations`, `creator`

#### 8. OnChainLottery
Participants buy tickets during an open period. When the period ends, a winner is selected and the prize pool is transferred. Uses block-based randomness.

| Arg | Type | Description |
|-----|------|-------------|
| `ticketPrice` | uint256 | Price per ticket in wei |
| `duration` | uint256 | Lottery duration in seconds |

**Tags**: `game`, `lottery`, `random`, `prize`

#### 9. AchievementSystem
On-chain badge/achievement system for games or platforms. Admin defines achievements, grants them to users. Each achievement is a non-transferable record.

| Arg | Type | Description |
|-----|------|-------------|
| `admin` | address | Admin who can define and grant achievements |
| `projectName` | string | Name of the project/game |

**Tags**: `game`, `achievements`, `badges`, `gamification`

---

### Domain 4: Security & Governance

#### 10. TimelockController
Delayed execution controller for governance. Proposers queue transactions, which can only execute after a minimum delay. Executors trigger execution after the delay.

| Arg | Type | Description |
|-----|------|-------------|
| `minDelay` | uint256 | Minimum delay in seconds before execution |
| `proposers` | address[] | Addresses that can propose transactions |
| `executors` | address[] | Addresses that can execute after delay |

**Tags**: `governance`, `timelock`, `security`, `delay`

#### 11. EscrowService
Secure payment between buyer and seller with arbiter dispute resolution. Buyer deposits, seller delivers, arbiter resolves disputes with release or refund.

| Arg | Type | Description |
|-----|------|-------------|
| `arbiter` | address | Trusted arbiter for disputes |
| `feePercent` | uint256 | Arbiter/platform fee in basis points |

**Tags**: `escrow`, `payment`, `security`, `trade`

#### 12. AccessControlVault
Role-based access control vault. ADMIN assigns DEPOSITOR and WITHDRAWER roles. Funds can only be deposited/withdrawn by authorized addresses. Suitable for organizational treasury.

| Arg | Type | Description |
|-----|------|-------------|
| `admin` | address | Initial admin who manages roles |

**Tags**: `security`, `access-control`, `vault`, `roles`

---

### Domain 5: Infrastructure & Utility

#### 13. SubscriptionManager
Monthly subscription system. Users pay ERC20 tokens for time-based access. Owner can check if a subscription is active, set price, and withdraw collected payments.

| Arg | Type | Description |
|-----|------|-------------|
| `paymentToken` | address | ERC20 token for payments |
| `monthlyPrice` | uint256 | Monthly subscription price |
| `owner` | address | Subscription service owner |

**Tags**: `subscription`, `saas`, `payment`, `recurring`

#### 14. MerkleAirdrop
Gas-efficient token distribution using Merkle tree proofs. Eligible addresses claim tokens by submitting their Merkle proof on-chain. Prevents double-claiming.

| Arg | Type | Description |
|-----|------|-------------|
| `token` | address | ERC20 token to distribute |
| `merkleRoot` | bytes32 | Root of the Merkle tree |

**Tags**: `airdrop`, `merkle`, `distribution`, `token`

#### 15. TokenVesting
Token vesting for team members or investors. Linear unlock after a cliff period. Optional revocability by the grantor. Beneficiary claims unlocked tokens over time.

| Arg | Type | Description |
|-----|------|-------------|
| `token` | address | ERC20 token to vest |
| `beneficiary` | address | Address receiving vested tokens |
| `cliff` | uint256 | Cliff period in seconds |
| `duration` | uint256 | Total vesting duration in seconds |

**Tags**: `vesting`, `token`, `lock`, `team`

---

## Tag Summary (all unique tags across 15 contracts)

`defi`, `swap`, `exchange`, `amm`, `flash-loan`, `lending`, `advanced`, `vault`, `yield`, `erc4626`, `nft`, `erc721`, `collection`, `mint`, `marketplace`, `royalty`, `erc2981`, `soulbound`, `identity`, `certificate`, `social`, `tips`, `donations`, `creator`, `game`, `lottery`, `random`, `prize`, `achievements`, `badges`, `gamification`, `governance`, `timelock`, `security`, `delay`, `escrow`, `payment`, `trade`, `access-control`, `roles`, `subscription`, `saas`, `recurring`, `airdrop`, `merkle`, `distribution`, `token`, `vesting`, `lock`, `team`

## Implementation Notes

- Each contract should compile with solc via the existing `SolcService`
- OpenZeppelin imports are supported (resolved by `SolcService.resolveAllSources`)
- Contracts are generated via AI (`OpenAiService.generateContract`) and compiled with retry
- After successful compile, they get saved as `ContractTemplate` with AI-enriched metadata
- Vector embeddings are auto-generated for semantic search
- Constructor args with `address[]` and `bytes32` types are already supported after recent fixes
