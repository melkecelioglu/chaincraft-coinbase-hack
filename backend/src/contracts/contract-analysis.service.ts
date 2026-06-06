import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import * as solidityParser from '@solidity-parser/parser';

@Injectable()
export class ContractAnalysisService {
  validateSyntax(contractInput: string): boolean {
    const contractCode = this.extractContractCode(contractInput);

    try {
      solidityParser.parse(contractCode, { tolerant: false });
      return true;
    } catch (e) {
      throw new HttpException(
        { line: e.line, column: e.column, message: e.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private extractContractCode(input: string): string {
    try {
      const parsedData = JSON.parse(input);
      if (parsedData.contractCode) {
        return parsedData.contractCode;
      }
      return input;
    } catch {
      const contractCodeMatch = input.match(
        /"contractCode":\s*"([\s\S]+?)(?<!\\)"/,
      );
      if (contractCodeMatch?.[1]) {
        return contractCodeMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\\t/g, '\t');
      }

      if (
        input.trim().startsWith('//') ||
        input.trim().startsWith('/*') ||
        input.trim().startsWith('pragma')
      ) {
        return input;
      }

      throw new HttpException(
        'No valid contract code found in input',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
