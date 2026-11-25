// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The server sends the shell with the theme class of the visitor's stored choice already on `<html>`
 * (an inline script), but the React theme value only catches up after hydration, and not at all without
 * JavaScript. Styling that picks classes from that value is therefore wrong before then (and for good with
 * scripts off). The shell styles itself with Tailwind's `dark:` variants, which follow the class.
 */
const SRC = join(__dirname, '..', '..')

function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path)
        return /\.tsx?$/.test(name) ? [path] : []
    })
}

describe('theme dependent styling', () => {
    const sources = files(join(SRC, 'components')).concat(files(join(SRC, 'app'))).map((path) => ({ path, text: readFileSync(path, 'utf8') }))

    it('is done with dark: variants, never by branching on the theme value in a component', () => {
        const offenders = sources.filter(({ text }) => /\btheme\s*[!=]==?\s*['"](dark|light)['"]/.test(text)).map(({ path }) => path.replace(SRC, 'src'))
        expect(offenders).toEqual([])
    })

    it('the navbar draws both theme icons and lets the theme class show one', () => {
        const navbar = readFileSync(join(SRC, 'components/Navbar.tsx'), 'utf8')
        expect(navbar).toMatch(/<Sun className="hidden dark:block/)
        expect(navbar).toMatch(/<Moon className="block dark:hidden/)
    })
})
