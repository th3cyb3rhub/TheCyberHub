import { describe, it, expect } from 'vitest'
import { assessPassword } from '../passwordStrength'

describe('assessPassword', () => {
    it('asks for a password when the field is empty', () => {
        expect(assessPassword('')).toMatchObject({ level: 0, label: 'Enter a password' })
    })

    it('calls a short password weak whatever it contains', () => {
        expect(assessPassword('aA1!').level).toBe(1)
        expect(assessPassword('aA1!').missing).toEqual(['8+ characters'])
    })

    it('lists what is still missing of the form rules', () => {
        const result = assessPassword('longenoughpassphrase')
        expect(result.missing).toEqual(['uppercase letter', 'number', 'special character'])
        expect(result.checks.find((c) => c.id === 'lower')?.met).toBe(true)
    })

    it('never rates a password that breaks a rule better than fair', () => {
        expect(assessPassword('correct horse battery staple extra long').level).toBeLessThanOrEqual(2)
    })

    it('rates a long password with every class strong', () => {
        const result = assessPassword('Tr1cky-Horse-Staple-9')
        expect(result).toMatchObject({ level: 4, label: 'Strong', missing: [] })
    })

    it('does not reward repeats or well-known words', () => {
        expect(assessPassword('Password1!').level).toBeLessThan(assessPassword('Quartz7!Meadow').level)
        expect(assessPassword('Aaaaaaa1!').level).toBeLessThan(assessPassword('Axbycz1!').level)
    })
})
