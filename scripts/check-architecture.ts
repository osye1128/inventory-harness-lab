import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd(), 'src')
const allowedFile = path.resolve(root, 'lib/stock.ts')
const sourceExtensions = new Set(['.ts', '.tsx'])

const mutationPatterns = [
  { pattern: /\b(?:lot|lots)\.(?:update|updateMany|upsert|create|createMany|delete|deleteMany)\s*\(/, label: 'Lot 직접 변경' },
  { pattern: /\b(?:movement|movements)\.(?:create|createMany|update|updateMany|delete|deleteMany)\s*\(/, label: 'Movement 직접 변경' },
  { pattern: /\bquantity\s*:\s*\{\s*(?:increment|decrement)\s*:/, label: '수량 직접 증감' },
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'generated') return []
      return sourceFiles(filePath)
    }
    return sourceExtensions.has(path.extname(entry.name)) ? [filePath] : []
  })
}

const violations = sourceFiles(root).flatMap((filePath) => {
  if (path.resolve(filePath) === allowedFile) return []
  return readFileSync(filePath, 'utf8').split(/\r?\n/).flatMap((line, index) =>
    mutationPatterns
      .filter(({ pattern }) => pattern.test(line))
      .map(({ label }) => ({ filePath, line: index + 1, label, source: line.trim() }))
  )
})

if (violations.length > 0) {
  console.error('Architecture Check 실패: 재고 변경은 applyMovement()를 통해야 합니다.')
  for (const violation of violations) {
    console.error(`- ${path.relative(process.cwd(), violation.filePath)}:${violation.line} [${violation.label}] ${violation.source}`)
  }
  process.exit(1)
}

console.log('Architecture Check 통과: 직접적인 재고 mutation이 applyMovement() 외부에서 발견되지 않았습니다.')
