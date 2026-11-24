import { describe, expect, it } from 'vitest'
import { buildNmapCommand, DEFAULT_OPTIONS, validatePortList, validateTarget } from '../nmap'
import { matchesPort, PORT_PRESETS, PORTS } from '../ports'

const preset = (id: string) => PORT_PRESETS.find((p) => p.id === id)!
const base = { ...DEFAULT_OPTIONS, preset: preset('common') }

describe('validateTarget', () => {
    it('accepts hosts, addresses and CIDR ranges', () => {
        for (const t of ['scanme.nmap.org', '192.168.1.0/24', '10.0.0.5', '2001:db8::1', 'host_1.local']) expect(validateTarget(t)).toEqual({ ok: true, value: t })
    })

    it('refuses anything a shell or Nmap would read as syntax', () => {
        for (const t of ['', '  ', 'a b', 'a;rm -rf /', 'a && b', '$(id)', '`id`', 'a|b', "a'b", 'a"b', '-oN /etc/x', '--script=x', 'a\nb', 'a>b', '*.example.com']) {
            expect(validateTarget(t).ok, JSON.stringify(t)).toBe(false)
        }
    })
})

describe('validatePortList', () => {
    it('accepts ports and ranges', () => {
        expect(validatePortList('22, 80,443,8000-8100')).toEqual({ ok: true, value: '22,80,443,8000-8100' })
    })

    it('refuses bad ports', () => {
        for (const p of ['', '0', '65536', '80-70', 'a', '1;2', '22,,80x', '-1']) expect(validatePortList(p).ok, p).toBe(false)
        expect(validatePortList(Array.from({ length: 101 }, (_, i) => i + 1).join(',')).ok).toBe(false)
    })
})

describe('buildNmapCommand', () => {
    it('builds a command with the chosen options', () => {
        expect(buildNmapCommand({ ...base, target: 'example.com' })).toBe('nmap -sT -sV -T3 -p 21,22,23,25,53,80,110,143,443,445,993,995,1433,3306,3389,5432,5900,6379,8080,8443 example.com')
        expect(buildNmapCommand({ ...base, target: '10.0.0.0/24', preset: preset('top100'), scanType: 'syn', skipPing: true, defaultScripts: true, serviceVersion: false, timing: 'T4', saveOutput: true }))
            .toBe('nmap -sS -Pn -sC -T4 --top-ports 100 -oA scan-results 10.0.0.0/24')
        expect(buildNmapCommand({ ...base, target: 'example.com', preset: preset('all'), scanType: 'udp' })).toContain('-p- ')
    })

    it('keeps placeholders when the input is unusable, never the raw text', () => {
        const cmd = buildNmapCommand({ ...base, target: 'a; rm -rf /' })
        expect(cmd.endsWith('<target>')).toBe(true)
        expect(cmd).not.toContain('rm')
        const custom = buildNmapCommand({ ...base, target: 'example.com', preset: { id: 'custom', label: 'Custom', ports: [] }, customPorts: '22; reboot' })
        expect(custom).toContain('-p <ports>')
        expect(custom).not.toContain('reboot')
        expect(buildNmapCommand({ ...base, target: 'example.com', preset: { id: 'custom', label: 'Custom', ports: [] }, customPorts: '22, 8000-8100' })).toContain('-p 22,8000-8100 example.com')
    })
})

describe('port reference', () => {
    it('has unique ports and searchable rows', () => {
        expect(new Set(PORTS.map((p) => p.port)).size).toBe(PORTS.length)
        expect(PORTS.filter((p) => matchesPort(p, '443')).map((p) => p.service)).toEqual(['HTTPS'])
        expect(PORTS.some((p) => matchesPort(p, 'database'))).toBe(true)
        expect(PORTS.every((p) => matchesPort(p, ''))).toBe(true)
    })
})
