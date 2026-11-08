// 백엔드 테스트를 server/.venv의 Python으로 실행합니다. 가상환경이 없으면 시스템 python을 씁니다.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const serverDir = join(import.meta.dirname, '..', 'server')
const venvPython = process.platform === 'win32'
  ? join(serverDir, '.venv', 'Scripts', 'python.exe')
  : join(serverDir, '.venv', 'bin', 'python')
const python = existsSync(venvPython) ? venvPython : 'python'

const result = spawnSync(python, ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], {
  cwd: serverDir,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
