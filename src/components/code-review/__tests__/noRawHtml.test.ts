// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..', '..')
const DIRS = ['components/code-review', 'app/code-review', 'app/admin/code-review']

function sources(dir: string): string[] {
    if (!existsSync(dir)) return []
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (name === '__tests__') return []
        if (statSync(path).isDirectory()) return sources(path)
        return /\.(tsx?|jsx?)$/.test(name) ? [path] : []
    })
}

const files = DIRS.flatMap((d) => sources(join(ROOT, d)))
const rel = (f: string) => relative(ROOT, f)

describe('the code to review is never put in the page as HTML', () => {
    it('finds the code review sources', () => {
        expect(files.length).toBeGreaterThan(30)
    })

    it('uses dangerouslySetInnerHTML in one component only: the sanitised markdown', () => {
        const users = files.filter((f) => /dangerouslySetInnerHTML/.test(readFileSync(f, 'utf8'))).map(rel)
        expect(users).toEqual(['components/code-review/CrMarkdown.tsx'])
    })

    it('sends everything that component renders through the escape-first path and both sanitisers', () => {
        const source = readFileSync(join(ROOT, 'components/code-review/CrMarkdown.tsx'), 'utf8')
        expect(source).toMatch(/renderMarkdownSegments/)
        expect(source).toMatch(/sanitizeLabHtml/)
        expect(source).toMatch(/DOMPurify/)
        expect(source.match(/dangerouslySetInnerHTML/g)).toHaveLength(1)
    })

    it('never gives the code, the fixed code or the exploit to the markdown component', () => {
        for (const file of files) {
            const text = readFileSync(file, 'utf8')
            const uses = text.match(/<CrMarkdown[^>]*>/g) ?? []
            for (const use of uses) {
                expect(use, `${rel(file)}: ${use}`).not.toMatch(/vulnerableCode|fixedCode|exploitedCode|fixedExploitedCode|\.payload|\.code\b/)
            }
        }
    })

    it('does not set innerHTML, outerHTML or insertAdjacentHTML, and does not write documents or eval', () => {
        for (const file of files) {
            const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
            expect(text, rel(file)).not.toMatch(/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(/)
        }
    })

    it('does not use the old highlighter or the deleted local data', () => {
        for (const file of files) {
            const text = readFileSync(file, 'utf8')
            expect(text, rel(file)).not.toMatch(/prism-react-renderer|CodeHighlight|@\/data\/codeSnippets/)
        }
    })

    it('has no local copy of the exercises', () => {
        expect(() => statSync(join(ROOT, 'data/codeSnippets.ts'))).toThrow()
        expect(() => statSync(join(ROOT, 'components/code/CodeHighlight.tsx'))).toThrow()
    })
})
