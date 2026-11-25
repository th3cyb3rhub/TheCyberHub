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

    it('the header, its dropdown and the mobile menu have no classes that only work on a dark page', () => {
        // Light text and see-through white hovers are invisible on the light page unless a dark: variant carries them
        const darkOnly = /(?<![\w:-])(text-gray-300|text-white|hover:text-white|hover:bg-white\/\d+|border-white\/\d+|text-(?:red|cyan|indigo|yellow|orange)-[34]00)(?![\w/-])/g
        const offenders: string[] = []
        for (const file of ['components/Navbar.tsx', 'components/navbar/MobileMenu.tsx', 'components/navbar/UserDropdown.tsx']) {
            const text = readFileSync(join(SRC, file), 'utf8')
            for (const match of Array.from(text.matchAll(darkOnly))) {
                // text-white is fine on a coloured badge or button: those lines say so with a bg- colour class
                const line = text.slice(text.lastIndexOf('\n', match.index) + 1, text.indexOf('\n', match.index))
                if (match[1] === 'text-white' && /\bbg-(?:red|orange|gradient)/.test(line)) continue
                offenders.push(`${file}: ${match[1]}`)
            }
        }
        expect(offenders).toEqual([])
    })
})
