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
