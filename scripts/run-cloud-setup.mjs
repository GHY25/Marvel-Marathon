import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
// Read in Node before launching Electron, which may reattach the Windows console.
// The one-shot payload lives only in the child's environment and is deleted there.
if (process.stdin.isTTY) process.stdin.setRawMode(true)
process.stdin.setEncoding('utf8')
process.stdin.resume()
console.log('Ready for cloud connection JSON on stdin (input is hidden).')
let input = ''
process.stdin.on('data', chunk => {
  input += chunk
  if (!/[\r\n]/.test(input)) return
  process.stdin.pause()
  const child = spawn(require('electron'), ['scripts/configure-cloud.cjs'], { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true, env: { ...env, MARATHON_CLOUD_SETUP_JSON: input.trim() } })
  input = ''
  child.on('error', () => { console.error('Could not start secure connection setup.'); process.exitCode = 1 })
  child.on('exit', code => {
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    process.exitCode = code ?? 1
  })
})
