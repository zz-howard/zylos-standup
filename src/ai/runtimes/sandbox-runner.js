#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import { quoteSandboxCommand } from './sandbox.js';

const payloadPath = process.argv[2];

function readPayload() {
  if (!payloadPath) throw new Error('missing sandbox payload path');
  const raw = fs.readFileSync(payloadPath, 'utf8');
  try {
    fs.rmSync(payloadPath, { force: true });
  } catch {
    // Best-effort cleanup.
  }
  return JSON.parse(raw);
}

function exitLikeChild(code, signal) {
  if (signal) {
    process.exit(128 + (os.constants.signals[signal] || 1));
    return;
  }
  process.exit(code ?? 0);
}

function logUnsandboxed(metadata, reason) {
  console.error(
    `[standup] WARNING: running AI command without sandbox ` +
    `(scenario=${metadata?.scenario || 'unknown'}, runtime=${metadata?.runtime || 'unknown'}): ${reason}`,
  );
}

async function main() {
  const payload = readPayload();
  const { cmd, args, runtimeConfig, metadata, allowUnsandboxed, shell } = payload;
  const command = quoteSandboxCommand(cmd, args || []);

  let wrappedCommand;
  try {
    if (process.env.STANDUP_SANDBOX_FORCE_INIT_FAILURE === '1') {
      throw new Error('forced sandbox init failure');
    }
    await SandboxManager.initialize(runtimeConfig);
    wrappedCommand = await SandboxManager.wrapWithSandbox(command, shell);
  } catch (err) {
    if (!allowUnsandboxed) {
      console.error(`[standup] sandbox initialization failed closed: ${err.message}`);
      process.exit(126);
    }
    logUnsandboxed(metadata, err.message);
    wrappedCommand = command;
  }

  const child = spawn(wrappedCommand, {
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      SandboxManager.cleanupAfterCommand();
    } catch {
      // Cleanup must not mask command result.
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      if (child.exitCode === null && !child.killed) child.kill(signal);
    });
  }

  child.on('error', (err) => {
    cleanup();
    console.error(`[standup] sandboxed command failed to start: ${err.message}`);
    process.exit(127);
  });
  child.on('close', (code, signal) => {
    cleanup();
    exitLikeChild(code, signal);
  });
}

main().catch((err) => {
  console.error(`[standup] sandbox runner failed: ${err.message}`);
  process.exit(1);
});
