#!/usr/bin/env node

import { main } from './command.ts'

process.exitCode = await main()
