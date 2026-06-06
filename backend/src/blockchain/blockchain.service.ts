import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { SolcService } from './solc.service';

export interface DeployTokenResult {
  contractAddress: string;
  compilerVersion: string;
  abi: any[];
  sources: Record<string, { content: string }>;
}

export interface DeployCustomContractResult {
  contractAddress: string;
  compilerVersion: string;
  abi: any[];
}

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private readonly provider: ethers.JsonRpcProvider;
  private readonly erc20Source: string;
  private readonly basescanApiKey?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly solcService: SolcService,
  ) {
    const rpcUrl = this.configService.getOrThrow('BASE_SEPOLIA_RPC_URL');
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.erc20Source = fs.readFileSync(
      path.join(__dirname, 'contracts', 'ERC20Token.sol'),
      'utf8',
    );
    this.basescanApiKey = this.configService.get<string>('BASESCAN_API_KEY');
  }

  getErc20Sources(): Record<string, { content: string }> {
    return { 'ERC20Token.sol': { content: this.erc20Source } };
  }

  private getWallet(mnemonic: string): ethers.HDNodeWallet {
    return ethers.Wallet.fromPhrase(mnemonic, this.provider);
  }

  async deployToken(
    name: string,
    symbol: string,
    totalSupply: number,
    mnemonic: string,
  ): Promise<DeployTokenResult> {
    try {
      const wallet = this.getWallet(mnemonic);
      const sources = { 'ERC20Token.sol': { content: this.erc20Source } };
      const { abi, bytecode, compilerVersion } = this.solcService.compile(
        sources,
        'ERC20Token',
      );

      this.logger.log('Deploying ERC20 token contract...');
      const factory = new ethers.ContractFactory(abi, bytecode, wallet);
      const contract = await factory.deploy(name, symbol, totalSupply);
      await contract.waitForDeployment();

      const contractAddress = await contract.getAddress();
      this.logger.log(`Token contract deployed to: ${contractAddress}`);

      return { contractAddress, compilerVersion, abi, sources };
    } catch (error) {
      this.logger.error('Token deployment failed', {
        message: (error as Error).message,
      });
      throw new HttpException(
        `Failed to deploy contract: ${(error as Error).message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  getConstructorArgsSchema(
    sources: Record<string, { content: string }>,
    contractName: string,
  ): Record<string, { type: string }> {
    const { abi } = this.solcService.compile(sources, contractName);
    const constructorAbi = abi.find((item: any) => item.type === 'constructor');
    if (!constructorAbi?.inputs?.length) return {};
    const schema: Record<string, { type: string }> = {};
    for (const input of constructorAbi.inputs) {
      schema[input.name] = { type: input.type };
    }
    return schema;
  }

  async deployCustomContract(
    sources: Record<string, { content: string }>,
    contractName: string,
    constructorArgs: Record<string, string>,
    mnemonic: string,
  ): Promise<DeployCustomContractResult> {
    try {
      const wallet = this.getWallet(mnemonic);
      const { abi, bytecode, compilerVersion } = this.solcService.compile(
        sources,
        contractName,
      );

      this.logger.log(`Deploying custom contract: ${contractName}...`);
      const factory = new ethers.ContractFactory(abi, bytecode, wallet);

      // Extract constructor arg values in ABI order
      const constructorAbi = abi.find(
        (item: any) => item.type === 'constructor',
      );
      const args = constructorAbi
        ? constructorAbi.inputs.map((input: any) => {
            const value = constructorArgs[input.name];
            if (value === undefined || value === null || value === '') {
              throw new Error(
                `Missing constructor argument: "${input.name}" (${input.type})`,
              );
            }
            // Handle array types
            if (input.type.endsWith('[]')) {
              let arr: any[];
              if (Array.isArray(value)) {
                arr = value;
              } else if (typeof value === 'string') {
                try {
                  arr = JSON.parse(value);
                } catch {
                  throw new Error(
                    `Invalid array value for "${input.name}" (${input.type}): ${value}`,
                  );
                }
              } else {
                return value;
              }
              // Normalize addresses in address[] arrays
              const baseType = input.type.replace('[]', '');
              if (baseType === 'address') {
                return arr.map((addr: string) =>
                  ethers.getAddress(addr.toLowerCase()),
                );
              }
              return arr;
            }
            // Normalize single address values
            if (input.type === 'address' && typeof value === 'string') {
              return ethers.getAddress(value.toLowerCase());
            }
            return value;
          })
        : [];

      const contract = await factory.deploy(...args);
      await contract.waitForDeployment();

      const contractAddress = await contract.getAddress();
      this.logger.log(`Custom contract deployed to: ${contractAddress}`);

      return { contractAddress, compilerVersion, abi };
    } catch (error) {
      this.logger.error('Custom contract deployment failed', {
        message: (error as Error).message,
      });
      throw new HttpException(
        `Failed to deploy custom contract: ${(error as Error).message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async verifyContract(params: {
    contractAddress: string;
    sources: Record<string, { content: string }>;
    contractName: string;
    compilerVersion: string;
    constructorArgs?: Record<string, string>;
    abi?: any[];
  }): Promise<void> {
    const {
      contractAddress,
      sources,
      contractName,
      compilerVersion,
      constructorArgs,
      abi,
    } = params;
    if (!this.basescanApiKey) {
      this.logger.warn(
        'BASESCAN_API_KEY not configured — skipping contract verification',
      );
      return;
    }

    // Wait for Basescan to index the contract (factory deploys need time)
    await new Promise((resolve) => setTimeout(resolve, 15_000));

    try {
      // Find the source file containing the contract
      const sourceFile =
        Object.keys(sources).find((file) =>
          sources[file].content.includes(`contract ${contractName}`),
        ) || Object.keys(sources)[0];

      // Resolve all transitive imports (e.g. OpenZeppelin) into sources
      const allSources = this.solcService.resolveAllSources(sources);

      // Build standard JSON input (same format as solc input)
      const standardJsonInput = JSON.stringify({
        language: 'Solidity',
        sources: allSources,
        settings: {
          optimizer: { enabled: true, runs: 200 },
          outputSelection: {
            '*': { '*': ['abi', 'evm.bytecode'] },
          },
        },
      });

      // Encode constructor args if present
      let encodedConstructorArgs = '';
      if (constructorArgs && abi) {
        const constructorAbi = abi.find(
          (item: any) => item.type === 'constructor',
        );
        if (constructorAbi?.inputs?.length) {
          const types = constructorAbi.inputs.map((input: any) => input.type);
          const values = constructorAbi.inputs.map((input: any) => {
            const raw = constructorArgs[input.name];
            // Parse JSON-encoded arrays for verification encoding
            if (
              input.type.endsWith('[]') &&
              typeof raw === 'string' &&
              raw.startsWith('[')
            ) {
              try {
                return JSON.parse(raw);
              } catch {
                return raw;
              }
            }
            return raw;
          });
          // Skip encoding if any value is missing (name mismatch)
          if (values.some((v: unknown) => v === undefined || v === null)) {
            this.logger.warn(
              `Constructor arg name mismatch — skipping encoding. Expected: ${constructorAbi.inputs.map((i: any) => i.name).join(', ')}`,
            );
          } else {
            const abiCoder = new ethers.AbiCoder();
            encodedConstructorArgs = abiCoder
              .encode(types, values)
              .replace(/^0x/, '');
          }
        }
      }

      const submitParams = new URLSearchParams({
        apikey: this.basescanApiKey,
        module: 'contract',
        action: 'verifysourcecode',
        contractaddress: contractAddress,
        sourceCode: standardJsonInput,
        codeformat: 'solidity-standard-json-input',
        contractname: `${sourceFile}:${contractName}`,
        compilerversion: compilerVersion,
        optimizationUsed: '1',
        runs: '200',
        constructorArguements: encodedConstructorArgs,
      });

      // Submit with retry (Basescan may not have indexed the contract yet)
      let guid: string | undefined;
      for (let submitAttempt = 0; submitAttempt < 3; submitAttempt++) {
        this.logger.log(
          `Submitting verification for ${contractAddress} to Basescan (attempt ${submitAttempt + 1}/3)...`,
        );
        const submitResponse = await fetch(
          'https://api.etherscan.io/v2/api?chainid=84532',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: submitParams.toString(),
          },
        );
        const submitResult = await submitResponse.json();

        if (submitResult.status === '1') {
          guid = submitResult.result;
          this.logger.log(`Verification submitted — GUID: ${guid}`);
          break;
        }

        // Retry on "Unable to locate" errors
        if (
          typeof submitResult.result === 'string' &&
          submitResult.result.includes('Unable to locate')
        ) {
          this.logger.warn(
            `Basescan cannot locate contract yet (attempt ${submitAttempt + 1}/3), retrying in 15s...`,
          );
          if (submitAttempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 15_000));
          }
          continue;
        }

        // Non-retryable error
        this.logger.warn(
          `Basescan verification submit failed: ${submitResult.result}`,
        );
        return;
      }

      if (!guid) {
        this.logger.warn(
          `Basescan verification failed after 3 attempts for ${contractAddress}`,
        );
        return;
      }

      // Poll for result (max 5 attempts, 3s apart)
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const checkParams = new URLSearchParams({
          apikey: this.basescanApiKey,
          module: 'contract',
          action: 'checkverifystatus',
          guid,
        });

        const checkResponse = await fetch(
          `https://api.etherscan.io/v2/api?chainid=84532&${checkParams.toString()}`,
        );
        const checkResult = await checkResponse.json();

        if (checkResult.result === 'Pass - Verified') {
          this.logger.log(`Contract ${contractAddress} verified on Basescan`);
          return;
        }

        if (
          checkResult.result !== 'Pending in queue' &&
          !checkResult.result?.includes('Unable to locate')
        ) {
          this.logger.warn(
            `Basescan verification check: ${checkResult.result}`,
          );
          return;
        }
      }

      this.logger.warn(
        `Basescan verification timed out for ${contractAddress}`,
      );
    } catch (error) {
      this.logger.error('Basescan verification error', {
        message: (error as Error).message,
      });
    }
  }
}
