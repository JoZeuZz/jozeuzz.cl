#!/usr/bin/env node
import { runCoordCli } from '../src/coord-cli.js';

process.exitCode = await runCoordCli(process.argv.slice(2));
