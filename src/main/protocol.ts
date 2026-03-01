import type { EqProfile, EqPoint, FilterType } from '../shared/types/eq'
import { serialService } from './serialService'

// Commands
const CMD_GET_DEVICE_INFO = 0x01
const CMD_GET_PROFILE_LIST = 0x02
const CMD_GET_ACTIVE = 0x03
const CMD_GET_PROFILE = 0x04
const CMD_SET_PROFILE = 0x05
const CMD_DELETE_PROFILE = 0x06
const CMD_SET_ACTIVE = 0x07
const CMD_SAVE_TO_FLASH = 0x08
const CMD_GET_MANUFACTURER = 0x80
const CMD_GET_PRODUCT = 0x81
const CMD_GET_AUDIO_ITF = 0x82
const CMD_SET_MANUFACTURER = 0x85
const CMD_SET_PRODUCT = 0x86
const CMD_SET_AUDIO_ITF = 0x87
const CMD_ENTER_DFU = 0x90
const CMD_GET_DFU_SERIAL = 0x91
const CMD_REBOOT = 0x92
const CMD_GET_DAC = 0x93
const CMD_GET_AMP = 0x94
const CMD_SET_DAC = 0x95
const CMD_SET_AMP = 0x96

// Status codes
const STATUS_OK = 0x00

// Filter type mapping: our FilterType -> protocol uint8
const FILTER_TYPE_TO_WIRE: Record<FilterType, number> = {
  peaking: 1,
  lowshelf: 2,
  highshelf: 3,
  lowpass: 4,
  highpass: 5
}

const WIRE_TO_FILTER_TYPE: Record<number, FilterType> = {
  1: 'peaking',
  2: 'lowshelf',
  3: 'highshelf',
  4: 'lowpass',
  5: 'highpass'
}

// Sample rate for biquad computation
const SAMPLE_RATE = 48000

// --- CRC8 (polynomial 0x07, initial 0x00) ---

function crc8(data: Buffer): number {
  let crc = 0x00
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x80) crc = ((crc << 1) ^ 0x07) & 0xff
      else crc = (crc << 1) & 0xff
    }
  }
  return crc
}

// --- Frame helpers ---

function buildRequest(cmd: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(3)
  header[0] = cmd
  header.writeUInt16LE(payload.length, 1)
  const frameBody = Buffer.concat([header, payload])
  const crc = crc8(frameBody)
  return Buffer.concat([frameBody, Buffer.from([crc])])
}

function parseResponse(expectedCmd: number, data: Buffer): { status: number; payload: Buffer } {
  if (data.length < 5) {
    throw new Error(`Response too short: ${data.length} bytes`)
  }

  const cmd = data[0]
  if (cmd !== (expectedCmd | 0x80)) {
    throw new Error(`Unexpected response command: 0x${cmd.toString(16)}`)
  }

  const len = data.readUInt16LE(1)
  const status = data[3]
  const payload = data.subarray(4, 3 + len)
  const receivedCrc = data[3 + len]
  const computedCrc = crc8(data.subarray(0, 3 + len))

  if (receivedCrc !== computedCrc) {
    throw new Error(
      `CRC mismatch: expected 0x${computedCrc.toString(16)}, got 0x${receivedCrc.toString(16)}`
    )
  }

  return { status, payload }
}

async function sendCommand(
  cmd: number,
  payload: Buffer = Buffer.alloc(0)
): Promise<{ status: number; payload: Buffer }> {
  const request = buildRequest(cmd, payload)
  await serialService.send(request)
  const response = await serialService.read(3000)
  return parseResponse(cmd, response)
}

// --- Biquad coefficient computation ---

function computeCoefficients(
  filterType: FilterType,
  frequency: number,
  gain: number,
  q: number
): { b0: number; b1: number; b2: number; a0: number; a1: number; a2: number } {
  // Clamp Q for non-peaking filters to avoid resonance/overshoot
  const MAX_Q_NON_PEAKING = Math.SQRT1_2 // 0.707
  const effectiveQ = filterType !== 'peaking' ? Math.min(q, MAX_Q_NON_PEAKING) : q

  const w0 = (2 * Math.PI * frequency) / SAMPLE_RATE
  const cosw0 = Math.cos(w0)
  const sinw0 = Math.sin(w0)
  const alpha = sinw0 / (2 * effectiveQ)
  const A = Math.pow(10, gain / 40)

  let b0: number, b1: number, b2: number
  let a0: number, a1: number, a2: number

  switch (filterType) {
    case 'peaking':
      b0 = 1 + alpha * A
      b1 = -2 * cosw0
      b2 = 1 - alpha * A
      a0 = 1 + alpha / A
      a1 = -2 * cosw0
      a2 = 1 - alpha / A
      break
    case 'lowshelf': {
      const sqrtA = Math.sqrt(A)
      b0 = A * (A + 1 - (A - 1) * cosw0 + 2 * sqrtA * alpha)
      b1 = 2 * A * (A - 1 - (A + 1) * cosw0)
      b2 = A * (A + 1 - (A - 1) * cosw0 - 2 * sqrtA * alpha)
      a0 = A + 1 + (A - 1) * cosw0 + 2 * sqrtA * alpha
      a1 = -2 * (A - 1 + (A + 1) * cosw0)
      a2 = A + 1 + (A - 1) * cosw0 - 2 * sqrtA * alpha
      break
    }
    case 'highshelf': {
      const sqrtA = Math.sqrt(A)
      b0 = A * (A + 1 + (A - 1) * cosw0 + 2 * sqrtA * alpha)
      b1 = -2 * A * (A - 1 + (A + 1) * cosw0)
      b2 = A * (A + 1 + (A - 1) * cosw0 - 2 * sqrtA * alpha)
      a0 = A + 1 - (A - 1) * cosw0 + 2 * sqrtA * alpha
      a1 = 2 * (A - 1 - (A + 1) * cosw0)
      a2 = A + 1 - (A - 1) * cosw0 - 2 * sqrtA * alpha
      break
    }
    case 'lowpass':
      b0 = (1 - cosw0) / 2
      b1 = 1 - cosw0
      b2 = (1 - cosw0) / 2
      a0 = 1 + alpha
      a1 = -2 * cosw0
      a2 = 1 - alpha
      break
    case 'highpass':
      b0 = (1 + cosw0) / 2
      b1 = -(1 + cosw0)
      b2 = (1 + cosw0) / 2
      a0 = 1 + alpha
      a1 = -2 * cosw0
      a2 = 1 - alpha
      break
  }

  return { b0, b1, b2, a0, a1, a2 }
}

// --- Serialization ---

function serializeFilter(point: EqPoint): Buffer {
  const buf = Buffer.alloc(36)
  const coeffs = computeCoefficients(point.filterType, point.frequency, point.gain, point.q)

  // Normalize by a0
  buf.writeFloatLE(coeffs.b0 / coeffs.a0, 0)
  buf.writeFloatLE(coeffs.b1 / coeffs.a0, 4)
  buf.writeFloatLE(coeffs.b2 / coeffs.a0, 8)
  buf.writeFloatLE(coeffs.a1 / coeffs.a0, 12)
  buf.writeFloatLE(coeffs.a2 / coeffs.a0, 16)
  buf.writeFloatLE(point.frequency, 20)
  buf.writeFloatLE(point.gain, 24)
  buf.writeFloatLE(point.q, 28)
  buf[32] = FILTER_TYPE_TO_WIRE[point.filterType]
  buf[33] = point.enabled ? 1 : 0
  // bytes 34-35 = padding (already 0)

  return buf
}

function serializeProfile(profile: EqProfile): Buffer {
  const buf = Buffer.alloc(380)

  // Name: 16 bytes null-terminated
  const nameBytes = Buffer.from(profile.name.slice(0, 15), 'utf-8')
  nameBytes.copy(buf, 0)

  // Filter count
  buf[16] = profile.points.length

  // Padding at 17-19 already 0

  // Filters at offset 20, 36 bytes each
  for (let i = 0; i < profile.points.length; i++) {
    const filterBuf = serializeFilter(profile.points[i])
    filterBuf.copy(buf, 20 + i * 36)
  }

  return buf
}

function parseProfile(data: Buffer): EqProfile {
  // Read name (16 bytes, null-terminated)
  const nameEnd = data.indexOf(0, 0)
  const name = data.subarray(0, nameEnd > 0 && nameEnd < 16 ? nameEnd : 16).toString('utf-8')

  const filterCount = data[16]
  const points: EqPoint[] = []

  for (let i = 0; i < filterCount && i < 10; i++) {
    const offset = 20 + i * 36
    const typeVal = data[offset + 32]

    if (typeVal === 0) continue // OFF / unused slot

    const filterType = WIRE_TO_FILTER_TYPE[typeVal]
    if (!filterType) continue

    points.push({
      id: crypto.randomUUID(),
      filterType,
      frequency: data.readFloatLE(offset + 20),
      gain: data.readFloatLE(offset + 24),
      q: data.readFloatLE(offset + 28),
      enabled: data[offset + 33] === 1,
      color: '' // assigned by the renderer store
    })
  }

  return { id: '', name, points }
}

// --- Public API ---

export async function getDeviceInfo(): Promise<{
  hwModel: number
  hwVersion: string
  fwVersion: string
  maxProfiles: number
  maxFilters: number
  activeProfileId: number
}> {
  const { status, payload } = await sendCommand(CMD_GET_DEVICE_INFO)
  if (status !== STATUS_OK) throw new Error(`GET_DEVICE_INFO failed: status ${status}`)

  return {
    hwModel: payload[0],
    hwVersion: `${payload[1]}.${payload[2]}`,
    fwVersion: `${payload[3]}.${payload[4]}.${payload[5]}`,
    maxProfiles: payload[6],
    maxFilters: payload[7],
    activeProfileId: payload[8]
  }
}

export async function getActiveProfile(): Promise<number> {
  const { status, payload } = await sendCommand(CMD_GET_ACTIVE)
  if (status !== STATUS_OK) throw new Error(`GET_ACTIVE failed: status ${status}`)
  return payload[0]
}

export async function listBoardProfiles(): Promise<{ id: string; name: string }[]> {
  const { status, payload } = await sendCommand(CMD_GET_PROFILE_LIST)
  if (status !== STATUS_OK) throw new Error(`GET_PROFILE_LIST failed: status ${status}`)

  const count = payload[0]
  const profiles: { id: string; name: string }[] = []

  for (let i = 0; i < count; i++) {
    const entryOffset = 1 + i * 17
    const slotId = payload[entryOffset]
    const nameEnd = payload.indexOf(0, entryOffset + 1)
    const nameSlice =
      nameEnd > entryOffset + 1 && nameEnd <= entryOffset + 17
        ? payload.subarray(entryOffset + 1, nameEnd)
        : payload.subarray(entryOffset + 1, entryOffset + 17)
    profiles.push({
      id: slotId.toString(),
      name: nameSlice.toString('utf-8')
    })
  }

  return profiles
}

export async function loadBoardProfile(id: string): Promise<EqProfile | null> {
  const slotId = parseInt(id, 10)
  if (isNaN(slotId) || slotId < 0 || slotId >= 10) return null

  const { status, payload } = await sendCommand(CMD_GET_PROFILE, Buffer.from([slotId]))
  if (status !== STATUS_OK) return null

  const profile = parseProfile(payload)
  profile.id = id
  return profile
}

export async function saveBoardProfile(profile: EqProfile): Promise<boolean> {
  // Determine slot ID: use the profile's id if it's a valid slot number, otherwise find a free slot
  let slotId = parseInt(profile.id, 10)
  if (isNaN(slotId) || slotId < 0 || slotId >= 10) {
    // Find next available slot
    const existing = await listBoardProfiles()
    const usedSlots = new Set(existing.map((p) => parseInt(p.id, 10)))
    slotId = -1
    for (let i = 0; i < 10; i++) {
      if (!usedSlots.has(i)) {
        slotId = i
        break
      }
    }
    if (slotId === -1) throw new Error('No free profile slots on device')
  }

  const profileData = serializeProfile(profile)
  const payload = Buffer.concat([Buffer.from([slotId]), profileData])

  const { status } = await sendCommand(CMD_SET_PROFILE, payload)
  if (status !== STATUS_OK) return false

  // Activate the profile
  const { status: activeStatus } = await sendCommand(CMD_SET_ACTIVE, Buffer.from([slotId]))
  if (activeStatus !== STATUS_OK) return false

  // Persist to flash
  const { status: flashStatus } = await sendCommand(CMD_SAVE_TO_FLASH)
  return flashStatus === STATUS_OK
}

export async function setActiveProfile(id: string): Promise<boolean> {
  const slotId = parseInt(id, 10)
  const isValidSlot = !isNaN(slotId) && slotId >= 0 && slotId < 10
  const isOff = slotId === 0xff
  if (!isValidSlot && !isOff) return false

  const { status } = await sendCommand(CMD_SET_ACTIVE, Buffer.from([slotId]))
  return status === STATUS_OK
}

export async function getDfuSerial(): Promise<string> {
  const { status, payload } = await sendCommand(CMD_GET_DFU_SERIAL)
  if (status !== STATUS_OK) throw new Error(`GET_DFU_SERIAL failed: status ${status}`)
  return payload.toString('ascii')
}

export async function enterDfuMode(): Promise<boolean> {
  try {
    const { status } = await sendCommand(CMD_ENTER_DFU)
    return status === STATUS_OK
  } catch {
    // The board reboots into DFU before sending a response,
    // causing a read timeout. This is expected — treat as success.
    return true
  }
}

export async function getManufacturer(): Promise<string> {
  const { status, payload } = await sendCommand(CMD_GET_MANUFACTURER)
  if (status !== STATUS_OK) throw new Error(`GET_MANUFACTURER failed: status ${status}`)
  return payload.toString('ascii')
}

export async function getProduct(): Promise<string> {
  const { status, payload } = await sendCommand(CMD_GET_PRODUCT)
  if (status !== STATUS_OK) throw new Error(`GET_PRODUCT failed: status ${status}`)
  return payload.toString('ascii')
}

export async function setManufacturer(value: string): Promise<boolean> {
  const payload = Buffer.from(value.slice(0, 32), 'ascii')
  if (payload.length === 0) return false
  const { status } = await sendCommand(CMD_SET_MANUFACTURER, payload)
  return status === STATUS_OK
}

export async function setProduct(value: string): Promise<boolean> {
  const payload = Buffer.from(value.slice(0, 32), 'ascii')
  if (payload.length === 0) return false
  const { status } = await sendCommand(CMD_SET_PRODUCT, payload)
  return status === STATUS_OK
}

export async function getAudioItf(): Promise<string> {
  const { status, payload } = await sendCommand(CMD_GET_AUDIO_ITF)
  if (status !== STATUS_OK) throw new Error(`GET_AUDIO_ITF failed: status ${status}`)
  return payload.toString('ascii')
}

export async function setAudioItf(value: string): Promise<boolean> {
  const payload = Buffer.from(value.slice(0, 32), 'ascii')
  if (payload.length === 0) return false
  const { status } = await sendCommand(CMD_SET_AUDIO_ITF, payload)
  return status === STATUS_OK
}

export async function rebootDevice(): Promise<boolean> {
  const { status } = await sendCommand(CMD_REBOOT)
  return status === STATUS_OK
}

export async function getDac(): Promise<boolean> {
  const { status, payload } = await sendCommand(CMD_GET_DAC)
  if (status !== STATUS_OK) throw new Error(`GET_DAC failed: status ${status}`)
  return payload[0] === 1
}

export async function getAmp(): Promise<boolean> {
  const { status, payload } = await sendCommand(CMD_GET_AMP)
  if (status !== STATUS_OK) throw new Error(`GET_AMP failed: status ${status}`)
  return payload[0] === 1
}

export async function setDac(enable: boolean): Promise<boolean> {
  const { status } = await sendCommand(CMD_SET_DAC, Buffer.from([enable ? 1 : 0]))
  return status === STATUS_OK
}

export async function setAmp(enable: boolean): Promise<boolean> {
  const { status } = await sendCommand(CMD_SET_AMP, Buffer.from([enable ? 1 : 0]))
  return status === STATUS_OK
}

export async function deleteBoardProfile(id: string): Promise<boolean> {
  const slotId = parseInt(id, 10)
  if (isNaN(slotId) || slotId < 0 || slotId >= 10) return false

  const { status } = await sendCommand(CMD_DELETE_PROFILE, Buffer.from([slotId]))
  if (status !== STATUS_OK) return false

  // Check if any profiles remain; if not, explicitly set active to OFF (0xFF)
  // so the board properly switches to legacy bass/treble mode
  const remaining = await listBoardProfiles()
  if (remaining.length === 0) {
    await sendCommand(CMD_SET_ACTIVE, Buffer.from([0xff]))
  }

  const { status: flashStatus } = await sendCommand(CMD_SAVE_TO_FLASH)
  return flashStatus === STATUS_OK
}
