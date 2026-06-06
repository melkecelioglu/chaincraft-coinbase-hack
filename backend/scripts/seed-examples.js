"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const ethers_1 = require("ethers");
dotenv.config();
const DB_URI = process.env.DB_CONNECTION_STRING ||
    'mongodb://localhost:27017/openai-func?directConnection=true';
const UserSchema = new mongoose.Schema({
    name: String,
    username: { type: String, unique: true },
    email: { type: String, unique: true },
    password: String,
    walletAddress: String,
    walletMnemonic: String,
}, { timestamps: true, collection: 'smartusers' });
const TokenSchema = new mongoose.Schema({
    type: { type: String, enum: ['erc20', 'custom-contract'] },
    data: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'SmartUser' },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: false },
}, { timestamps: true, collection: 'tokens' });
const TemplateSchema = new mongoose.Schema({
    name: String,
    description: String,
    tags: [String],
    type: { type: String, enum: ['erc20', 'custom-contract'] },
    template: String,
    sources: mongoose.Schema.Types.Mixed,
    contractName: String,
    constructorArgs: mongoose.Schema.Types.Mixed,
    originalDeployment: {
        contractAddress: String,
        chain: String,
        deployedAt: String,
    },
    embedding: [Number],
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'SmartUser' },
    deployCount: { type: Number, default: 0 },
}, { timestamps: true, collection: 'contracttemplates' });
const User = mongoose.model('SmartUser', UserSchema);
const Token = mongoose.model('Token', TokenSchema);
const Template = mongoose.model('ContractTemplate', TemplateSchema);
const fakeEmbedding = new Array(1536).fill(0);
async function seed() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(DB_URI);
    console.log('Connected.');
    let seedUser = await User.findOne({ email: 'seed@chaincraft.dev' });
    if (!seedUser) {
        const wallet = ethers_1.ethers.Wallet.createRandom();
        seedUser = await User.create({
            name: 'Seed User',
            username: 'seeduser',
            email: 'seed@chaincraft.dev',
            password: await bcrypt.hash('password123', 10),
            walletAddress: wallet.address,
            walletMnemonic: wallet.mnemonic?.phrase,
        });
        console.log(`Created seed user: ${seedUser.email} (${seedUser.walletAddress})`);
    }
    else {
        console.log(`Seed user already exists: ${seedUser.email}`);
    }
    const userId = seedUser._id;
    const tokenData = [
        {
            type: 'erc20',
            data: JSON.stringify({
                contractAddress: '0x1111111111111111111111111111111111111111',
                name: 'ChainCraft Token',
                symbol: 'CCT',
                totalSupply: 1000000,
                deployedAt: '2026-02-20T10:00:00Z',
            }),
        },
        {
            type: 'erc20',
            data: JSON.stringify({
                contractAddress: '0x2222222222222222222222222222222222222222',
                name: 'DeFi Yield Token',
                symbol: 'DYT',
                totalSupply: 5000000,
                deployedAt: '2026-02-21T14:30:00Z',
            }),
        },
        {
            type: 'erc20',
            data: JSON.stringify({
                contractAddress: '0x3333333333333333333333333333333333333333',
                name: 'Governance Power',
                symbol: 'GOV',
                totalSupply: 10000000,
                deployedAt: '2026-02-22T09:15:00Z',
            }),
        },
    ];
    for (const t of tokenData) {
        const exists = await Token.findOne({ data: t.data, user: userId });
        if (!exists) {
            await Token.create({ ...t, user: userId });
            console.log(`Created token: ${JSON.parse(t.data).name}`);
        }
        else {
            console.log(`Token already exists: ${JSON.parse(t.data).name}`);
        }
    }
    const templates = [
        {
            name: 'SimpleToken',
            description: 'A standard ERC20 token with configurable name, symbol, and initial supply. Ideal for launching new tokens on Base Sepolia.',
            tags: ['erc20', 'token', 'defi', 'standard'],
            type: 'erc20',
            template: 'erc20',
            sources: {
                'SimpleToken.sol': {
                    content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SimpleToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint256 initialSupply)
        ERC20(name_, symbol_)
    {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }
}`,
                },
            },
            contractName: 'SimpleToken',
            constructorArgs: {
                name_: { type: 'string', description: 'Token name (e.g. "My Token")' },
                symbol_: { type: 'string', description: 'Token symbol (e.g. "MTK")' },
                initialSupply: {
                    type: 'uint256',
                    description: 'Initial supply (before decimals, e.g. 1000000)',
                },
            },
            originalDeployment: {
                contractAddress: '0xaaaa111111111111111111111111111111111111',
                chain: 'base-sepolia',
                deployedAt: '2026-02-18T10:00:00Z',
            },
            deployCount: 12,
        },
        {
            name: 'StakingPool',
            description: 'A staking contract where users deposit ERC20 tokens and earn rewards over time. Supports configurable reward rate and lock period.',
            tags: ['staking', 'defi', 'rewards', 'pool'],
            type: 'custom-contract',
            sources: {
                'StakingPool.sol': {
                    content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract StakingPool {
    using SafeERC20 for IERC20;

    IERC20 public stakingToken;
    uint256 public rewardRate; // rewards per second per token staked
    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public lastStakeTime;

    constructor(address _stakingToken, uint256 _rewardRate) {
        stakingToken = IERC20(_stakingToken);
        rewardRate = _rewardRate;
    }

    function stake(uint256 amount) external {
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        stakedBalance[msg.sender] += amount;
        lastStakeTime[msg.sender] = block.timestamp;
    }

    function withdraw(uint256 amount) external {
        require(stakedBalance[msg.sender] >= amount, "Insufficient staked balance");
        stakedBalance[msg.sender] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
    }
}`,
                },
            },
            contractName: 'StakingPool',
            constructorArgs: {
                _stakingToken: {
                    type: 'address',
                    description: 'Address of the ERC20 token to stake',
                },
                _rewardRate: {
                    type: 'uint256',
                    description: 'Reward rate per second per token (in wei)',
                },
            },
            originalDeployment: {
                contractAddress: '0xbbbb222222222222222222222222222222222222',
                chain: 'base-sepolia',
                deployedAt: '2026-02-19T15:30:00Z',
            },
            deployCount: 7,
        },
        {
            name: 'SimpleDAO',
            description: 'A governance contract with proposal creation, voting with token-weighted ballots, and execution of approved proposals. Minimal DAO for on-chain decision making.',
            tags: ['governance', 'dao', 'voting', 'proposals'],
            type: 'custom-contract',
            sources: {
                'SimpleDAO.sol': {
                    content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SimpleDAO {
    IERC20 public governanceToken;
    uint256 public proposalCount;
    uint256 public votingPeriod;

    struct Proposal {
        string description;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 deadline;
        bool executed;
        mapping(address => bool) hasVoted;
    }

    mapping(uint256 => Proposal) public proposals;

    constructor(address _governanceToken, uint256 _votingPeriod) {
        governanceToken = IERC20(_governanceToken);
        votingPeriod = _votingPeriod;
    }

    function createProposal(string calldata description) external returns (uint256) {
        uint256 id = proposalCount++;
        Proposal storage p = proposals[id];
        p.description = description;
        p.deadline = block.timestamp + votingPeriod;
        return id;
    }

    function vote(uint256 proposalId, bool support) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp < p.deadline, "Voting ended");
        require(!p.hasVoted[msg.sender], "Already voted");
        uint256 weight = governanceToken.balanceOf(msg.sender);
        require(weight > 0, "No voting power");
        p.hasVoted[msg.sender] = true;
        if (support) p.forVotes += weight;
        else p.againstVotes += weight;
    }
}`,
                },
            },
            contractName: 'SimpleDAO',
            constructorArgs: {
                _governanceToken: {
                    type: 'address',
                    description: 'Address of the ERC20 governance token',
                },
                _votingPeriod: {
                    type: 'uint256',
                    description: 'Voting period in seconds (e.g. 86400 for 1 day)',
                },
            },
            originalDeployment: {
                contractAddress: '0xcccc333333333333333333333333333333333333',
                chain: 'base-sepolia',
                deployedAt: '2026-02-20T11:00:00Z',
            },
            deployCount: 5,
        },
    ];
    for (const tpl of templates) {
        const exists = await Template.findOne({ name: tpl.name });
        if (!exists) {
            await Template.create({
                ...tpl,
                embedding: fakeEmbedding,
                creator: userId,
            });
            console.log(`Created template: ${tpl.name}`);
        }
        else {
            console.log(`Template already exists: ${tpl.name}`);
        }
    }
    console.log('\nSeed complete!');
    console.log(`  - Seed user: seed@chaincraft.dev / password123`);
    console.log(`  - 3 tokens created`);
    console.log(`  - 3 marketplace templates created`);
    await mongoose.disconnect();
}
seed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
//# sourceMappingURL=seed-examples.js.map