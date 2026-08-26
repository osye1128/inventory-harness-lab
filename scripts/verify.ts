import { spawnSync } from 'node:child_process'
import {
  cleanupVerifyEnvironment,
  createVerifyEnvironment,
  prepareVerifyDatabase,
} from './prepare-verify'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function runStage(name: string, args: string[], databaseUrl: string): void {
  console.log(`\n▸ ${name}`)
  const result = spawnSync(npmCommand, args, {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    throw new Error(`${name} 단계가 실패했습니다`)
  }
}

const environment = createVerifyEnvironment()
try {
  runStage('Protected', ['run', 'protected'], environment.databaseUrl)
  prepareVerifyDatabase(environment)
  runStage('Types', ['run', 'types'], environment.databaseUrl)
  runStage('Lint', ['run', 'lint'], environment.databaseUrl)
  runStage('Architecture Check', ['run', 'architecture:check'], environment.databaseUrl)
  runStage('Test', ['test'], environment.databaseUrl)
  runStage('Build', ['run', 'build'], environment.databaseUrl)
  console.log('\n✓ 검증 완료')
} finally {
  cleanupVerifyEnvironment(environment)
}
