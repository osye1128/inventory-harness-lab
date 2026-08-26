import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

export type VerifyEnvironment = {
  directory: string
  databaseUrl: string
}

export function createVerifyEnvironment(): VerifyEnvironment {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'inventory-verify-'))
  const databasePath = path.join(directory, 'verify.db')
  return { directory, databaseUrl: `file:${databasePath.replaceAll('\\', '/')}` }
}

export function prepareVerifyDatabase(environment: VerifyEnvironment): void {
  console.log('▸ Prepare: 검증 전용 DB를 생성하고 시드합니다')
  execFileSync(npmCommand, ['run', 'db:ensure'], {
    env: { ...process.env, DATABASE_URL: environment.databaseUrl },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

export function cleanupVerifyEnvironment(environment: VerifyEnvironment): void {
  rmSync(environment.directory, { recursive: true, force: true })
}

if (process.argv[1]?.endsWith('prepare-verify.ts')) {
  const environment = createVerifyEnvironment()
  try {
    prepareVerifyDatabase(environment)
    console.log(`검증 DB: ${environment.databaseUrl}`)
  } finally {
    cleanupVerifyEnvironment(environment)
  }
}
