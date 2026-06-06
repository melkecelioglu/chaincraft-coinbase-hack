// Auth types — SIWE wallet auth
export interface VerifyRequest {
  message: string;
  signature: string;
}

export interface VerifyResponse {
  token: string;
  walletAddress: string;
}

export interface NonceResponse {
  nonce: string;
}

export interface UserProfile {
  walletAddress: string;
  name?: string;
  username?: string;
}

export interface BalanceResponse {
  balance: string;
}

// Project types
export interface Project {
  _id: string;
  name: string;
  user: string;
  createdAt: string;
  updatedAt: string;
}

// Token types
export enum TokenType {
  ERC20 = 'erc20',
  CUSTOM_CONTRACT = 'custom-contract',
}

export interface Token {
  _id: string;
  type: TokenType;
  data: string; // JSON string — parse before displaying
  user: string;
  project?: string;
  createdAt: string;
  updatedAt: string;
}

// Chat types
export interface ChatRequest {
  message: string;
  projectId?: string;
  previousResponseId?: string;
}

export interface Deployment {
  contractAddress: string;
  tokenId: string;
  type: string;
  name?: string;
  symbol?: string;
  totalSupply?: number;
}

export interface PendingDeploy {
  contractName: string;
  constructorArgs: Record<string, { type: string }>;
  abi?: any[];
  bytecode?: string;
  sources?: Record<string, { content: string }>;
}

export interface ChatResponse {
  message: string;
  responseId: string;
  deployments: Deployment[];
  pendingDeploys: PendingDeploy[];
}

// Marketplace types
export interface ContractTemplate {
  _id: string;
  name: string;
  description: string;
  tags: string[];
  type: TokenType;
  template?: string;
  sources: Record<string, { content: string }>;
  contractName: string;
  constructorArgs: Record<string, { type: string; description: string }>;
  originalDeployment: {
    contractAddress: string;
    chain: string;
    deployedAt: string;
  };
  creator: {
    _id: string;
    username: string;
    walletAddress: string;
  } | null;
  deployCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceListResponse {
  items: ContractTemplate[];
  total: number;
  page: number;
  limit: number;
}

export interface MarketplaceSearchResult extends ContractTemplate {
  score: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface RedeployRequest {
  constructorArgs: Record<string, string>;
  projectId?: string;
}

export interface RedeployResponse {
  contractAddress: string;
  tokenId: string;
  templateId: string;
}

// Local chat conversation types (localStorage)
export interface LocalMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  deployments?: Deployment[];
  pendingDeploys?: PendingDeploy[];
  isError?: boolean;
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: LocalMessage[];
  responseId: string | null;
  projectId: string | null;
  createdAt: string;
}
