import { readLedger, replayLedger } from './harness-ledger'

const events = readLedger()
replayLedger(events)
console.log(`Harness ledger 통과: ${events.length}개 이벤트`)
