import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as solc from 'solc';

export interface CompileResult {
  abi: any[];
  bytecode: string;
  compilerVersion: string;
}

@Injectable()
export class SolcService {
  private readonly logger = new Logger(SolcService.name);

  private findImports(
    importPath: string,
  ): { contents: string } | { error: string } {
    try {
      const resolved = path.join(process.cwd(), 'node_modules', importPath);
      const contents = fs.readFileSync(resolved, 'utf8');
      return { contents };
    } catch {
      return { error: `File not found: ${importPath}` };
    }
  }

  /**
   * Resolve the canonical path for an import, handling relative paths.
   */
  private resolveCanonicalPath(
    rawImportPath: string,
    importerKey: string,
  ): string {
    if (!rawImportPath.startsWith('.')) return rawImportPath;

    // Resolve relative to the importer's directory in node_modules
    const nodeModulesBase = path.join(process.cwd(), 'node_modules');
    const importerDir = path.dirname(path.join(nodeModulesBase, importerKey));
    const absPath = path.resolve(importerDir, rawImportPath);
    return path.relative(nodeModulesBase, absPath);
  }

  /**
   * Resolve all transitive imports and return a complete sources map
   * suitable for Basescan standard JSON input verification.
   * Relative imports are rewritten to canonical absolute paths.
   */
  resolveAllSources(
    sources: Record<string, { content: string }>,
  ): Record<string, { content: string }> {
    const resolved: Record<string, { content: string }> = { ...sources };
    // Queue entries: [sourceKey, content]
    const queue: Array<[string, string]> = Object.entries(sources).map(
      ([key, s]) => [key, s.content],
    );
    const importRegex = /import\s+(?:{[^}]*}\s+from\s+)?["']([^"']+)["']/g;

    while (queue.length > 0) {
      const [sourceKey, code] = queue.pop()!;
      let match: RegExpExecArray | null;
      importRegex.lastIndex = 0;
      while ((match = importRegex.exec(code)) !== null) {
        const rawImportPath = match[1];
        const canonicalPath = this.resolveCanonicalPath(
          rawImportPath,
          sourceKey,
        );

        if (resolved[canonicalPath]) continue;

        const result = this.findImports(canonicalPath);
        if ('contents' in result) {
          resolved[canonicalPath] = { content: result.contents };
          queue.push([canonicalPath, result.contents]);
        }
      }
    }

    // Rewrite relative imports to canonical paths in all resolved files
    for (const [key, source] of Object.entries(resolved)) {
      let content = source.content;
      let modified = false;
      importRegex.lastIndex = 0;
      let m: RegExpExecArray | null;
      // Collect replacements to avoid modifying string while iterating
      const replacements: Array<{ from: string; to: string }> = [];
      while ((m = importRegex.exec(content)) !== null) {
        const raw = m[1];
        if (raw.startsWith('.')) {
          const canonical = this.resolveCanonicalPath(raw, key);
          replacements.push({ from: raw, to: canonical });
          modified = true;
        }
      }
      if (modified) {
        for (const { from, to } of replacements) {
          content = content.split(`"${from}"`).join(`"${to}"`);
          content = content.split(`'${from}'`).join(`'${to}'`);
        }
        resolved[key] = { content };
      }
    }

    return resolved;
  }

  getCompilerVersion(): string {
    const rawVersion = (solc as any).version() as string;
    return 'v' + rawVersion.split('.Emscripten')[0];
  }

  compile(
    sources: Record<string, { content: string }>,
    contractName: string,
  ): CompileResult {
    const compilerVersion = this.getCompilerVersion();

    const input = {
      language: 'Solidity',
      sources,
      settings: {
        optimizer: { enabled: true, runs: 200 },
        outputSelection: {
          '*': { '*': ['abi', 'evm.bytecode'] },
        },
      },
    };

    const output = JSON.parse(
      solc.compile(JSON.stringify(input), {
        import: this.findImports.bind(this),
      }),
    );

    if (output.errors?.some((e: any) => e.severity === 'error')) {
      const errors = output.errors
        .filter((e: any) => e.severity === 'error')
        .map((e: any) => e.formattedMessage)
        .join('\n');
      throw new Error(`Solidity compilation failed:\n${errors}`);
    }

    // Find the contract in output — search all source files
    for (const file of Object.keys(output.contracts || {})) {
      if (output.contracts[file][contractName]) {
        const contract = output.contracts[file][contractName];
        return {
          abi: contract.abi,
          bytecode: contract.evm.bytecode.object,
          compilerVersion,
        };
      }
    }

    throw new Error(
      `Contract "${contractName}" not found in compilation output`,
    );
  }
}
