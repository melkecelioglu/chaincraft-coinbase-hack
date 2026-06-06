import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Token, TokenType } from './schemas/token.schema';
import { InternalTokenDto } from './dto/internal-token.dto';

@Injectable()
export class TokensService {
  constructor(@InjectModel(Token.name) private tokenModel: Model<Token>) {}

  async create(createTokenDto: InternalTokenDto): Promise<Token> {
    const createdToken = new this.tokenModel(createTokenDto);
    return createdToken.save();
  }

  async findByType(type: string): Promise<Token[]> {
    return this.tokenModel.find({ type }).exec();
  }

  async delete(id: string): Promise<Token> {
    return this.tokenModel.findByIdAndDelete(id).exec();
  }

  async findByUserAndType(userId: string, type: TokenType): Promise<Token[]> {
    return this.tokenModel.find({ user: userId, type }).exec();
  }

  async findByProject(projectId: string): Promise<Token[]> {
    return this.tokenModel
      .find({ project: projectId })
      .populate('project')
      .exec();
  }

  async findOne(id: string): Promise<Token> {
    const token = await this.tokenModel.findById(id).exec();
    if (!token) {
      throw new NotFoundException(`Token with ID ${id} not found`);
    }
    return token;
  }

  async findByProjectAndUser(
    projectId: string,
    userId: string,
  ): Promise<Token[]> {
    return this.tokenModel
      .find({ project: projectId, user: userId })
      .populate('project')
      .exec();
  }

  async findByProjectAndUserAndType(
    projectId: string,
    userId: string,
    type: TokenType,
  ): Promise<Token[]> {
    return this.tokenModel
      .find({ project: projectId, user: userId, type })
      .populate('project')
      .exec();
  }

  async findByUser(userId: string): Promise<Token[]> {
    return this.tokenModel.find({ user: userId }).exec();
  }
}
