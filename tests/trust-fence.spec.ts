import { describe, expect, it } from 'vitest'
import { isLoopbackHostname, isTrustedAudioRequest } from '../src/trust-fence.ts'

const request = (headers: Record<string, string>) => ({ headers })

describe('isLoopbackHostname', () => {
  it('recognizes loopback authorities', () => {
    expect(isLoopbackHostname('localhost')).toBe(true)
    expect(isLoopbackHostname('[::1]')).toBe(true)
    expect(isLoopbackHostname('127.0.0.1')).toBe(true)
    expect(isLoopbackHostname('127.10.20.30')).toBe(true)
    expect(isLoopbackHostname('127.0.0.1.evil.com')).toBe(false)
    expect(isLoopbackHostname('127.0.0.999')).toBe(false)
    expect(isLoopbackHostname('example.com')).toBe(false)
  })
})

describe('isTrustedAudioRequest', () => {
  it('admits a same-origin page on loopback', () => {
    expect(isTrustedAudioRequest(request({
      host: '127.0.0.1:3080',
      origin: 'http://127.0.0.1:3080',
      'sec-fetch-site': 'same-origin',
    }), [])).toBe(true)
  })

  it('admits a non-browser client that sends no Origin', () => {
    expect(isTrustedAudioRequest(request({ host: 'localhost:3080' }), [])).toBe(true)
  })

  it('refuses a cross-site marker', () => {
    expect(isTrustedAudioRequest(request({
      host: '127.0.0.1:3080',
      origin: 'https://evil.example',
      'sec-fetch-site': 'cross-site',
    }), [])).toBe(false)
  })

  it('refuses an Origin that names another host', () => {
    expect(isTrustedAudioRequest(request({
      host: '127.0.0.1:3080',
      origin: 'https://evil.example',
    }), [])).toBe(false)
  })

  it('refuses an opaque Origin', () => {
    expect(isTrustedAudioRequest(request({ host: '127.0.0.1:3080', origin: 'null' }), [])).toBe(false)
  })

  it('refuses a foreign Host unless it is a configured trusted authority', () => {
    expect(isTrustedAudioRequest(request({ host: 'evil.example' }), [])).toBe(false)
    expect(isTrustedAudioRequest(request({ host: 'lan.example:3080' }), ['lan.example:3080'])).toBe(true)
    // A port-less entry matches any port of that authority.
    expect(isTrustedAudioRequest(request({ host: 'lan.example:9999' }), ['lan.example'])).toBe(true)
  })

  it('admits the desktop shell origin (its Host is still loopback)', () => {
    expect(isTrustedAudioRequest(request({ host: '127.0.0.1:3080', origin: 'dsh-app://app' }), [])).toBe(true)
    // …but never on a foreign Host.
    expect(isTrustedAudioRequest(request({ host: 'evil.example', origin: 'dsh-app://app' }), [])).toBe(false)
  })

  it('refuses a request without a Host header', () => {
    expect(isTrustedAudioRequest(request({}), [])).toBe(false)
  })
})
