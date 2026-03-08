import { access, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { homedir, tmpdir } from 'os'
import { join, resolve } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const DEFAULT_WHISPER_COMMANDS = ['whisper-cli', 'main']
const DEFAULT_MODEL_CANDIDATES = [
  join(homedir(), '.cache', 'whisper', 'ggml-base.en.bin'),
  join(homedir(), '.cache', 'whisper.cpp', 'ggml-base.en.bin'),
  '/opt/homebrew/share/whisper.cpp/models/ggml-base.en.bin',
  '/usr/local/share/whisper.cpp/models/ggml-base.en.bin'
]
const EXEC_MAX_BUFFER = 10 * 1024 * 1024

type ExecFailure = Error & {
  code?: string | number
  stderr?: string
}

class MissingCommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MissingCommandError'
  }
}

function expandHome(path: string): string {
  if (!path.startsWith('~/')) return path
  return join(homedir(), path.slice(2))
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function resolveWhisperModelPath(): Promise<string> {
  const envModelPath = process.env.WHISPER_MODEL_PATH?.trim()
  const candidates = envModelPath ? [expandHome(envModelPath)] : DEFAULT_MODEL_CANDIDATES

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return resolve(candidate)
    }
  }

  throw new Error(
    'No local Whisper model found. Set WHISPER_MODEL_PATH to a GGML model file (for example: ggml-base.en.bin).'
  )
}

async function runCommand(command: string, args: string[], missingHelp: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      maxBuffer: EXEC_MAX_BUFFER
    })
    return stdout.toString()
  } catch (error) {
    const execError = error as ExecFailure

    if (execError.code === 'ENOENT') {
      throw new MissingCommandError(missingHelp)
    }

    const stderr = execError.stderr?.toString().trim()
    throw new Error(stderr || `Command "${command}" failed.`)
  }
}

async function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  const ffmpegCommand = process.env.FFMPEG_COMMAND?.trim() || 'ffmpeg'
  const missingHelp = `Could not run "${ffmpegCommand}". Install ffmpeg locally or set FFMPEG_COMMAND to a valid ffmpeg binary path.`

  await runCommand(
    ffmpegCommand,
    ['-y', '-i', inputPath, '-ac', '1', '-ar', '16000', '-f', 'wav', outputPath],
    missingHelp
  )
}

async function runWhisper(
  inputPath: string,
  outputBasePath: string,
  modelPath: string
): Promise<void> {
  const configuredCommand = process.env.WHISPER_COMMAND?.trim()
  const whisperCommands = configuredCommand ? [configuredCommand] : DEFAULT_WHISPER_COMMANDS
  const language = process.env.WHISPER_LANGUAGE?.trim()

  const args = ['-m', modelPath, '-f', inputPath, '-otxt', '-of', outputBasePath]
  if (language) {
    args.push('-l', language)
  }

  let lastError: Error | null = null
  for (const command of whisperCommands) {
    const missingHelp = `Could not run "${command}". Install whisper.cpp locally or set WHISPER_COMMAND to the whisper executable path.`

    try {
      await runCommand(command, args, missingHelp)
      return
    } catch (error) {
      if (error instanceof MissingCommandError) {
        lastError = error
        continue
      }

      throw error
    }
  }

  throw (
    lastError ??
    new Error(
      'Could not run a local whisper command. Set WHISPER_COMMAND to a working whisper executable path.'
    )
  )
}

export async function transcribeAudio(audioData: ArrayBuffer): Promise<string> {
  const modelPath = await resolveWhisperModelPath()
  const tempDir = await mkdtemp(join(tmpdir(), 'ross-transcribe-'))
  const inputPath = join(tempDir, 'recording.webm')
  const wavPath = join(tempDir, 'recording.wav')
  const outputBasePath = join(tempDir, 'transcript')
  const outputPath = `${outputBasePath}.txt`

  try {
    await writeFile(inputPath, Buffer.from(audioData))
    await convertToWav(inputPath, wavPath)
    await runWhisper(wavPath, outputBasePath, modelPath)

    const transcription = (await readFile(outputPath, 'utf-8')).trim()
    if (!transcription) {
      throw new Error('Transcription finished but returned no text.')
    }

    return transcription
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown transcription error.'
    throw new Error(`Local transcription failed: ${message}`)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
