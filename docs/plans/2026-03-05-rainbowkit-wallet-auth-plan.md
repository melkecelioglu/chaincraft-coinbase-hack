# RainbowKit Wallet Auth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace email/password auth with RainbowKit wallet connect + SIWE (EIP-4361) sign-in on Base Sepolia, move contract deploys to frontend-side wallet signing.

**Architecture:** Backend becomes a SIWE verifier (nonce generation + signature verification) that issues JWTs keyed by walletAddress. Frontend uses RainbowKit + wagmi for wallet connection and SIWE signing. Deploy transactions are signed by the user's wallet on the frontend; backend only compiles and registers results.

**Tech Stack:** RainbowKit, wagmi, viem, @tanstack/react-query (frontend); siwe npm package (backend); EIP-4361 SIWE standard; Base Sepolia (chainId 84532)

---

## Task 1: Install Backend Dependencies

**Files:**
- Modify: `backend/package.json`

**Step 1: Install siwe package**

Run: `cd backend && npm install siwe`

**Step 2: Remove bcryptjs**

Run: `cd backend && npm uninstall bcryptjs`

**Step 3: Verify installation**

Run: `cd backend && node -e "require('siwe'); console.log('siwe OK')"`
Expected: `siwe OK`

**Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "feat: add siwe, remove bcryptjs from backend deps"
```

---

## Task 2: Update SmartUser Schema

**Files:**
- Modify: `backend/src/auth/schemas/user.schema.ts`
- Modify: `backend/src/auth/interfaces/user-profile.interface.ts`
- Modify: `backend/src/auth/interfaces/jwt-payload.interface.ts`

**Step 1: Rewrite user schema**

Replace `backend/src/auth/schemas/user.schema.ts` with:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class SmartUser extends Document {
  @Prop({ required: true, unique: true })
  walletAddress: string;

  @Prop()
  name: string;

  @Prop()
  username: string;
}

export const SmartUserSchema = SchemaFactory.createForClass(SmartUser);
```

**Step 2: Update UserProfile interface**

Replace `backend/src/auth/interfaces/user-profile.interface.ts` with:

```typescript
export interface UserProfile {
  walletAddress: string;
  name?: string;
  username?: string;
}
```

**Step 3: Update JWT payload interface**

Replace `backend/src/auth/interfaces/jwt-payload.interface.ts` with:

```typescript
export interface JwtPayload {
  id: string;
  walletAddress: string;
}
```

**Step 4: Commit**

```bash
git add backend/src/auth/schemas/user.schema.ts backend/src/auth/interfaces/
git commit -m "feat: simplify SmartUser schema to wallet-only auth"
```

---

## Task 3: Create SIWE Verify DTO

**Files:**
- Create: `backend/src/auth/dto/verify.dto.ts`
- Delete: `backend/src/auth/dto/login.dto.ts`
- Delete: `backend/src/auth/dto/register.dto.ts`

**Step 1: Create verify DTO**

Create `backend/src/auth/dto/verify.dto.ts`:

```typescript
import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyDto {
  @ApiProperty({
    description: 'SIWE message string',
    example: 'localhost wants you to sign in with your Ethereum account...',
  })
  @IsNotEmpty()
  @IsString()
  readonly message: string;

  @ApiProperty({
    description: 'Wallet signature of the SIWE message',
    example: '0x...',
  })
  @IsNotEmpty()
  @IsString()
  readonly signature: string;
}
```

**Step 2: Delete old DTOs**

Delete `backend/src/auth/dto/login.dto.ts` and `backend/src/auth/dto/register.dto.ts`.

**Step 3: Commit**

```bash
git add backend/src/auth/dto/
git rm backend/src/auth/dto/login.dto.ts backend/src/auth/dto/register.dto.ts
git commit -m "feat: replace login/register DTOs with SIWE verify DTO"
```

---

## Task 4: Rewrite AuthService for SIWE

**Files:**
- Modify: `backend/src/auth/auth.service.ts`

**Step 1: Rewrite AuthService**

Replace `backend/src/auth/auth.service.ts` with:

```typescript
import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SmartUser } from './schemas/user.schema';
import { JwtService } from '@nestjs/jwt';
import { SiweMessage } from 'siwe';
import { ethers } from 'ethers';
import { ConfigService } from '@nestjs/config';
import { UserProfile } from './interfaces/user-profile.interface';

interface NonceEntry {
  nonce: string;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly nonceStore = new Map<string, NonceEntry>();
  private readonly NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectModel(SmartUser.name)
    private userModel: Model<SmartUser>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    // Clean expired nonces every minute
    setInterval(() => this.cleanExpiredNonces(), 60_000);
  }

  generateNonce(): { nonce: string } {
    // Generate random nonce
    const nonce = [...Array(16)]
      .map(() => Math.random().toString(36)[2])
      .join('');

    this.nonceStore.set(nonce, {
      nonce,
      expiresAt: Date.now() + this.NONCE_TTL_MS,
    });

    return { nonce };
  }

  async verify(
    message: string,
    signature: string,
  ): Promise<{ token: string; walletAddress: string }> {
    let siweMessage: SiweMessage;

    try {
      siweMessage = new SiweMessage(message);
      await siweMessage.verify({ signature });
    } catch (error) {
      this.logger.warn(`SIWE verification failed: ${error.message}`);
      throw new UnauthorizedException('Invalid signature');
    }

    // Check nonce
    const nonceEntry = this.nonceStore.get(siweMessage.nonce);
    if (!nonceEntry || nonceEntry.expiresAt < Date.now()) {
      this.nonceStore.delete(siweMessage.nonce);
      throw new UnauthorizedException('Invalid or expired nonce');
    }

    // Invalidate nonce (one-time use)
    this.nonceStore.delete(siweMessage.nonce);

    const walletAddress = ethers.getAddress(siweMessage.address);

    // Find or create user
    let user = await this.userModel.findOne({ walletAddress });
    if (!user) {
      this.logger.log(`Creating new user for wallet: ${walletAddress}`);
      user = await this.userModel.create({ walletAddress });
    }

    const token = this.jwtService.sign({
      id: user._id,
      walletAddress: user.walletAddress,
    });

    return { token, walletAddress };
  }

  async getUserById(userId: string): Promise<UserProfile> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    return {
      walletAddress: user.walletAddress,
      name: user.name,
      username: user.username,
    };
  }

  async getUserByWallet(walletAddress: string): Promise<SmartUser> {
    const normalized = ethers.getAddress(walletAddress);
    const user = await this.userModel.findOne({ walletAddress: normalized });
    if (!user) {
      throw new NotFoundException(`User not found: ${walletAddress}`);
    }
    return user;
  }

  async getWalletBalance(userId: string): Promise<{ balance: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    try {
      const rpcUrl =
        this.configService.get<string>('BASE_SEPOLIA_RPC_URL') ||
        'https://sepolia.base.org';
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const balance = await provider.getBalance(user.walletAddress);
      return { balance: ethers.formatEther(balance) };
    } catch (error) {
      this.logger.warn(
        `Failed to fetch balance for ${user.walletAddress}: ${error.message}`,
      );
      return { balance: '0.0' };
    }
  }

  private cleanExpiredNonces(): void {
    const now = Date.now();
    for (const [key, entry] of this.nonceStore) {
      if (entry.expiresAt < now) {
        this.nonceStore.delete(key);
      }
    }
  }
}
```

**Step 2: Verify build**

Run: `cd backend && npm run build`
Expected: Build succeeds (will have errors from controller/other files still importing old stuff — that's ok, we fix next)

**Step 3: Commit**

```bash
git add backend/src/auth/auth.service.ts
git commit -m "feat: rewrite AuthService for SIWE nonce/verify flow"
```

---

## Task 5: Rewrite AuthController

**Files:**
- Modify: `backend/src/auth/auth.controller.ts`

**Step 1: Rewrite controller**

Replace `backend/src/auth/auth.controller.ts` with:

```typescript
import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { VerifyDto } from './dto/verify.dto';
import { Public } from './decorators/public.decorator';
import { GetUser } from './decorators/get-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Get('nonce')
  @ApiOperation({ summary: 'Generate SIWE nonce' })
  @ApiResponse({
    status: 200,
    description: 'Nonce generated',
    schema: {
      type: 'object',
      properties: { nonce: { type: 'string' } },
    },
  })
  getNonce() {
    return this.authService.generateNonce();
  }

  @Public()
  @Post('verify')
  @ApiOperation({ summary: 'Verify SIWE signature and get JWT' })
  @ApiResponse({
    status: 200,
    description: 'Signature verified, JWT returned',
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        walletAddress: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid signature or nonce' })
  async verify(@Body() verifyDto: VerifyDto) {
    return this.authService.verify(verifyDto.message, verifyDto.signature);
  }

  @Get('user')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile' })
  async getProfile(@GetUser('id') userId: string) {
    return this.authService.getUserById(userId);
  }

  @Get('balance')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get wallet ETH balance on Base Sepolia' })
  @ApiResponse({ status: 200, description: 'Wallet balance in ETH' })
  async getBalance(@GetUser('id') userId: string) {
    return this.authService.getWalletBalance(userId);
  }
}
```

**Step 2: Update JWT strategy**

Replace `backend/src/auth/strategies/jwt.strategy.ts` with:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { SmartUser } from '../schemas/user.schema';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectModel(SmartUser.name)
    private userModel: Model<SmartUser>,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<SmartUser> {
    const { id } = payload;
    const user = await this.userModel.findById(id);

    if (!user) {
      throw new UnauthorizedException('Connect wallet to access this endpoint.');
    }

    return user;
  }
}
```

**Step 3: Update auth module — add ConfigModule import**

Replace `backend/src/auth/auth.module.ts` with:

```typescript
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { SmartUser, SmartUserSchema } from './schemas/user.schema';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthService } from './auth.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '24h',
        },
      }),
    }),
    MongooseModule.forFeature([
      { name: SmartUser.name, schema: SmartUserSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtStrategy, PassportModule, AuthService],
})
export class AuthModule {}
```

**Step 4: Build and verify**

Run: `cd backend && npm run build`
Expected: Build succeeds. There may be warnings from other modules that import AuthService and use old methods — those are fixed in Task 8.

**Step 5: Commit**

```bash
git add backend/src/auth/
git commit -m "feat: rewrite auth controller/strategy/module for SIWE wallet auth"
```

---

## Task 6: Add Compile Endpoint to Contracts Controller

**Files:**
- Modify: `backend/src/contracts/contracts.controller.ts`

**Step 1: Add compile endpoint**

Add this new endpoint to the existing `ContractsController` class, before the existing `deploy` method. Also add the DTO.

Create `backend/src/contracts/dto/compile.dto.ts`:

```typescript
import { IsNotEmpty, IsObject, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompileDto {
  @ApiProperty({ description: 'Solidity source files map' })
  @IsNotEmpty()
  @IsObject()
  readonly sources: Record<string, { content: string }>;

  @ApiProperty({ description: 'Name of the contract to compile' })
  @IsNotEmpty()
  @IsString()
  readonly contractName: string;
}
```

Add to the controller a new `compile` method:

```typescript
@Post('compile')
@ApiBearerAuth()
@ApiOperation({ summary: 'Compile Solidity sources and return ABI + bytecode' })
@ApiResponse({ status: 200, description: 'Compilation result' })
async compile(@Body() compileDto: CompileDto) {
  const result = this.solcService.compile(
    compileDto.sources,
    compileDto.contractName,
  );
  return {
    abi: result.abi,
    bytecode: result.bytecode,
    compilerVersion: result.compilerVersion,
  };
}
```

Make sure `SolcService` is injected in the controller constructor. Check the existing controller — it likely already has `BlockchainService` injected which uses `SolcService` internally. If `SolcService` is not directly injected, add it:

```typescript
constructor(
  // ... existing injections ...
  private readonly solcService: SolcService,
) {}
```

Import `SolcService` from `'../blockchain/solc.service'` and `CompileDto`.

**Step 2: Add register-deployment endpoint**

Create `backend/src/contracts/dto/register-deployment.dto.ts`:

```typescript
import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDeploymentDto {
  @ApiProperty({ description: 'Transaction hash of the deployment' })
  @IsNotEmpty()
  @IsString()
  readonly txHash: string;

  @ApiProperty({ description: 'Deployed contract address' })
  @IsNotEmpty()
  @IsString()
  readonly contractAddress: string;

  @ApiProperty({ description: 'Contract name' })
  @IsNotEmpty()
  @IsString()
  readonly contractName: string;

  @ApiPropertyOptional({ description: 'Solidity source files' })
  @IsOptional()
  @IsObject()
  readonly sources?: Record<string, { content: string }>;

  @ApiPropertyOptional({ description: 'Contract ABI' })
  @IsOptional()
  readonly abi?: any[];

  @ApiPropertyOptional({ description: 'Constructor arguments used' })
  @IsOptional()
  @IsObject()
  readonly constructorArgs?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Project ID to associate with' })
  @IsOptional()
  @IsString()
  readonly projectId?: string;
}
```

Add to the controller:

```typescript
@Post('register')
@ApiBearerAuth()
@ApiOperation({ summary: 'Register a frontend-deployed contract in the database' })
@ApiResponse({ status: 201, description: 'Deployment registered' })
async registerDeployment(
  @Body() dto: RegisterDeploymentDto,
  @GetUser('id') userId: string,
) {
  const token = await this.tokensService.create({
    type: 'custom-contract',
    data: JSON.stringify({
      contractName: dto.contractName,
      contractAddress: dto.contractAddress,
      txHash: dto.txHash,
      sources: dto.sources,
      abi: dto.abi,
      constructorArgs: dto.constructorArgs,
    }),
    user: userId,
    project: dto.projectId,
  });

  return {
    tokenId: token._id,
    contractAddress: dto.contractAddress,
    txHash: dto.txHash,
  };
}
```

Make sure `TokensService` is injected. Check current constructor — it likely already has it.

**Step 3: Build**

Run: `cd backend && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add backend/src/contracts/
git commit -m "feat: add compile and register-deployment endpoints for frontend deploys"
```

---

## Task 7: Update Cross-Module References (ToolDispatchService, MarketplaceService)

**Files:**
- Modify: `backend/src/openai/tool-dispatch.service.ts`
- Modify: `backend/src/marketplace/marketplace.service.ts`
- Modify: `backend/src/marketplace/marketplace.controller.ts`

**Context:** These services currently call `authService.getUserByEmail()` or `authService.getUserById()` to get the user's `walletMnemonic` for server-side deploys. With wallet-based auth, `walletMnemonic` is gone. However, the deploy flow is moving to frontend, so these services still compile contracts but no longer deploy them server-side from the user's wallet.

**Step 1: Update ToolDispatchService**

In `tool-dispatch.service.ts`, find all places that call `this.authService.getUserById()` or `this.authService.getUserByEmail()` to get `walletMnemonic`. The deploy tool calls (deployERC20, deployCustomContract) currently:
1. Get user wallet info
2. Call blockchainService.deployToken/deployCustomContract with the mnemonic
3. Save result to DB

Change the deploy tool call handlers to return compile results as `pendingDeploys` instead of auto-deploying. Specifically, when a tool call is for `deployERC20` or `deployCustomContract`:

Instead of calling `blockchainService.deployToken()` or `blockchainService.deployCustomContract()`, compile the contract and return the compile result in the response as a `pendingDeploy` entry with `{ contractName, abi, bytecode, constructorArgs }`.

This is a significant refactor — the key changes:
- Remove `walletMnemonic` usage from deploy tool handlers
- For `deployERC20`: compile the ERC20 template and return `{ abi, bytecode, constructorArgs }` as a pending deploy
- For `deployCustomContract`: compile the sources and return `{ abi, bytecode, constructorArgs }` as a pending deploy
- Keep `generateContract` tool handler as-is (it only generates code, doesn't deploy)

**Important:** The `getUserById` call for getting walletAddress is still needed (for non-deploy operations). Only the `walletMnemonic` access needs to be removed.

Also update the `deployCached` method similarly — instead of deploying server-side, return compile result for frontend deployment.

**Step 2: Update MarketplaceService redeploy**

In `marketplace.service.ts`, the `redeploy()` method currently deploys server-side. Change it to compile and return `{ abi, bytecode, constructorArgs }` for frontend deployment.

**Step 3: Update MarketplaceController**

In `marketplace.controller.ts`, the `POST /:id/deploy` endpoint should return compile result instead of deployment result. Update the response type.

**Step 4: Build**

Run: `cd backend && npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add backend/src/openai/ backend/src/marketplace/ backend/src/contracts/
git commit -m "feat: refactor deploy flow to return compile results for frontend signing"
```

---

## Task 8: Install Frontend Dependencies

**Files:**
- Modify: `frontend/package.json`

**Step 1: Install RainbowKit, wagmi, viem, react-query**

Run: `cd frontend && npm install @rainbow-me/rainbowkit wagmi viem@2.x @tanstack/react-query`

**Step 2: Verify installation**

Run: `cd frontend && node -e "require('@rainbow-me/rainbowkit'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat: add rainbowkit, wagmi, viem, react-query to frontend"
```

---

## Task 9: Create wagmi Config and Web3 Providers

**Files:**
- Create: `frontend/src/lib/wagmi.ts`
- Modify: `frontend/src/components/providers.tsx`

**Step 1: Create wagmi config**

Create `frontend/src/lib/wagmi.ts`:

```typescript
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { baseSepolia } from 'wagmi/chains';

export const wagmiConfig = getDefaultConfig({
  appName: 'ChainCraft',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'chaincraft-dev',
  chains: [baseSepolia],
  ssr: true,
});
```

**Step 2: Update Providers component**

Replace `frontend/src/components/providers.tsx` with:

```typescript
'use client';

import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import { wagmiConfig } from '@/lib/wagmi';
import '@rainbow-me/rainbowkit/styles.css';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            theme={{
              lightMode: lightTheme({ accentColor: '#0f172a' }),
              darkMode: darkTheme({ accentColor: '#e2e8f0' }),
            }}
          >
            {children}
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
```

**Step 3: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds (may have warnings about unused imports elsewhere — fine)

**Step 4: Commit**

```bash
git add frontend/src/lib/wagmi.ts frontend/src/components/providers.tsx
git commit -m "feat: add wagmi config and web3 providers with RainbowKit"
```

---

## Task 10: Create SIWE Auth Hook

**Files:**
- Create: `frontend/src/hooks/use-siwe-auth.ts`
- Modify: `frontend/src/stores/auth-store.ts`
- Modify: `frontend/src/lib/types.ts`

**Step 1: Update types**

In `frontend/src/lib/types.ts`, replace the auth-related types at the top:

```typescript
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
```

Remove the old types: `LoginRequest`, `RegisterRequest`, `LoginResponse`, `RegisterResponse`.

**Step 2: Rewrite auth store**

Replace `frontend/src/stores/auth-store.ts` with:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';
import type { UserProfile } from '@/lib/types';

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  setToken: (token: string) => void;
  logout: () => void;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,

      setToken: (token: string) => {
        set({ token });
      },

      logout: () => {
        set({ token: null, user: null });
      },

      fetchUser: async () => {
        const res = await api.get<UserProfile>('/auth/user');
        set({ user: res.data });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    },
  ),
);
```

**Step 3: Create SIWE auth hook**

Create `frontend/src/hooks/use-siwe-auth.ts`:

```typescript
'use client';

import { useEffect, useCallback } from 'react';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { SiweMessage } from 'siwe';
import { useAuthStore } from '@/stores/auth-store';
import api from '@/lib/api';
import type { NonceResponse, VerifyResponse } from '@/lib/types';

export function useSiweAuth() {
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const token = useAuthStore((s) => s.token);
  const setToken = useAuthStore((s) => s.setToken);
  const logout = useAuthStore((s) => s.logout);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  const signIn = useCallback(async () => {
    if (!address || !chainId) return;

    try {
      // 1. Get nonce from backend
      const { data: nonceData } = await api.get<NonceResponse>('/auth/nonce');

      // 2. Create SIWE message
      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to ChainCraft',
        uri: window.location.origin,
        version: '1',
        chainId,
        nonce: nonceData.nonce,
      });

      const messageStr = siweMessage.prepareMessage();

      // 3. Sign with wallet
      const signature = await signMessageAsync({ message: messageStr });

      // 4. Verify with backend
      const { data } = await api.post<VerifyResponse>('/auth/verify', {
        message: messageStr,
        signature,
      });

      // 5. Store JWT
      setToken(data.token);

      // 6. Fetch user profile
      await fetchUser();
    } catch (error) {
      console.error('SIWE sign-in failed:', error);
      disconnect();
      logout();
    }
  }, [address, chainId, signMessageAsync, setToken, fetchUser, disconnect, logout]);

  // Auto sign-in when wallet connects and no token exists
  useEffect(() => {
    if (isConnected && address && !token) {
      signIn();
    }
  }, [isConnected, address, token, signIn]);

  // Clear auth when wallet disconnects
  useEffect(() => {
    if (!isConnected && token) {
      logout();
    }
  }, [isConnected, token, logout]);

  const signOut = useCallback(() => {
    disconnect();
    logout();
  }, [disconnect, logout]);

  return {
    isAuthenticated: !!token && isConnected,
    isConnected,
    address,
    signIn,
    signOut,
  };
}
```

**Step 4: Install siwe on frontend too (for SiweMessage construction)**

Run: `cd frontend && npm install siwe`

**Step 5: Commit**

```bash
git add frontend/src/hooks/use-siwe-auth.ts frontend/src/stores/auth-store.ts frontend/src/lib/types.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: add SIWE auth hook and simplified auth store"
```

---

## Task 11: Update Navbar with ConnectButton

**Files:**
- Modify: `frontend/src/components/layout/navbar.tsx`
- Delete: `frontend/src/components/layout/user-menu.tsx`

**Step 1: Rewrite navbar**

Replace `frontend/src/components/layout/navbar.tsx` with:

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/chat', label: 'Chat' },
  { href: '/marketplace', label: 'Marketplace' },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Link href="/chat" className="mr-6 flex items-center gap-2 font-bold">
        ChainCraft
      </Link>

      <nav className="flex items-center gap-1">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent',
              pathname.startsWith(link.href)
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground',
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <ConnectButton
          accountStatus="address"
          chainStatus="icon"
          showBalance={true}
        />
      </div>
    </header>
  );
}
```

**Step 2: Delete user-menu**

Delete `frontend/src/components/layout/user-menu.tsx`.

**Step 3: Commit**

```bash
git add frontend/src/components/layout/navbar.tsx
git rm frontend/src/components/layout/user-menu.tsx
git commit -m "feat: replace user menu with RainbowKit ConnectButton in navbar"
```

---

## Task 12: Update AuthGuard and Chat Gating

**Files:**
- Modify: `frontend/src/components/layout/auth-guard.tsx`
- Modify: `frontend/src/components/chat/chat-area.tsx`
- Modify: `frontend/src/app/(app)/layout.tsx`

**Step 1: Rewrite AuthGuard**

Replace `frontend/src/components/layout/auth-guard.tsx` with:

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useSiweAuth } from '@/hooks/use-siwe-auth';

function useHasHydrated() {
  return useSyncExternalStore(
    (cb) => {
      const unsub = useAuthStore.persist.onFinishHydration(cb);
      return unsub;
    },
    () => useAuthStore.persist.hasHydrated(),
    () => false,
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const hydrated = useHasHydrated();
  const fetchedRef = useRef(false);
  const token = useAuthStore((s) => s.token);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  // Initialize SIWE auth (auto sign-in on wallet connect)
  useSiweAuth();

  useEffect(() => {
    if (!hydrated) return;
    if (token && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchUser().catch(() => {
        // Token invalid — interceptor will clear
      });
    }
  }, [hydrated, token, fetchUser]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // No redirect — just render children. Chat input will be gated separately.
  return <>{children}</>;
}
```

**Step 2: Update chat area to gate input**

In `frontend/src/components/chat/chat-area.tsx`, update the ChatInput usage to pass wallet-gated disabled state:

Add import at top:
```typescript
import { useAuthStore } from '@/stores/auth-store';
```

Inside the component, add:
```typescript
const token = useAuthStore((s) => s.token);
const isWalletConnected = !!token;
```

Update the ChatInput at the bottom to:
```typescript
<ChatInput
  onSend={handleSend}
  disabled={isLoading || !isWalletConnected}
  placeholder={
    isWalletConnected
      ? 'Describe your smart contract...'
      : 'Connect your wallet to start chatting'
  }
/>
```

Also gate the SuggestionCards in the empty state — wrap them with a condition:
```typescript
{isWalletConnected && (
  <div className="w-full max-w-lg">
    <SuggestionCards onSelect={handleSend} />
  </div>
)}
```

**Step 3: Commit**

```bash
git add frontend/src/components/layout/auth-guard.tsx frontend/src/components/chat/chat-area.tsx
git commit -m "feat: wallet-gated chat input and simplified auth guard"
```

---

## Task 13: Update API Client and Middleware

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/middleware.ts`

**Step 1: Update API client**

Replace `frontend/src/lib/api.ts` with:

```typescript
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('auth-storage');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const token = parsed?.state?.token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch {
        // ignore parse errors
      }
    }
  }
  return config;
});

// Response interceptor: handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isAuthRoute =
      url.includes('/auth/nonce') || url.includes('/auth/verify');
    if (
      error.response?.status === 401 &&
      typeof window !== 'undefined' &&
      !isAuthRoute
    ) {
      localStorage.removeItem('auth-storage');
      // Don't redirect — wallet disconnect will handle state
    }
    return Promise.reject(error);
  },
);

export default api;
```

**Step 2: Update middleware**

Replace `frontend/src/middleware.ts` with:

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(_request: NextRequest) {
  // Auth is handled client-side via RainbowKit wallet connect.
  // No server-side auth check needed.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

**Step 3: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/middleware.ts
git commit -m "feat: update API client for SIWE auth routes, simplify middleware"
```

---

## Task 14: Delete Old Auth Pages and Components

**Files:**
- Delete: `frontend/src/app/(auth)/` (entire directory)
- Delete: `frontend/src/components/auth/login-form.tsx`
- Delete: `frontend/src/components/auth/register-form.tsx`

**Step 1: Delete auth pages**

```bash
rm -rf frontend/src/app/\(auth\)/
```

**Step 2: Delete auth form components**

```bash
rm -f frontend/src/components/auth/login-form.tsx
rm -f frontend/src/components/auth/register-form.tsx
```

Check if `frontend/src/components/auth/` directory has any other files. If empty, remove the directory:

```bash
rmdir frontend/src/components/auth/ 2>/dev/null || true
```

**Step 3: Update root page redirect**

`frontend/src/app/page.tsx` already redirects to `/chat` — no change needed.

**Step 4: Build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no broken imports

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove old email/password auth pages and components"
```

---

## Task 15: Update Frontend Deploy Flow (Chat Deploy Cards)

**Files:**
- Modify: `frontend/src/stores/chat-store.ts`
- Create: `frontend/src/hooks/use-deploy-contract.ts`

**Step 1: Create deploy hook**

Create `frontend/src/hooks/use-deploy-contract.ts`:

```typescript
'use client';

import { useCallback, useState } from 'react';
import { useWalletClient } from 'wagmi';
import api from '@/lib/api';

interface DeployParams {
  abi: any[];
  bytecode: string;
  constructorArgs?: any[];
  contractName: string;
  sources?: Record<string, { content: string }>;
  projectId?: string;
}

interface DeployResult {
  contractAddress: string;
  txHash: string;
  tokenId: string;
}

export function useDeployContract() {
  const { data: walletClient } = useWalletClient();
  const [isDeploying, setIsDeploying] = useState(false);

  const deploy = useCallback(
    async (params: DeployParams): Promise<DeployResult> => {
      if (!walletClient) {
        throw new Error('Wallet not connected');
      }

      setIsDeploying(true);
      try {
        // 1. Deploy via wallet
        const hash = await walletClient.deployContract({
          abi: params.abi,
          bytecode: `0x${params.bytecode}` as `0x${string}`,
          args: params.constructorArgs || [],
        });

        // 2. Wait for receipt to get contract address
        const { createPublicClient, http } = await import('viem');
        const { baseSepolia } = await import('viem/chains');
        const publicClient = createPublicClient({
          chain: baseSepolia,
          transport: http(),
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (!receipt.contractAddress) {
          throw new Error('Contract deployment failed — no address in receipt');
        }

        // 3. Register with backend
        const { data } = await api.post('/contracts/register', {
          txHash: hash,
          contractAddress: receipt.contractAddress,
          contractName: params.contractName,
          sources: params.sources,
          abi: params.abi,
          constructorArgs: params.constructorArgs,
          projectId: params.projectId,
        });

        return {
          contractAddress: receipt.contractAddress,
          txHash: hash,
          tokenId: data.tokenId,
        };
      } finally {
        setIsDeploying(false);
      }
    },
    [walletClient],
  );

  return { deploy, isDeploying };
}
```

**Step 2: Update chat store deployFromCard**

In `frontend/src/stores/chat-store.ts`, the `deployFromCard` method currently posts to `/assistants/deploy-cached`. This needs to be updated to:
1. Post to `/assistants/deploy-cached` which now returns compile result
2. The actual deploy happens via the `useDeployContract` hook in the UI component

The chat store should now just handle the compile request and pass the result to the UI. The deploy button in the message bubble component will use `useDeployContract`.

Update `deployFromCard` to `compileCached`:

```typescript
compileCached: async (contractName: string, constructorArgs: Record<string, string>) => {
  const state = get();
  const conversation = state.conversations.find((c) => c.id === state.activeConversationId);

  const res = await api.post('/assistants/deploy-cached', {
    constructorArgs,
    projectId: conversation?.projectId || undefined,
  });

  return res.data; // { abi, bytecode, constructorArgs, contractName, sources }
},
```

**Step 3: Commit**

```bash
git add frontend/src/hooks/use-deploy-contract.ts frontend/src/stores/chat-store.ts
git commit -m "feat: add frontend deploy hook and update chat store for wallet deploys"
```

---

## Task 16: Full Stack Build Verification

**Step 1: Build backend**

Run: `cd backend && npm run build`
Expected: Clean build, no errors

**Step 2: Build frontend**

Run: `cd frontend && npm run build`
Expected: Clean build, no errors

**Step 3: Fix any remaining build errors**

If there are TypeScript errors from stale references (old UserProfile fields, old auth methods), fix them one by one.

**Step 4: Run backend tests**

Run: `cd backend && npm test`
Expected: Tests pass (some auth tests may fail if they test old login/register — update or remove them)

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve remaining build errors from wallet auth migration"
```

---

## Task 17: Update CLAUDE.md and Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md` (if needed)

**Step 1: Update CLAUDE.md**

Update the relevant sections:
- **Environment Variables**: Add `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (optional)
- **API routes table**: Replace `/auth/register`, `/auth/login` with `/auth/nonce`, `/auth/verify`
- **Architecture description**: Update auth flow description
- **SmartUser schema**: Update field list
- **Dependencies**: Note RainbowKit, wagmi, viem, siwe

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for wallet-based auth architecture"
```

---

## Summary of All Tasks

| # | Task | Scope |
|---|---|---|
| 1 | Install backend deps (siwe, remove bcryptjs) | Backend |
| 2 | Update SmartUser schema + interfaces | Backend |
| 3 | Create verify DTO, delete old DTOs | Backend |
| 4 | Rewrite AuthService for SIWE | Backend |
| 5 | Rewrite AuthController + strategy + module | Backend |
| 6 | Add compile + register endpoints | Backend |
| 7 | Update cross-module deploy flow | Backend |
| 8 | Install frontend deps | Frontend |
| 9 | Create wagmi config + providers | Frontend |
| 10 | SIWE auth hook + auth store + types | Frontend |
| 11 | Navbar with ConnectButton | Frontend |
| 12 | AuthGuard + chat gating | Frontend |
| 13 | API client + middleware | Frontend |
| 14 | Delete old auth pages | Frontend |
| 15 | Frontend deploy flow | Frontend |
| 16 | Full stack build verification | Both |
| 17 | Update documentation | Docs |
